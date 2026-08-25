# app/api/course_auth.py
"""Autorización por curso (fail-closed) para los endpoints DB-first.

Los endpoints /gemelo/course/{ou}/* sirven datos personales (nombres y
métricas de estudiantes) desde Postgres, donde Brightspace no puede aplicar
sus propios permisos. Este módulo resuelve el ROL REAL del usuario de la
sesión en ese curso — usando su propio token de Brightspace, así que solo
puede ver lo que Brightspace le deja ver de sí mismo — y lo convierte en
dependencies de FastAPI:

  - require_course_staff:  profesor del curso o superadmin.
  - require_course_member: cualquier matriculado en el curso (o superadmin).

Fail-closed: sin sesión → 401; sin matrícula en el curso → 403; rol
desconocido pero matriculado → se trata como estudiante (nunca como
profesor). El lookup usa _bs_get_cached (5 min por token), así que el costo
extra por request es una llamada cacheada.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import HTTPException, Request

from app.api.deps import (
    BRIGHTSPACE_BASE_URL, LP_VERSION,
    _require_token_from_request, _auth_headers, _bs_get_cached, _get_whoami_id,
)
from app.api.gemelo_admin import (
    _session_from_request, _SUPERADMIN_IDS, _ADMIN_ROLES,
)

# El orden importa: "Estudiante EF" debe caer en student aunque otra palabra
# coincida después. Un rol que no coincida con nada NO otorga privilegios de
# profesor (fail-closed) — pero sí membresía, porque la matrícula la afirma
# el propio Brightspace.
_STUDENT_KEYWORDS = ("estudiante", "student", "learner", "alumno")
_INSTRUCTOR_KEYWORDS = (
    "instructor", "profesor", "docente", "teacher", "facilitador",
    "coordinador", "admin",
)


def classify_role_name(role_name: Any) -> Optional[str]:
    """Clasifica un ClasslistRoleName de Brightspace en 'student'/'instructor'.

    Devuelve None para roles vacíos o desconocidos — el llamador decide qué
    hacer (get_course_access los trata como matrícula sin privilegios).
    """
    rn = str(role_name or "").strip().lower()
    if not rn:
        return None
    if any(k in rn for k in _STUDENT_KEYWORDS):
        return "student"
    if any(k in rn for k in _INSTRUCTOR_KEYWORDS):
        return "instructor"
    return None


async def _role_name_in_course(
    headers: dict, user_id: str, org_unit_id: int
) -> Optional[str]:
    """ClasslistRoleName del usuario en ese curso, o None si no está
    matriculado. Recorre las matrículas del PROPIO usuario (su token solo
    puede listar las suyas), con caché de 5 min por página."""
    bookmark = None
    for _ in range(10):  # hasta ~1000 matrículas
        url = (
            f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}"
            f"/enrollments/users/{user_id}/orgUnits/"
        )
        params: dict = {"orgUnitTypeId": 3}
        if bookmark:
            params["bookmark"] = bookmark
        status, data = await _bs_get_cached(url, headers, params)
        if status != 200 or not isinstance(data, dict):
            break
        for it in (data.get("Items") or []):
            if not isinstance(it, dict):
                continue
            ou = it.get("OrgUnit") or {}
            if str(ou.get("Id")) == str(org_unit_id):
                access = it.get("Access") or {}
                return access.get("ClasslistRoleName") or ""
        paging = data.get("PagingInfo") or {}
        if not paging.get("HasMoreItems"):
            break
        bookmark = paging.get("Bookmark")
    return None


def _is_super_admin_session(sess: Dict[str, Any]) -> bool:
    uid = str(sess.get("user_id") or "")
    role = str(sess.get("role") or "")
    return bool((uid and uid in _SUPERADMIN_IDS) or (role in _ADMIN_ROLES))


async def get_course_access(request: Request, org_unit_id: int) -> Dict[str, Any]:
    """Resuelve el acceso del usuario de la sesión a un curso concreto."""
    token, err = _require_token_from_request(request)
    if err:
        raise HTTPException(
            status_code=401,
            detail="No autenticado. Inicia sesión en /auth/brightspace/login",
        )
    sess = _session_from_request(request)
    is_super = _is_super_admin_session(sess)
    headers = _auth_headers(token)

    uid = str(sess.get("user_id") or "")
    if not uid:
        uid2, _err2 = await _get_whoami_id(headers)
        uid = str(uid2 or "")

    role: Optional[str] = None
    if not is_super and uid:
        role_name = await _role_name_in_course(headers, uid, org_unit_id)
        if role_name is not None:
            # Matriculado: rol desconocido NUNCA escala a profesor
            role = classify_role_name(role_name) or "student"

    return {
        "userId": uid,
        "isSuperAdmin": is_super,
        "role": role,
        "isInstructor": is_super or role == "instructor",
        "isMember": is_super or role is not None,
    }


# ── Dependencies (el nombre del parámetro debe coincidir con el path param) ──

async def require_course_staff(request: Request, orgUnitId: int) -> Dict[str, Any]:
    """Solo el profesor del curso o un administrador."""
    access = await get_course_access(request, orgUnitId)
    if not access["isInstructor"]:
        raise HTTPException(
            status_code=403,
            detail="Solo el profesor de este curso o un administrador puede ver esta información.",
        )
    return access


async def require_course_member(request: Request, orgUnitId: int) -> Dict[str, Any]:
    """Cualquier persona matriculada en el curso (o un administrador)."""
    access = await get_course_access(request, orgUnitId)
    if not access["isMember"]:
        raise HTTPException(
            status_code=403,
            detail="No estás matriculado en este curso.",
        )
    return access
