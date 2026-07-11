# app/services/brightspace_client.py
"""
Cliente HTTP delgado sobre la API de Brightspace (LE/LP).

Resuelve el access_token desde:
  1. dict `tokens` pasado explicitamente al constructor (legacy / jobs).
  2. Header Authorization: Bearer <session_id> (cross-domain SPA).
  3. Cookie gemelo_session_id (mismo dominio).

Antes de cada llamada HTTP a Brightspace, si la sesion del usuario tiene
refresh_token y el access_token esta por expirar (< REFRESH_THRESHOLD_SECONDS
de vida restante), automaticamente mintea uno nuevo via Brightspace OAuth
y actualiza SESSION_STORE. Asi una sesion del SPA no muere a la hora aunque
el usuario deje el dashboard idle por horas.
"""
from __future__ import annotations

import os
import asyncio
import logging
import random
import time
from typing import Any, Dict, Optional, List, Union

import httpx
from fastapi import Request, HTTPException

#|---------- Cliente HTTP compartido (connection pooling) ----------|
# Un AsyncClient por proceso evita abrir/cerrar conexiones TCP en cada request.
# limits: max 20 conexiones totales, 10 por host (Brightspace).
# timeout: 30s por defecto, sobrescribible en _request_json.
_HTTP_CLIENT: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    """Devuelve el cliente httpx singleton, creándolo si no existe."""
    global _HTTP_CLIENT
    if _HTTP_CLIENT is None or _HTTP_CLIENT.is_closed:
        _HTTP_CLIENT = httpx.AsyncClient(
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            timeout=httpx.Timeout(30.0),
        )
    return _HTTP_CLIENT

from app.state import (
    get_access_token,
    get_session,
    update_session_tokens,
)
from app.services.brightspace_auth import mint_access_token_from_refresh

logger = logging.getLogger("uvicorn.error")

JsonType = Union[Dict[str, Any], List[Any]]

#|---------- Constantes de modulo ----------|
# Cookie que main.py setea al final del OAuth callback. Tiene que matchear.
SESSION_COOKIE = "gemelo_session_id"

# Si al access_token le quedan menos de estos segundos de vida, refrescamos
# proactivamente antes de hacer la request. 5 min da margen para que la
# request en si no termine con un token expirado a mitad de camino.
REFRESH_THRESHOLD_SECONDS = 300

# Timeout por request a Brightspace. Para syncs largos se puede subir via env
# (p.ej. BRIGHTSPACE_TIMEOUT_SECONDS=120) sin tocar codigo.
DEFAULT_TIMEOUT_SECONDS = float(os.getenv("BRIGHTSPACE_TIMEOUT_SECONDS", "30"))

# Reintentos ante fallos transitorios (red, 429, 5xx). Solo aplica a GET.
MAX_RETRIES = max(1, int(os.getenv("BRIGHTSPACE_MAX_RETRIES", "3")))
RETRY_BACKOFF_BASE_SECONDS = 0.5


#|---------- Helpers de extraccion del session_id ----------|
def _extract_session_id(request: Optional[Request]) -> Optional[str]:
    """Saca el session_id de la cookie de la request."""
    if request is None:
        return None
    return request.cookies.get(SESSION_COOKIE)


def _extract_session_id_any(request: Optional[Request]) -> Optional[str]:
    """
    Saca el session_id desde el header Authorization: Bearer <sid> o, si
    no esta en el header, desde la cookie. Util cuando necesitamos el sid
    para actualizar SESSION_STORE despues de un refresh.
    """
    if request is None:
        return None

    # Authorization: Bearer <session_id>
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        sid = auth_header[7:].strip()
        if sid:
            return sid

    # Cookie
    return _extract_session_id(request)


#|---------- Resolucion de token (path sincrono — legacy y para tareas BG) ----------|
def _resolve_token(request: Optional[Request], tokens: Optional[Dict[str, Any]]) -> str:
    """
    Resuelve el access_token con esta prioridad:
      1. tokens dict explicito (legacy / BackgroundTask con token capturado).
      2. Authorization: Bearer <session_id> header.
      3. Cookie gemelo_session_id.

    No hace refresh — solo retorna el token actual. Para refresh proactivo
    ver `_resolve_token_with_refresh()` (async) que se usa antes de cada
    request HTTP a Brightspace dentro de `_request_json()`.

    Lanza 401 si no encuentra ningun token.
    """
    # 1. dict explicito (legacy)
    if tokens:
        t = tokens.get("access_token")
        if t:
            return t

    if request:
        # 2. Authorization: Bearer <session_id> header
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            sid_from_header = auth_header[7:].strip()
            if sid_from_header:
                t = get_access_token(sid_from_header)
                if t:
                    return t

        # 3. Cookie de sesion
        sid = _extract_session_id(request)
        if sid:
            t = get_access_token(sid)
            if t:
                return t

    raise HTTPException(
        status_code=401,
        detail=(
            "No autenticado. "
            "Inicia sesion en /auth/brightspace/login "
            "o accede desde Brightspace mediante LTI."
        ),
    )


