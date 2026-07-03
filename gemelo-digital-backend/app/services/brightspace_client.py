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
import logging
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
        timeout: int = 30,
    ) -> JsonType:
        """
        Llama a Brightspace con auto-refresh de token si esta por expirar.

        Refresca proactivamente ANTES de hacer la request (no reactivo
        en 401) para evitar el round-trip extra del retry. El refresh
        solo aplica a sesiones de usuario (donde tenemos refresh_token);
        las llamadas con `tokens` dict explicito siguen como antes.
        """
        headers = await self._auth_headers_with_refresh()
        client = get_http_client()
        r = await client.request(
            method, url, headers=headers, params=params,
            timeout=httpx.Timeout(float(timeout)),
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