#|---------- BrightspaceClient: wrapper async sobre la API de Brightspace ----------|
class BrightspaceClient:
    """
    Wrapper httpx-async para la API de Brightspace.

    Usage normal (FastAPI dep):
        bs = BrightspaceClient(request=request)   # via Depends
        await bs.list_classlist(orgUnitId)

    Usage para BackgroundTask / cron:
        bs = BrightspaceClient(tokens={"access_token": "..."})
    """

    def __init__(
        self,
        tokens: Optional[Dict[str, Any]] = None,
        request: Optional[Request] = None,
    ):
        self.base_url = os.getenv("BRIGHTSPACE_BASE_URL", "").rstrip("/")
        self.lp_version   = os.getenv("BRIGHTSPACE_LP_VERSION",    "1.50")
        self.grade_version = os.getenv("BRIGHTSPACE_GRADE_VERSION", "1.50")
        self.lo_version    = os.getenv("BRIGHTSPACE_LO_VERSION",    "1.92")
        # El endpoint /lo/alignments/ requiere version 1.93+ (LMS v20.26.4+).
        # Se mantiene separado de lo_version (1.92) para no romper outcomeSets.
        self.align_version = os.getenv("BRIGHTSPACE_ALIGN_VERSION", "1.93")
        self.quiz_version  = os.getenv("BRIGHTSPACE_QUIZ_VERSION",  "1.93")

        self._tokens  = tokens or {}
        self._request = request

        if not self.base_url:
            raise RuntimeError("Falta BRIGHTSPACE_BASE_URL en variables de entorno")

    #|---------- Resolucion de auth headers (sincrono — sin refresh) ----------|
    def _auth_headers(self) -> Dict[str, str]:
        """
        Construye el header Authorization sin refrescar. Lo usa el path
        sincrono (BackgroundTask helpers que necesitan capturar un token
        para usarlo despues).
        """
        token = _resolve_token(self._request, self._tokens)
        return {"Authorization": f"Bearer {token}"}

    #|---------- Resolucion de auth headers con refresh proactivo (async) ----------|
    async def _auth_headers_with_refresh(self) -> Dict[str, str]:
        """
        Igual que `_auth_headers()` pero con refresh proactivo:

        1. Si tenemos session_id (cookie o Bearer), miramos la sesion en
           SESSION_STORE.
        2. Si la sesion existe, tiene refresh_token, y al access_token le
           quedan < REFRESH_THRESHOLD_SECONDS de vida → mintamos uno nuevo
           y actualizamos SESSION_STORE.
        3. Si no hay session_id (caso legacy con `tokens` dict explicito)
           o el refresh falla, caemos al path sincrono `_auth_headers()`.

        Es lo que se llama desde `_request_json()` antes de cada llamada
        HTTP a Brightspace.
        """
        sid = _extract_session_id_any(self._request)
        if sid:
            session = get_session(sid)
            if session:
                expires_at = float(session.get("expires_at") or 0)
                refresh_token = session.get("refresh_token")
                seconds_left = expires_at - time.time()

                #|-------- Solo refrescar si hay refresh_token Y el token va a expirar pronto --------|
                if refresh_token and seconds_left < REFRESH_THRESHOLD_SECONDS:
                    logger.info(
                        "Refrescando access_token (sid=%s, seconds_left=%.0f)",
                        sid[:8] + "...", seconds_left,
                    )
                    new_data = await mint_access_token_from_refresh(refresh_token)
                    if new_data:
                        # Actualiza SESSION_STORE para que las proximas
                        # requests usen el token nuevo sin refrescar otra vez.
                        update_session_tokens(sid, new_data)
                        return {"Authorization": f"Bearer {new_data['access_token']}"}
                    else:
                        # El refresh fallo (refresh_token revocado, red, etc).
                        # Caemos al token actual: si esta vencido Brightspace
                        # respondera 401 y el endpoint la propaga al usuario,
                        # quien tendra que relogearse.
                        logger.warning(
                            "Refresh fallo para sid=%s; usando access_token actual",
                            sid[:8] + "...",
                        )

        # Path por default: token actual (sea de session, tokens dict o lo que sea)
        return self._auth_headers()

    @staticmethod
    def _ensure_json(r: httpx.Response, url: str) -> None:
        if r.status_code != 200:
            raise RuntimeError(
                f"Brightspace error {r.status_code} en {url}: {r.text[:800]}"
            )
        ct = (r.headers.get("content-type") or "").lower()
        if "application/json" not in ct:
            raise RuntimeError(
                f"Respuesta no JSON ({r.status_code}) en {url}: {r.text[:300]}"
            )

    async def _request_json(
        self,
        method: str,
        url: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json_body: Any = None,
        timeout: float | None = None,
    ) -> JsonType:
        """
        Llama a Brightspace con auto-refresh de token si esta por expirar.

        Refresca proactivamente ANTES de hacer la request (no reactivo
        en 401) para evitar el round-trip extra del retry. El refresh
        solo aplica a sesiones de usuario (donde tenemos refresh_token);
        las llamadas con `tokens` dict explicito siguen como antes.

        Los GET reintentan hasta MAX_RETRIES veces con backoff exponencial
        + jitter ante errores de red, 429 (respetando Retry-After) y 5xx.
        """
        headers = await self._auth_headers_with_refresh()
        client = get_http_client()
        _timeout = httpx.Timeout(float(timeout or DEFAULT_TIMEOUT_SECONDS))
        retries = MAX_RETRIES if method.upper() == "GET" else 1

        r: httpx.Response | None = None
        last_exc: Exception | None = None
        for attempt in range(retries):
            try:
                r = await client.request(
                    method, url, headers=headers, params=params,
                    json=json_body, timeout=_timeout,
                )
                last_exc = None
            except httpx.TransportError as exc:
                last_exc = exc
                r = None
            else:
                if r.status_code != 429 and r.status_code < 500:
                    break  # respuesta definitiva (2xx/3xx/4xx): no reintentar

            if attempt + 1 >= retries:
                break
            delay = RETRY_BACKOFF_BASE_SECONDS * (2 ** attempt) + random.uniform(0, 0.3)
            if r is not None and r.status_code == 429:
                retry_after = r.headers.get("Retry-After")
                try:
                    delay = max(delay, float(retry_after))
                except (TypeError, ValueError):
                    pass
            logger.warning(
                "Brightspace retry %d/%d en %s (%s); esperando %.1fs",
                attempt + 1, retries - 1, url,
                last_exc or f"HTTP {r.status_code}", delay,
            )
            await asyncio.sleep(delay)

        if r is None:
            raise RuntimeError(
                f"Brightspace no respondio tras {retries} intentos en {url}: {last_exc}"
            )
        self._ensure_json(r, url)
        return r.json()

    @staticmethod
    def _as_list_of_dicts(data: JsonType) -> List[Dict[str, Any]]:
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
        if isinstance(data, dict):
            for k in ("Items", "items", "Objects", "objects"):
                v = data.get(k)
                if isinstance(v, list):
                    return [x for x in v if isinstance(x, dict)]
        return []

    # ── Gradebook ─────────────────────────────────────────────────────────────
    async def list_grade_items(self, orgUnitId: int) -> List[Dict[str, Any]]:
        url = f"{self.base_url}/d2l/api/le/{self.grade_version}/{orgUnitId}/grades/"
        data = await self._request_json("GET", url)
        return self._as_list_of_dicts(data)

    async def list_grade_categories(self, orgUnitId: int) -> List[Dict[str, Any]]:
        """Fetch grade categories (Parcial 1, Quizzes, etc.) for a course.
        Returns [] if the tenant doesn't expose them or on error."""
        url = (
            f"{self.base_url}/d2l/api/le/{self.grade_version}/{orgUnitId}"
            f"/grades/categories/"
        )
        try:
            data = await self._request_json("GET", url)
            return self._as_list_of_dicts(data)
        except Exception:
            return []

    async def get_grade_value(
        self, orgUnitId: int, gradeObjectId: int, userId: int
    ) -> Dict[str, Any]:
        url = (
            f"{self.base_url}/d2l/api/le/{self.grade_version}/{orgUnitId}"
            f"/grades/{int(gradeObjectId)}/values/{int(userId)}"
        )
        data = await self._request_json("GET", url)
        return data if isinstance(data, dict) else {"data": data}

    async def list_grade_values_for_user(
        self, orgUnitId: int, userId: int
    ) -> List[Dict[str, Any]]:
        url = (
            f"{self.base_url}/d2l/api/le/{self.grade_version}/{orgUnitId}"
            f"/grades/values/{int(userId)}/"
        )
        data = await self._request_json("GET", url)
        return self._as_list_of_dicts(data)

    # ── Classlist / Dropbox ───────────────────────────────────────────────────
    async def list_classlist(self, orgUnitId: int) -> List[Dict[str, Any]]:
        url = (
            f"{self.base_url}/d2l/api/le/{self.lp_version}/{orgUnitId}/classlist/"
        )
        data = await self._request_json("GET", url)
        return self._as_list_of_dicts(data)

    async def list_dropbox_folders(self, orgUnitId: int) -> JsonType:
        url = (
            f"{self.base_url}/d2l/api/le/{self.lp_version}/{orgUnitId}"
            f"/dropbox/folders/"
        )
        return await self._request_json("GET", url)

    async def list_dropbox_submissions_for_user(
        self,
        orgUnitId: int,
        folderId: int,
        userId: int,
    ) -> List[Dict[str, Any]]:
        url = (
            f"{self.base_url}/d2l/api/le/{self.lp_version}/{orgUnitId}"
            f"/dropbox/folders/{int(folderId)}/submissions/"
        )
        data = await self._request_json("GET", url)
        items = self._as_list_of_dicts(data)
        result = []
        for sub in items:
            entity_id = sub.get("EntityId") or sub.get("UserId") or sub.get("userId")
            try:
                if int(entity_id) == int(userId):
                    result.append(sub)
            except Exception:
                continue
        return result

    async def get_dropbox_rubric_assessment(
        self,
        orgUnitId: int,
        folderId: int,
        rubricId: int,
        userId: int,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/d2l/api/le/unstable/{orgUnitId}/assessment"
        params = {
            "assessmentType": "Rubric",
            "objectType":     "Dropbox",
            "objectId":       str(folderId),
            "rubricId":       str(rubricId),
            "userId":         str(userId),
        }
        data = await self._request_json("GET", url, params=params)
        return data if isinstance(data, dict) else {"data": data}

    # ── Learning Outcomes ─────────────────────────────────────────────────────
    async def list_outcome_sets(self, orgUnitId: int) -> JsonType:
        url = (
            f"{self.base_url}/d2l/api/le/{self.lo_version}/{orgUnitId}"
            f"/lo/outcomeSets/"
        )
        return await self._request_json("GET", url)

    async def list_alignments(self, orgUnitId: int) -> List[Dict[str, Any]]:
        """
        Trae TODAS las alineaciones (BulkAlignment) del curso en una sola
        llamada al endpoint bulk `/lo/alignments/`.

        Cada BulkAlignment relaciona un ActivityType + ObjectId (para rubricas
        el ObjectId es `{rubricId}_R_{criterionId}`) con el OutcomeId del
        resultado de aprendizaje alineado. Es el UNICO puente disponible
        entre criterio de rubrica y outcome (CriteriaOutcome no trae OutcomeId).

        Requiere version 1.93+ y scope outcomes:alignments:read. Devuelve []
        si el tenant no lo expone (404) o falta el scope (403).
        """
        url = (
            f"{self.base_url}/d2l/api/le/{self.align_version}/{orgUnitId}"
            f"/lo/alignments/"
        )
        try:
            data = await self._request_json("GET", url)
        except HTTPException as exc:
            logger.warning("list_alignments %s fallo: %s", orgUnitId, exc.detail)
            return []
        except Exception as exc:  # noqa: BLE001
            logger.warning("list_alignments %s error: %s", orgUnitId, exc)
            return []
        return self._as_list_of_dicts(data)

    async def list_outcome_registry(self) -> List[Dict[str, Any]]:
        """
        Registro GLOBAL de conjuntos de RA a nivel tenant (no por curso).

        GET /d2l/api/le/{lo_version}/lo/outcomeSets/
        Requiere scope outcomes:sets:read. Devuelve la lista completa de
        OutcomeSet: {OutcomeSetId, Name, Outcomes:[{OutcomeId, ShortCode,
        Description, Children:[...]}]}. Es lo que la coordinadora edita en
        la sección /d2l/le/{ou}/lo/programs/ de Brightspace.
        Devuelve [] ante error/404.
        """
        url = f"{self.base_url}/d2l/api/le/{self.lo_version}/lo/outcomeSets/"
        try:
            data = await self._request_json("GET", url)
        except HTTPException as exc:
            logger.warning("list_outcome_registry fallo: %s", exc.detail)
            return []
        except Exception as exc:  # noqa: BLE001
            logger.warning("list_outcome_registry error: %s", exc)
            return []
        return self._as_list_of_dicts(data)

    # ── Edición de RA (descripciones) — scope outcomes:sets:manage ────────────
    async def _raw_request(
        self,
        method: str,
        url: str,
        *,
        json_body: Any = None,
        params: Optional[Dict[str, Any]] = None,
        timeout: float = 30.0,
    ) -> Dict[str, Any]:
        """
        Request cruda que NO lanza ante error: devuelve {status, ok, json, text}.
        A diferencia de `_request_json` (que lanza RuntimeError en no-200), esto
        preserva el status exacto de Brightspace para diagnosticar escrituras
        (PUT/POST) desde la UI (igual que `probe_get` pero soporta method+body).
        """
        try:
            headers = await self._auth_headers_with_refresh()
            client = get_http_client()
            r = await client.request(
                method, url, headers=headers, params=params or {},
                json=json_body, timeout=httpx.Timeout(timeout),
            )
        except Exception as e:  # noqa: BLE001
            return {"status": None, "ok": False, "error": str(e)[:400], "json": None, "text": None}
        ct = (r.headers.get("content-type") or "").lower()
        body_json: Any = None
        body_text: Optional[str] = None
        if "application/json" in ct:
            try:
                body_json = r.json()
            except Exception:  # noqa: BLE001
                body_text = r.text[:800]
        else:
            body_text = r.text[:800]
        return {
            "status": r.status_code,
            "ok": 200 <= r.status_code < 300,
            "json": body_json,
            "text": body_text,
        }

    def _find_outcome_in_tree(
        self, outcomes: Any, outcome_id: str
    ) -> Optional[Dict[str, Any]]:
        """Busca (recursivo por Children) un outcome por OutcomeId dentro de un set crudo."""
        for o in outcomes or []:
            if not isinstance(o, dict):
                continue
            if str(o.get("OutcomeId")) == str(outcome_id):
                return o
            hit = self._find_outcome_in_tree(o.get("Children"), outcome_id)
            if hit is not None:
                return hit
        return None

    @staticmethod
    def _set_outcome_description(outcome: Dict[str, Any], new_text: str) -> None:
        """Actualiza Description preservando su forma (RichText {Text,Html} o string plano)."""
        cur = outcome.get("Description")
        if isinstance(cur, dict):
            cur["Text"] = new_text
            # Html en sincronía con el texto plano (sin markup).
            cur["Html"] = new_text
            outcome["Description"] = cur
        else:
            outcome["Description"] = new_text

    async def get_outcome_set_raw(
        self, set_id: Any
    ) -> tuple[Optional[Dict[str, Any]], str, str, Any]:
        """
        Trae un conjunto de RA CRUDO (sin normalizar).

        Intenta la ruta de un solo conjunto
        (GET /d2l/api/le/{lo}/lo/outcomeSets/{setId}); si el tenant no la expone,
        cae a escanear la colección completa.

        Devuelve (set|None, url_del_set, source, single_status) donde source es
        "single" (la ruta de un solo set funcionó), "collection" (fallback) o
        "none". single_status es el HTTP de la ruta de un solo set (para saber si
        el PUT a esa misma URL tiene sentido).
        """
        single = f"{self.base_url}/d2l/api/le/{self.lo_version}/lo/outcomeSets/{set_id}"
        res = await self._raw_request("GET", single)
        single_status = res.get("status")
        j = res.get("json")
        if res.get("ok") and isinstance(j, dict) and j.get("Outcomes") is not None:
            return j, single, "single", single_status
        for s in await self.list_outcome_registry():
            if str(s.get("OutcomeSetId")) == str(set_id):
                return s, single, "collection", single_status
        return None, single, "none", single_status

    def _describe_outcome_text(self, raw_set: Optional[Dict[str, Any]], outcome_id: str) -> Any:
        """Extrae la Description (cruda) de un outcome dentro de un set, o None."""
        if not raw_set:
            return None
        t = self._find_outcome_in_tree(raw_set.get("Outcomes"), outcome_id)
        return t.get("Description") if t else None

    async def update_outcome_description(
        self,
        set_id: Any,
        outcome_id: str,
        new_description: str,
        *,
        dry_run: bool = True,
    ) -> Dict[str, Any]:
        """
        Edita la descripción de un RA (read-modify-write del conjunto completo).

        1. Trae el set crudo. 2. Localiza el outcome por OutcomeId. 3. Reemplaza
        su Description (preservando la forma). 4. Si dry_run=False, hace
        PUT /d2l/api/le/{lo}/lo/outcomeSets/{setId} con el objeto completo
        (scope outcomes:sets:manage). Con dry_run=True solo devuelve un preview
        (before/after) SIN escribir nada.

        Devuelve diagnóstico completo (ok, status, before, after, detail) para
        que la UI muestre exactamente qué respondió Brightspace.
        """
        raw, put_url, source, single_status = await self.get_outcome_set_raw(set_id)
        if raw is None:
            raise HTTPException(status_code=404, detail=f"No se encontró el conjunto de RA #{set_id}.")
        target = self._find_outcome_in_tree(raw.get("Outcomes"), outcome_id)
        if target is None:
            raise HTTPException(
                status_code=404,
                detail=f"El RA {outcome_id} no está en el conjunto #{set_id}.",
            )
        before = target.get("Description")
        self._set_outcome_description(target, str(new_description))
        after = target.get("Description")
        out: Dict[str, Any] = {
            "ok": False, "dryRun": bool(dry_run), "setId": set_id,
            "outcomeId": outcome_id, "before": before, "after": after, "putUrl": put_url,
            "source": source, "singleGetStatus": single_status,
        }
        if dry_run:
            out["ok"] = True
            out["status"] = None
            out["detail"] = "Vista previa: no se escribió nada en Brightspace."
            return out
        res = await self._raw_request("PUT", put_url, json_body=raw)
        out["status"] = res.get("status")
        out["detail"] = (
            res.get("json") if res.get("json") is not None
            else (res.get("text") or res.get("error"))
        )
        # ── Verificación de persistencia: re-leer el set y comparar ──
        # Un 200 de Brightspace NO garantiza que el cambio se guardó (los RA de
        # tipo LORES suelen ser inmutables via outcomeSets). Volvemos a leer y
        # comparamos el texto realmente almacenado.
        verify_raw, _u, verify_source, _s = await self.get_outcome_set_raw(set_id)
        persisted = self._describe_outcome_text(verify_raw, outcome_id)
        persisted_text = persisted.get("Text") if isinstance(persisted, dict) else persisted
        changed = str(persisted_text or "").strip() == str(new_description).strip()
        out["persisted"] = persisted_text
        out["persistedChanged"] = changed
        out["verifySource"] = verify_source
        # ok = el PUT respondió 2xx Y el cambio realmente quedó guardado.
        out["ok"] = bool(res.get("ok")) and changed
        if bool(res.get("ok")) and not changed:
            out["warning"] = (
                "Brightspace respondió 2xx pero el texto NO cambió al releer. "
                "Probablemente este RA es de tipo LORES (repositorio central) y no "
                "se puede editar via /lo/outcomeSets/. Habría que usar la API del "
                "repositorio de outcomes (LOR) u otra ruta."
            )
        return out

    # ── Import/Export de RA (bulkExport / bulkImport) ─────────────────────────
    @staticmethod
    def _count_import_outcomes(outcomes: Any) -> int:
        """Cuenta recursiva de outcomes (por Children) en un árbol import/export o crudo."""
        n = 0
        for o in outcomes or []:
            if isinstance(o, dict):
                n += 1 + BrightspaceClient._count_import_outcomes(o.get("Children"))
        return n

    @staticmethod
    def _summarize_course_sets(raw: Any) -> List[Dict[str, Any]]:
        """Resume los outcome sets de un curso: [{setId, name, outcomeCount}]."""
        if isinstance(raw, list):
            items = raw
        elif isinstance(raw, dict):
            items = raw.get("Items") or raw.get("Objects") or []
        else:
            items = []
        out: List[Dict[str, Any]] = []
        for s in items or []:
            if not isinstance(s, dict):
                continue
            out.append({
                "setId": s.get("OutcomeSetId"),
                "name": s.get("Name"),
                "importId": s.get("ImportId"),
                "outcomeCount": BrightspaceClient._count_import_outcomes(s.get("Outcomes")),
            })
        return out

    async def bulk_export_outcome_sets(
        self,
        org_unit_id: Optional[int] = None,
        outcome_set_ids: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Exporta outcome sets en formato ImportExportOutcomeSet (canónico para
        re-importar). Sin org_unit_id usa la ruta a nivel ORGANIZACIÓN (catálogo
        global); con org_unit_id exporta los del curso.

        POST /d2l/api/le/{lo}/lo/bulkExport             (org-level)
        POST /d2l/api/le/{lo}/{orgUnitId}/lo/bulkExport (curso)
        Query opcional outcomeSetIds (CSV). Scope outcomes:sets:export.
        NO lanza: devuelve {status, ok, url, sets|None, detail}.
        """
        if org_unit_id is not None:
            url = f"{self.base_url}/d2l/api/le/{self.lo_version}/{org_unit_id}/lo/bulkExport"
        else:
            url = f"{self.base_url}/d2l/api/le/{self.lo_version}/lo/bulkExport"
        params = {"outcomeSetIds": outcome_set_ids} if outcome_set_ids else None
        res = await self._raw_request("POST", url, params=params)
        sets = res.get("json") if isinstance(res.get("json"), list) else None
        return {
            "status": res.get("status"),
            "ok": bool(res.get("ok")) and sets is not None,
            "url": url,
            "sets": sets,
            "detail": (
                res.get("json") if res.get("json") is not None
                else (res.get("text") or res.get("error"))
            ),
        }

    async def bulk_import_outcome_sets(
        self,
        org_unit_id: Optional[int],
        sets: List[Dict[str, Any]],
        *,
        dry_run: bool = True,
    ) -> Dict[str, Any]:
        """
        Importa outcome sets (formato ImportExportOutcomeSet) a un curso, o al
        CATÁLOGO GLOBAL (nivel organización) si org_unit_id es None.

        POST /d2l/api/le/{lo}/{orgUnitId}/lo/bulkImport  (curso)
        POST /d2l/api/le/{lo}/lo/bulkImport              (organización)
        scope outcomes:sets:import
        Es un MERGE: nunca borra ni altera outcomes existentes; outcomes
        autorizados equivalentes (mismo source+shortcode+description+padre) se
        deduplican. Con dry_run=True solo devuelve el body que se enviaría.
        Tras importar (real) a un curso, re-lee sus outcome sets para verificar.
        """
        if org_unit_id is not None:
            url = f"{self.base_url}/d2l/api/le/{self.lo_version}/{org_unit_id}/lo/bulkImport"
        else:
            url = f"{self.base_url}/d2l/api/le/{self.lo_version}/lo/bulkImport"
        preview = {
            "setCount": len(sets),
            "names": [s.get("Name") for s in sets if isinstance(s, dict)],
            "importIds": [s.get("ImportId") for s in sets if isinstance(s, dict)],
            "outcomeCounts": [
                self._count_import_outcomes(s.get("Outcomes"))
                for s in sets if isinstance(s, dict)
            ],
        }
        out: Dict[str, Any] = {
            "dryRun": bool(dry_run), "orgUnitId": org_unit_id,
            "url": url, "preview": preview,
        }
        # Estado del curso ANTES (para comparar). A nivel organización no hay
        # curso que releer — se omite la comparación.
        if org_unit_id is not None:
            try:
                before = await self.list_outcome_sets(org_unit_id)
                out["courseSetsBefore"] = self._summarize_course_sets(before)
            except Exception as e:  # noqa: BLE001
                out["courseSetsBefore"] = {"error": str(e)[:300]}
        if dry_run:
            out["ok"] = True
            out["status"] = None
            out["body"] = sets
            out["detail"] = "Vista previa: no se importó nada (dry-run)."
            return out
        res = await self._raw_request("POST", url, json_body=sets)
        out["status"] = res.get("status")
        out["ok"] = bool(res.get("ok"))
        out["detail"] = (
            res.get("json") if res.get("json") is not None
            else (res.get("text") or res.get("error"))
        )
        # Verificación: re-leer los outcome sets del curso.
        if org_unit_id is not None:
            try:
                after = await self.list_outcome_sets(org_unit_id)
                out["courseSetsAfter"] = self._summarize_course_sets(after)
            except Exception as e:  # noqa: BLE001
                out["courseSetsAfter"] = {"error": str(e)[:300]}
        return out

    async def _paged_orgunits(
        self,
        url: str,
        params: Dict[str, Any],
        max_items: int = 2000,
        max_pages: int = 40,
    ) -> List[Dict[str, Any]]:
        """
        GET paginado (bookmark) sobre endpoints de orgstructure. Soporta tanto
        respuesta paginada (dict con Items + PagingInfo) como lista simple.
        """
        items: List[Dict[str, Any]] = []
        bookmark: Optional[str] = None
        for _ in range(max_pages):
            p = dict(params)
            if bookmark:
                p["bookmark"] = bookmark
            try:
                data = await self._request_json("GET", url, params=p)
            except HTTPException as exc:
                logger.warning("_paged_orgunits %s fallo: %s", url, exc.detail)
                break
            except Exception as exc:  # noqa: BLE001
                logger.warning("_paged_orgunits %s error: %s", url, exc)
                break
            if isinstance(data, list):
                items.extend(x for x in data if isinstance(x, dict))
                break  # lista simple: sin paginación
            if isinstance(data, dict):
                page = data.get("Items") or []
                items.extend(x for x in page if isinstance(x, dict))
                paging = data.get("PagingInfo") or {}
                if len(items) >= max_items or not paging.get("HasMoreItems"):
                    break
                bookmark = paging.get("Bookmark")
                if not bookmark:
                    break
            else:
                break
        return items[:max_items]

    async def search_orgunits(
        self,
        *,
        name: Optional[str] = None,
        code: Optional[str] = None,
        type_id: Optional[int] = None,
        max_items: int = 500,
    ) -> List[Dict[str, Any]]:
        """
        Busca unidades organizativas por nombre/código/tipo.
        GET /d2l/api/lp/{lp}/orgstructure/?orgUnitName=&orgUnitCode=&orgUnitType=
        Devuelve lista de OrgUnitProperties {Identifier, Name, Code, Type{...}}.
        """
        url = f"{self.base_url}/d2l/api/lp/{self.lp_version}/orgstructure/"
        params: Dict[str, Any] = {}
        if name:
            params["orgUnitName"] = name
        if code:
            params["orgUnitCode"] = code
        if type_id is not None:
            params["orgUnitType"] = type_id
        return await self._paged_orgunits(url, params, max_items=max_items)

    async def list_descendants(
        self,
        ou: int,
        *,
        ou_type_id: Optional[int] = None,
        max_items: int = 2000,
    ) -> List[Dict[str, Any]]:
        """
        Descendientes de una unidad (ej. cursos bajo un semestre).
        GET /d2l/api/lp/{lp}/orgstructure/{ou}/descendants/?ouTypeId=
        Si no se pasa ou_type_id, devuelve todos los descendientes (útil para
        descubrir qué tipos existen). Devuelve lista de OrgUnit.
        """
        url = f"{self.base_url}/d2l/api/lp/{self.lp_version}/orgstructure/{ou}/descendants/"
        params: Dict[str, Any] = {}
        if ou_type_id is not None:
            params["ouTypeId"] = ou_type_id
        return await self._paged_orgunits(url, params, max_items=max_items)

    async def update_activity_alignment(
        self,
        orgUnitId: int,
        activity_type: str,
        object_id: str,
        action: str,
        outcome_ids: List[str],
    ) -> List[Dict[str, Any]]:
        """
        Modifica (add/remove/replace) las alineaciones de RAs de una actividad.

        POST /d2l/api/le/{align_version}/{orgUnitId}
             /lo/alignments/activity/{activityType}/{objectId}
        Body Outcomes.UpdateAlignment:
            { "Action": "add"|"remove"|"replace", "OutcomeIds": ["<guid>", ...] }

        `object_id` es un D2LID de la actividad (ej. folderId de Assignment,
        quizId de Quiz), salvo para criterio de rúbrica donde tiene la forma
        "{rubricId}_R_{criterionId}" (esa ruta puede no estar disponible en
        este tenant; usar nivel de actividad).

        Requiere version 1.93+ y scope outcomes:alignments:manage. Devuelve
        el nuevo estado (array de Alignment: {OutcomeSetId, OutcomeId, Direct}).
        Lanza HTTPException con el status/detalle de Brightspace ante error
        (400 request inválido, 403 sin permiso/rúbrica bloqueada, etc.).
        """
        act = str(activity_type).strip()
        oid = str(object_id).strip()
        url = (
            f"{self.base_url}/d2l/api/le/{self.align_version}/{orgUnitId}"
            f"/lo/alignments/activity/{act}/{oid}"
        )
        body = {
            "Action": str(action).strip().lower(),
            "OutcomeIds": [str(o) for o in (outcome_ids or [])],
        }
        data = await self._request_json("POST", url, json_body=body)
        return self._as_list_of_dicts(data)

    async def probe_get(
        self,
        url: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        GET de diagnóstico que NO lanza ante error: devuelve status, tipo de
        contenido y una muestra del cuerpo. Sirve para sondear qué endpoints
        del registro global de outcomes existen en este tenant (igual que
        descubrimos el 1.93 de alignments).
        """
        try:
            headers = await self._auth_headers_with_refresh()
            client = get_http_client()
            r = await client.request(
                "GET", url, headers=headers, params=params or {},
                timeout=httpx.Timeout(20.0),
            )
        except Exception as e:  # noqa: BLE001
            return {"status": None, "error": str(e)[:300]}

        ct = (r.headers.get("content-type") or "")
        count: Optional[int] = None
        sample: Any
        if "application/json" in ct.lower():
            try:
                j = r.json()
                if isinstance(j, list):
                    count = len(j)
                    sample = j[:2]
                elif isinstance(j, dict):
                    sample = {k: j[k] for k in list(j.keys())[:10]}
                else:
                    sample = j
            except Exception:
                sample = r.text[:400]
        else:
            sample = r.text[:400]
        return {
            "status": r.status_code,
            "contentType": ct,
            "count": count,
            "sample": sample,
        }

    async def list_quizzes(self, orgUnitId: int) -> List[Dict[str, Any]]:
        """
        Lista los quizzes del curso. Cada quiz trae QuizId y GradeItemId
        (el objeto de calificacion asociado), con el que se obtiene el % por
        estudiante via /grades/values/. Se usa para mapear quiz->outcome
        (via /lo/alignments/) y calcular promedios de RA evaluados por quiz.

        Devuelve [] si el tenant no lo expone o ante error.
        """
        url = (
            f"{self.base_url}/d2l/api/le/{self.quiz_version}/{orgUnitId}"
            f"/quizzes/"
        )
        try:
            data = await self._request_json("GET", url)
        except HTTPException as exc:
            logger.warning("list_quizzes %s fallo: %s", orgUnitId, exc.detail)
            return []
        except Exception as exc:  # noqa: BLE001
            logger.warning("list_quizzes %s error: %s", orgUnitId, exc)
            return []
        return self._as_list_of_dicts(data)

    async def list_lo_alignments(self, orgUnitId: int) -> JsonType:
        """
        Devuelve los alignments (outcome → activity) del curso.
        Cada item trae al menos:
          - OutcomeId (uuid)
          - Activity: { Type, LmsObjectId, RubricId (nullable), QuestionId (nullable) }
        """
        url = (
            f"{self.base_url}/d2l/api/le/{self.lo_version}/{orgUnitId}"
            f"/lo/alignments/"
        )
        return await self._request_json("GET", url)


# ── Dependency FastAPI ────────────────────────────────────────────────────────
def get_brightspace_client(request: Request) -> BrightspaceClient:
    """
    Dependency de FastAPI. Crea un BrightspaceClient con el token
    de la sesión del usuario que hace la request.
    """
    return BrightspaceClient(request=request)