"""Proxy de la API de Brightspace protegido por sesion (extraido de main.py)."""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
import time
import urllib.parse
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from app.services.brightspace_client import BrightspaceClient, get_brightspace_client
from app.state import get_session, get_access_token
from app.api.deps import (
    BRIGHTSPACE_BASE_URL, LP_VERSION, LE_VERSION,
    SESSION_COOKIE, _get_session_id, _require_session,
    _require_token_from_request, _auth_headers, _bs_get, _bs_get_cached,
    _bs_cache_key, _get_whoami_id,
)

logger = logging.getLogger("uvicorn.error")

router = APIRouter()

# ──────────────────────────────────────────────────────────────────────────────
# Brightspace proxy endpoints (protegidos por sesión)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/brightspace/whoami")
async def brightspace_whoami(request: Request):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/users/whoami"
    status, data = await _bs_get_cached(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/semesters")
async def brightspace_semesters(
    request: Request,
    min_year: int = Query(default=2025),
):
    """List all semesters (orgUnitType=5) with code >= min_year.
    Used for the period dropdown in SuperAdmin / CoordinatorDashboard.
    """
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)

    semesters = []
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/orgstructure/"
    bookmark = None
    pages = 0
    try:
        while pages < 50:
            params: dict = {"orgUnitType": "5"}
            if bookmark:
                params["bookmark"] = bookmark
            # Estructura organizativa: casi estática → caché 5 min (#11)
            status, data = await _bs_get_cached(url, headers, params)
            if status != 200:
                break
            items = data if isinstance(data, list) else (data.get("Items") or data.get("items") or [])
            if not items:
                break
            semesters.extend(items)
            pages += 1
            paging = data.get("PagingInfo") if isinstance(data, dict) else None
            if not paging or not paging.get("HasMoreItems"):
                break
            new_bm = paging.get("Bookmark")
            if not new_bm or new_bm == bookmark:
                break
            bookmark = new_bm
    except Exception as e:
        logger.warning("semesters fetch failed: %s", str(e)[:200])

    # Normalize and filter by min_year
    out = []
    for s in semesters:
        code = str(s.get("Code") or "").strip()
        name = str(s.get("Name") or "").strip()
        sem_id = s.get("Identifier") or s.get("Id") or s.get("id")
        if not code and not name:
            continue
        # Filter by year prefix in code (YYYYTT format)
        try:
            if code[:4].isdigit() and int(code[:4]) >= min_year:
                out.append({"id": sem_id, "code": code, "name": name})
        except Exception:
            pass

    # Sort newest first: by code descending (202610 > 202520 > 202510)
    out.sort(key=lambda s: s["code"], reverse=True)
    return {"count": len(out), "items": out}


async def _fetch_all_enrollments(
    headers: dict,
    user_id: str,
    org_unit_type_id: int = 3,
    limit: int = 500,
) -> list:
    all_items = []
    bookmark = None
    fetched = 0

    while fetched < limit:
        params: dict = {"orgUnitTypeId": org_unit_type_id}
        if bookmark:
            params["bookmark"] = bookmark

        url = (
            f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}"
            f"/enrollments/users/{user_id}/orgUnits/"
        )
        # Enrollments: cambian poco durante una sesión → caché 5 min (#11)
        status, data = await _bs_get_cached(url, headers, params)
        if status != 200:
            break

        items = data.get("Items") or data.get("items") or []
        if not items:
            break

        all_items.extend(items)
        fetched += len(items)

        paging = data.get("PagingInfo") or data.get("pagingInfo") or {}
        if not paging.get("HasMoreItems") and not paging.get("hasMoreItems"):
            break
        bookmark = paging.get("Bookmark") or paging.get("bookmark")
        if not bookmark:
            break

    return all_items


async def _fetch_my_enrollments(
    headers: dict,
    limit: int = 500,
) -> list:
    """Fetch the authenticated user's OWN enrollments via /enrollments/myenrollments/.
    Requires scope: enrollment:own_enrollment:read
    Returns ALL enrollments including where the user is a student (Estudiante EF)."""
    all_items = []
    bookmark = None
    fetched = 0

    while fetched < limit:
        params: dict = {"orgUnitTypeId": 3}
        if bookmark:
            params["bookmark"] = bookmark

        url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/enrollments/myenrollments/"
        # Enrollments propios: cambian poco durante una sesión → caché 5 min (#11)
        status, data = await _bs_get_cached(url, headers, params)
        if status != 200:
            logger.warning("myenrollments failed status=%s data=%s", status, str(data)[:200])
            break

        items = data.get("Items") or data.get("items") or []
        if not items:
            break

        all_items.extend(items)
        fetched += len(items)

        paging = data.get("PagingInfo") or data.get("pagingInfo") or {}
        if not paging.get("HasMoreItems") and not paging.get("hasMoreItems"):
            break
        bookmark = paging.get("Bookmark") or paging.get("bookmark")
        if not bookmark:
            break

    return all_items


def _normalize_offering(ou: dict) -> dict:
    from datetime import date
    today = date.today().isoformat()
    end_raw = ou.get("EndDate") or ou.get("endDate") or ""
    is_active = True
    if end_raw:
        try:
            is_active = end_raw[:10] >= today
        except Exception:
            pass
    return {
        "id":        ou.get("Id") or ou.get("id"),
        "name":      ou.get("Name") or ou.get("name") or "",
        "code":      ou.get("Code") or ou.get("code") or "",
        "startDate": ou.get("StartDate") or ou.get("startDate"),
        "endDate":   end_raw or None,
        "isActive":  is_active,
    }



@router.get("/brightspace/all-courses")
async def brightspace_all_courses_search(
    request:     Request,
    search:      str | None = Query(default=None, description="Filtro por nombre o ID"),
    active_only: bool       = Query(default=False),
    limit:       int        = Query(default=50),
):
    """
    Lista TODOS los Course Offerings del sistema usando el endpoint orgstructure.
    Solo funciona con rol Super Administrator o similar con acceso a orgstructure.
    Útil cuando el docente/admin no está inscrito en el curso.
    """
    token, err = _require_token_from_request(request)
    if err:
        return err

    headers = _auth_headers(token)

    # ── IMPORTANTE ───────────────────────────────────────────────────────
    # La API de Brightspace NO tiene un parámetro `search` genérico en
    # /orgstructure/: soporta `orgUnitName` y `orgUnitCode` (substring match)
    # además de `orgUnitType`. La versión anterior enviaba `search`,
    # Brightspace lo ignoraba y devolvía la primera página de TODOS los org
    # units (por eso el buscador "no filtraba" y siempre salían los cursos
    # demo #66xx). Ahora consultamos por nombre Y por código (y por ID exacto
    # si el término es numérico) y fusionamos los resultados sin duplicados.
    base_url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/orgstructure/"
    limit = max(1, min(limit, 100))
    q = (search or "").strip()

    items_raw: list = []
    seen_ids: set = set()

    def _add_items(arr):
        for ou in arr or []:
            if not isinstance(ou, dict):
                continue
            oid = ou.get("Identifier") or ou.get("Id") or ou.get("id")
            key = str(oid) if oid is not None else None
            if not key or key in seen_ids:
                continue
            seen_ids.add(key)
            items_raw.append(ou)

    async def _collect(params: dict, max_pages: int = 3) -> int:
        """Recorre páginas (Bookmark) hasta llenar `limit` o agotar max_pages."""
        bookmark = None
        last_status = 200
        for _ in range(max_pages):
            p = dict(params)
            if bookmark:
                p["bookmark"] = bookmark
            # orgstructure: casi estático → caché 5 min (#11)
            last_status, data = await _bs_get_cached(base_url, headers, p)
            if last_status != 200:
                return last_status
            if isinstance(data, list):
                _add_items(data)
                return 200
            if not isinstance(data, dict):
                return 200
            _add_items(data.get("Items") or data.get("items") or [])
            if len(items_raw) >= limit:
                return 200
            paging = data.get("PagingInfo") or data.get("pagingInfo") or {}
            if not (paging.get("HasMoreItems") or paging.get("hasMoreItems")):
                return 200
            bookmark = paging.get("Bookmark") or paging.get("bookmark")
            if not bookmark:
                return 200
        return last_status

    if q:
        # 1) Por nombre (substring, case-insensitive en Brightspace)
        st_name = await _collect({"orgUnitType": "3", "orgUnitName": q})
        # 2) Por código (substring) — p.ej. "202620" suele vivir en el Code
        st_code = 200
        if len(items_raw) < limit:
            st_code = await _collect({"orgUnitType": "3", "orgUnitCode": q})
        # 3) ID exacto de org unit
        if q.isdigit() and q not in seen_ids:
            st_id, data_id = await _bs_get_cached(base_url + q, headers, {})
            if st_id == 200 and isinstance(data_id, dict):
                _add_items([data_id])
        if not items_raw and st_name != 200 and st_code != 200:
            return JSONResponse(
                status_code=st_name,
                content={"error": "No se pudo acceder al orgstructure de Brightspace"},
            )
    else:
        st = await _collect({"orgUnitType": "3"}, max_pages=1)
        if st != 200 and not items_raw:
            return JSONResponse(
                status_code=st,
                content={"error": "No se pudo acceder al orgstructure de Brightspace"},
            )

    from datetime import date
    today = date.today().isoformat()
    offerings = []
    for ou in items_raw:
        # Brightspace orgstructure devuelve {Identifier, Name, Code, Type, ...}
        ou_id   = ou.get("Identifier") or ou.get("Id") or ou.get("id")
        ou_name = ou.get("Name") or ou.get("name") or ""
        ou_code = ou.get("Code") or ou.get("code") or ""
        ou_type = (ou.get("Type") or {}).get("Code") or ""

        if not ou_id:
            continue

        # Solo Course Offerings
        if ou_type and ou_type not in ("Course Offering", "CourseOffering"):
            type_id = (ou.get("Type") or {}).get("Id")
            if type_id and type_id != 3:
                continue

        offerings.append({
            "id":        ou_id,
            "name":      ou_name,
            "code":      ou_code,
            "startDate": ou.get("StartDate"),
            "endDate":   ou.get("EndDate"),
            "isActive":  True,  # orgstructure no siempre tiene fechas
        })

    if active_only:
        offerings = [o for o in offerings if o["isActive"]]

    offerings.sort(key=lambda x: (x["name"] or "").lower())
    offerings = offerings[:limit]
    return {"count": len(offerings), "source": "orgstructure", "items": offerings}


@router.get("/brightspace/my-courses")
async def brightspace_my_courses(
    request: Request,
    bookmark: str | None = Query(default=None),
):
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)
    user_id, err = await _get_whoami_id(headers)
    if err:
        return err
    url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}"
        f"/enrollments/users/{user_id}/orgUnits/"
    )
    params: dict = {}
    if bookmark:
        params["bookmark"] = bookmark
    # Enrollments: cambian poco durante una sesión → caché 5 min (#11)
    status, data = await _bs_get_cached(url, headers, params)
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/my-course-offerings")
async def brightspace_my_course_offerings(
    request:     Request,
    active_only: bool       = Query(default=True),
    search:      str | None = Query(default=None),
    limit:       int        = Query(default=500),
):
    """
    Devuelve los Course Offerings donde el usuario autenticado es instructor.
    Filtra por active_only y/o search si se pasan.
    """
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)
    user_id, err = await _get_whoami_id(headers)
    if err:
        return err

    all_items = await _fetch_all_enrollments(headers, user_id, org_unit_type_id=3, limit=limit)

    offerings = []
    for item in all_items:
        ou = item.get("OrgUnit") or {}
        ou_type_id = (ou.get("Type") or {}).get("Id")
        if ou_type_id != 3:
            continue

        # Roles exactos de Brightspace CESA:
        #   "Estudiante EF"             → estudiante   (excluir en vista docente)
        #   "Instructor"                → docente      (incluir)
        #   "Coordinador Administrativo"→ coordinador  (incluir — futura vista coordinador)
        #   "Super Administrator"       → admin        (incluir — acceso total)
        access = item.get("Access") or {}
        role_name = (access.get("ClasslistRoleName") or "")

        ROLES_DOCENTE = {
            "Instructor",
            "Coordinador Administrativo",
            "Super Administrator",
        }
        ROLES_ESTUDIANTE = {
            "Estudiante EF",
        }

        # Si el rol es exclusivamente de estudiante, no incluir en vista docente
        if role_name in ROLES_ESTUDIANTE:
            continue

        # Si el rol no está en ninguna lista conocida pero tampoco es estudiante,
        # incluirlo por seguridad (rol personalizado o futuro)
        _ = ROLES_DOCENTE  # referencia para linting

        offering = _normalize_offering(ou)
        if active_only and not offering["isActive"]:
            continue
        if search and search.lower() not in offering["name"].lower():
            continue
        offerings.append(offering)

    offerings.sort(key=lambda x: (not x["isActive"], (x["name"] or "").lower()))

    # Guardar el rol más alto encontrado en la sesión para uso futuro
    # (vista coordinador, vista estudiante, etc.)
    ROLE_PRIORITY = ["Super Administrator", "Coordinador Administrativo", "Instructor", "Estudiante EF"]
    detected_roles = set()
    for item in all_items:
        rn = (item.get("Access") or {}).get("ClasslistRoleName") or ""
        if rn:
            detected_roles.add(rn)
    for priority_role in ROLE_PRIORITY:
        if priority_role in detected_roles:
            sid = _get_session_id(request)
            if sid:
                from app.state import SESSION_STORE
                with __import__("threading").Lock():
                    if sid in SESSION_STORE:
                        SESSION_STORE[sid]["role"] = priority_role
                        SESSION_STORE[sid]["all_roles"] = list(detected_roles)
            break

    return {"count": len(offerings), "active_only": active_only, "items": offerings}


@router.get("/brightspace/courses/enrolled")
async def brightspace_courses_enrolled(
    request: Request,
    active_only: bool = Query(default=True),
    limit:       int  = Query(default=200),
    user_id:     int  = Query(default=None),
    period:      str  = Query(default=None, description="Filter by period code prefix, e.g. '202610'"),
):
    """Returns the authenticated user's enrollments merged from TWO endpoints:
    1. /enrollments/myenrollments/ (requires enrollment:own_enrollment:read)
       — returns courses where user is directly enrolled (student, instructor).
    2. /enrollments/users/{user_id}/orgUnits/ (requires enrollment:orgunit:read)
       — admin-level lookup that may return additional courses for Super Admins
       who have global access without explicit per-course enrollment.

    SuperAdmin case: When `user_id` query param is provided and differs from
    the auth user, Brightspace's own-enrollment endpoints silently return the
    auth user's data. We fall back to iterating over the SuperAdmin's accessible
    courses and checking each course's classlist for the target user."""
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)
    auth_user_id, err_uid = await _get_whoami_id(headers)

    # SuperAdmin querying ANOTHER user's enrollments
    if user_id and auth_user_id and str(user_id) != str(auth_user_id):
        target_user_id = str(user_id)
        logger.info(
            "courses/enrolled: SuperAdmin %s querying user %s",
            auth_user_id, target_user_id,
        )
        # Build a search space of course offerings. We combine:
        # 1. SuperAdmin's own enrollments (admin endpoint)
        # 2. orgstructure endpoint (ALL course offerings in the org)
        # Then deduplicate by OrgUnit ID.
        accessible_list: list = []
        try:
            admin_enrollments = await _fetch_all_enrollments(headers, auth_user_id, org_unit_type_id=3, limit=limit)
            for it in admin_enrollments:
                ou = it.get("OrgUnit") or {}
                ou_id = ou.get("Id") or ou.get("id")
                if ou_id:
                    accessible_list.append({"id": ou_id, "name": ou.get("Name", ""), "code": ou.get("Code", "")})
        except Exception as _e:
            logger.warning("admin enrollments failed: %s", str(_e)[:200])

        # Use Brightspace semesters (orgUnitType=5) to efficiently scope the
        # search space. We fetch all semesters, filter them, then get the
        # descendant course offerings for each relevant semester.
        # This avoids scanning ALL courses in the system (historical unused
        # courses from pre-2025 have inconsistent metadata).
        try:
            semesters = []
            sem_url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/orgstructure/"
            bookmark = None
            max_pages = 50
            pages = 0
            while pages < max_pages:
                params: dict = {"orgUnitType": "5"}
                if bookmark:
                    params["bookmark"] = bookmark
                _status, _data = await _bs_get_cached(sem_url, headers, params)
                if _status != 200:
                    break
                _items = _data if isinstance(_data, list) else (_data.get("Items") or _data.get("items") or [])
                if not _items:
                    break
                semesters.extend(_items)
                pages += 1
                paging = _data.get("PagingInfo") if isinstance(_data, dict) else None
                if not paging or not paging.get("HasMoreItems"):
                    break
                new_bm = paging.get("Bookmark")
                if not new_bm or new_bm == bookmark:
                    break
                bookmark = new_bm

            # Filter semesters. If user provided a period, match it as prefix
            # in code or name. Otherwise default to semesters from 2025+.
            def _sem_matches(sem):
                code = str(sem.get("Code") or "").strip()
                name = str(sem.get("Name") or "").strip()
                if period and period.strip():
                    p = period.strip().lower()
                    return p in code.lower() or p in name.lower()
                # Default: only semesters whose code starts with "2025" or later.
                # Semester codes follow "YYYYTT" format (e.g., 202510, 202610).
                if code[:4].isdigit():
                    return int(code[:4]) >= 2025
                return False

            relevant_semesters = [s for s in semesters if _sem_matches(s)]
            logger.info(
                "courses/enrolled: %d total semesters, %d relevant%s",
                len(semesters), len(relevant_semesters),
                f" (period='{period}')" if period and period.strip() else " (default >= 2025)",
            )

            # For each relevant semester, get descendant course offerings
            async def _fetch_semester_courses(sem):
                sem_id = sem.get("Identifier") or sem.get("Id") or sem.get("id")
                if not sem_id:
                    return []
                url = (
                    f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}"
                    f"/orgstructure/{sem_id}/descendants/"
                )
                out = []
                bm = None
                pg = 0
                while pg < 20:
                    p: dict = {"ouTypeId": "3"}
                    if bm:
                        p["bookmark"] = bm
                    # Descendientes de un semestre: casi estático → caché 5 min (#11)
                    st, dt = await _bs_get_cached(url, headers, p)
                    if st != 200:
                        break
                    items = dt if isinstance(dt, list) else (dt.get("Items") or dt.get("items") or [])
                    if not items:
                        break
                    for it in items:
                        ou_id = it.get("Identifier") or it.get("Id") or it.get("id")
                        if ou_id:
                            out.append({
                                "id": ou_id,
                                "name": it.get("Name", ""),
                                "code": it.get("Code", ""),
                                "semesterCode": str(sem.get("Code") or ""),
                                "semesterName": str(sem.get("Name") or ""),
                            })
                    pg += 1
                    paging = dt.get("PagingInfo") if isinstance(dt, dict) else None
                    if not paging or not paging.get("HasMoreItems"):
                        break
                    new_bm = paging.get("Bookmark")
                    if not new_bm or new_bm == bm:
                        break
                    bm = new_bm
                return out

            # Fetch courses from all relevant semesters in parallel
            sem_courses_lists = await asyncio.gather(*[
                _fetch_semester_courses(s) for s in relevant_semesters
            ])
            for lst in sem_courses_lists:
                for c in lst:
                    accessible_list.append(c)

            logger.info(
                "courses/enrolled: gathered %d courses from %d semesters",
                sum(len(l) for l in sem_courses_lists), len(relevant_semesters),
            )
        except Exception as _e:
            logger.warning("semester-based search failed: %s", str(_e)[:200])

        # Deduplicate by id
        seen = set()
        search_space = []
        for item in accessible_list:
            sid = str(item["id"])
            if sid in seen:
                continue
            seen.add(sid)
            search_space.append(item)

        logger.info("courses/enrolled: search space = %d course offerings", len(search_space))

        sem = asyncio.Semaphore(25)

        async def _check_course(item):
            async with sem:
                org_id = item.get("id")
                if not org_id:
                    return None
                # Use enrollments endpoint to check if target user has an
                # enrollment in this org unit. Returns 200 with enrollment
                # data if enrolled, 404 if not.
                url = (
                    f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}"
                    f"/enrollments/orgUnits/{org_id}/users/{target_user_id}"
                )
                try:
                    # Membresía usuario↔curso: estable en el corto plazo →
                    # caché 5 min. Ahorra cientos de llamadas por búsqueda (#11)
                    status, data = await _bs_get_cached(url, headers)
                    if status == 200 and isinstance(data, dict):
                        role_id = data.get("RoleId")
                        ou_info = data.get("OrgUnit") or {}
                        name = ou_info.get("Name") or item.get("name") or ""
                        code = ou_info.get("Code") or item.get("code") or ""
                        role_name_map = {
                            105: "Super Administrator",
                            109: "Instructor",
                            110: "Estudiante EF",
                            113: "Designer",
                            116: "Administrator",
                            120: "Profesor Asistente",
                            126: "Diseñador Pedagógico",
                            128: "Monitor",
                            129: "Estudiante EC",
                            130: "Coordinador Administrativo",
                            131: "Diseñador Instruccional",
                            133: "Tutor Virtual",
                        }
                        role_name = role_name_map.get(int(role_id), f"Role {role_id}") if role_id else ""
                        return {
                            "id": org_id,
                            "name": name,
                            "code": code,
                            "isActive": True,
                            "roleName": role_name,
                            "roleId": role_id,
                            "semesterCode": item.get("semesterCode") or "",
                            "semesterName": item.get("semesterName") or "",
                        }
                except Exception as _e:
                    logger.debug("enrollment check failed for org %s: %s", org_id, str(_e)[:100])
                return None

        results = await asyncio.gather(*[_check_course(i) for i in search_space])
        offerings = [r for r in results if r is not None]
        logger.info(
            "courses/enrolled: target %s found in %d of %d courses",
            target_user_id, len(offerings), len(search_space),
        )
        if active_only:
            offerings = [o for o in offerings if o.get("isActive")]
        return {"count": len(offerings), "items": offerings}

    # Default flow: auth user's own enrollments (merged from my + admin endpoints)
    # 1. myenrollments — user's own explicit enrollments
    items_my = await _fetch_my_enrollments(headers, limit=limit)

    # 2. admin-level endpoint — same data but via different scope; may return
    #    additional courses for global admins
    items_admin = []
    try:
        if not err_uid and auth_user_id:
            items_admin = await _fetch_all_enrollments(headers, auth_user_id, org_unit_type_id=3, limit=limit)
    except Exception as _e:
        logger.warning("_fetch_all_enrollments failed: %s", str(_e)[:200])
        items_admin = []

    # Merge by OrgUnit.Id — prefer myenrollments data when same course
    by_ou = {}
    for i in items_my:
        ou = i.get("OrgUnit") or {}
        ou_id = ou.get("Id") or ou.get("id")
        if ou_id is not None:
            by_ou[str(ou_id)] = i
    for i in items_admin:
        ou = i.get("OrgUnit") or {}
        ou_id = ou.get("Id") or ou.get("id")
        if ou_id is not None and str(ou_id) not in by_ou:
            by_ou[str(ou_id)] = i

    merged_items = list(by_ou.values())

    offerings = []
    for i in merged_items:
        ou = i.get("OrgUnit") or {}
        offering = _normalize_offering(ou)
        # Include roleName from Access (present in both endpoints)
        access = i.get("Access") or {}
        offering["roleName"] = access.get("ClasslistRoleName") or ""
        offerings.append(offering)

    if active_only:
        offerings = [o for o in offerings if o["isActive"]]

    # Update session's all_roles from the detected roles
    detected_roles = {o["roleName"] for o in offerings if o.get("roleName")}
    if detected_roles:
        sid = _get_session_id(request)
        if sid:
            from app.state import SESSION_STORE
            import threading
            with threading.Lock():
                if sid in SESSION_STORE:
                    SESSION_STORE[sid]["all_roles"] = list(detected_roles)
                    # Set primary role if not already set
                    if not SESSION_STORE[sid].get("role"):
                        ROLE_PRIORITY = ["Super Administrator", "Coordinador Administrativo", "Instructor", "Estudiante EF"]
                        for pr in ROLE_PRIORITY:
                            if pr in detected_roles:
                                SESSION_STORE[sid]["role"] = pr
                                break

    logger.info(
        "courses/enrolled: myenrollments=%d admin=%d merged=%d final=%d",
        len(items_my), len(items_admin), len(merged_items), len(offerings),
    )

    return {"count": len(offerings), "items": offerings}


@router.get("/brightspace/courses/all")
async def brightspace_courses_all(
    request: Request,
    active_only: bool = Query(default=False),
    limit:       int  = Query(default=500),
):
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)
    user_id, err = await _get_whoami_id(headers)
    if err:
        return err
    items = await _fetch_all_enrollments(headers, user_id, org_unit_type_id=3, limit=limit)
    offerings = [_normalize_offering(i.get("OrgUnit") or {}) for i in items]
    if active_only:
        offerings = [o for o in offerings if o["isActive"]]
    return {"count": len(offerings), "items": offerings}


@router.get("/brightspace/course/{org_unit_id}")
async def brightspace_course(request: Request, org_unit_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/courses/{org_unit_id}"
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/user/{user_id}/image")
async def brightspace_user_image(request: Request, user_id: str):
    """Proxy the user's profile image from Brightspace.
    Returns the image bytes with appropriate content-type.
    Requires scope: users:profile:read"""
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/profile/user/{user_id}/image"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(url, headers=_auth_headers(token))
        if res.status_code != 200:
            return JSONResponse(status_code=404, content={"error": "image_not_available"})
        from fastapi.responses import Response
        ct = res.headers.get("content-type", "image/jpeg")
        return Response(
            content=res.content,
            media_type=ct,
            headers={"Cache-Control": "public, max-age=3600"},
        )
    except Exception as e:
        logger.warning("user_image fetch failed user=%s err=%s", user_id, str(e)[:200])
        return JSONResponse(status_code=404, content={"error": "image_fetch_failed"})


@router.get("/brightspace/course/{org_unit_id}/classlist")
async def brightspace_classlist(
    request: Request,
    org_unit_id: int,
    role_name: str | None = Query(default=None),
):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/classlist/"
    status, data = await _bs_get(url, _auth_headers(token))
    if status != 200:
        return JSONResponse(status_code=status, content=data)
    items = data if isinstance(data, list) else (data.get("Items") or data.get("items") or [])
    if role_name:
        rn = role_name.lower()
        items = [
            i for i in items
            if rn in (i.get("RoleName") or i.get("roleName") or "").lower()
        ]
    return {"count": len(items), "items": items}


# ── Enlaces dentro de páginas HTML del curso ─────────────────────────────────
# Los archivos enlazados dentro de una página creada en Brightspace (p. ej.
# una página con 7 enlaces a 7 PDFs) también son recursos publicados, pero la
# API de contenido solo lista los recursos del árbol — el cuerpo de la página
# nunca aparece. Se descarga el HTML de cada página interna (best-effort,
# cacheado) y se adjuntan los href como EmbeddedLinks de cada topic para que
# el frontend los clasifique y cuente por tipo de archivo.
_HREF_RE = re.compile(r"href\s*=\s*[\"']([^\"'>]+)[\"']", re.IGNORECASE)
_PAGE_LINKS_CACHE: dict[str, tuple[float, list[str]]] = {}
_PAGE_LINKS_TTL_S = 300.0
_PAGE_FETCH_MAX = 60          # máx. páginas HTML leídas por request
_PAGE_BYTES_MAX = 1_500_000   # ignora archivos HTML anormalmente grandes


def _extract_hrefs(html: str, limit: int = 100) -> list[str]:
    """Extrae los href únicos y navegables de un HTML (función pura).

    Descarta anclas, mailto:, javascript:, data: y tel:. Devuelve los href
    URL-decodificados (los quicklinks de Brightspace codifican la ruta del
    archivo, y sin decodificar no se reconoce la extensión .pdf/.docx…).
    """
    links: list[str] = []
    seen: set[str] = set()
    for href in _HREF_RE.findall(html or ""):
        h = urllib.parse.unquote(href).strip()
        low = h.lower()
        if not h or low.startswith(("#", "mailto:", "javascript:", "data:", "tel:")):
            continue
        if low in seen:
            continue
        seen.add(low)
        links.append(h)
        if len(links) >= limit:
            break
    return links


async def _page_embedded_links(
    org_unit_id: int, topic_id, headers: dict, sem: asyncio.Semaphore
) -> list[str]:
    """Descarga el HTML de una página de contenido y devuelve sus href."""
    url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/content/topics/{topic_id}/file"
    )
    key = _bs_cache_key(url, headers, None)
    now = time.monotonic()
    hit = _PAGE_LINKS_CACHE.get(key)
    if hit and (now - hit[0]) < _PAGE_LINKS_TTL_S:
        return list(hit[1])
    links: list[str] = []
    try:
        async with sem:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.get(url, headers=headers)
        if r.status_code == 200 and len(r.content) <= _PAGE_BYTES_MAX:
            links = _extract_hrefs(r.text)
            if len(_PAGE_LINKS_CACHE) > 500:
                _PAGE_LINKS_CACHE.clear()
            _PAGE_LINKS_CACHE[key] = (now, list(links))
    except Exception:
        pass  # best-effort: sin los links de una página, el conteo sigue
    return links


@router.get("/brightspace/course/{org_unit_id}/content/topics")
async def brightspace_content_topics(request: Request, org_unit_id: int):
    """Elementos de contenido del curso con metadatos completos (Url,
    TopicType, ActivityType), recorriendo la estructura de cada módulo.
    El /content/root/ solo trae 'shells' sin Url, y sin la Url no se puede
    saber el tipo de archivo (PDF, Word, etc.).

    Devuelve {count, items: [{Id, Title, Url, TopicType, ActivityType,
    IsHidden, LastModifiedDate, EmbeddedLinks?}]}. EmbeddedLinks solo viene
    en las páginas HTML internas: son los href encontrados en el cuerpo de
    la página (los archivos enlazados también cuentan como recursos).
    """
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)

    root_url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/content/root/"
    root_status, root_data = await _bs_get_cached(root_url, headers)
    if root_status != 200:
        return JSONResponse(status_code=root_status, content=root_data)

    queue = [
        m.get("Id") for m in (root_data if isinstance(root_data, list) else [])
        if isinstance(m, dict) and m.get("Id") is not None and m.get("IsHidden") is not True
    ]
    seen_modules = set(queue)
    topics = []
    sem = asyncio.Semaphore(8)

    async def _structure_of(mid):
        url = (
            f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
            f"/{org_unit_id}/content/modules/{mid}/structure/"
        )
        async with sem:
            status, data = await _bs_get_cached(url, headers)
        return data if (status == 200 and isinstance(data, list)) else []

    # BFS por niveles para soportar módulos anidados (máx 100 módulos)
    for _ in range(6):
        if not queue or len(seen_modules) > 100:
            break
        batch = queue[:50]
        queue = queue[50:]
        results = await asyncio.gather(*[_structure_of(m) for m in batch])
        for items in results:
            for it in items:
                if not isinstance(it, dict):
                    continue
                if it.get("Type") == 0:
                    mid = it.get("Id")
                    if mid is not None and mid not in seen_modules and it.get("IsHidden") is not True:
                        seen_modules.add(mid)
                        queue.append(mid)
                elif it.get("Type") == 1:
                    topics.append({
                        "Id": it.get("Id"),
                        "Title": it.get("Title") or it.get("ShortTitle"),
                        "Url": it.get("Url"),
                        "TopicType": it.get("TopicType"),
                        "ActivityType": it.get("ActivityType"),
                        "IsHidden": it.get("IsHidden"),
                        "LastModifiedDate": it.get("LastModifiedDate"),
                    })

    # Páginas HTML internas visibles → leer su cuerpo y adjuntar los href.
    # Solo URLs relativas: una Url absoluta http(s) es un enlace, no una
    # página del curso, y no tiene archivo descargable en la API.
    page_topics = []
    for t in topics:
        if t.get("IsHidden") is True or t.get("Id") is None:
            continue
        u = t.get("Url")
        if not isinstance(u, str):
            continue
        low = u.lower()
        if low.startswith(("http://", "https://")):
            continue
        if low.split("?")[0].endswith((".html", ".htm")):
            page_topics.append(t)
    for t, links in zip(
        page_topics[:_PAGE_FETCH_MAX],
        await asyncio.gather(*[
            _page_embedded_links(org_unit_id, t["Id"], headers, sem)
            for t in page_topics[:_PAGE_FETCH_MAX]
        ]),
    ):
        if links:
            t["EmbeddedLinks"] = links

    return {"count": len(topics), "items": topics}


@router.get("/brightspace/course/{org_unit_id}/instructors")
async def brightspace_course_instructors(request: Request, org_unit_id: int):
    """Usuarios del curso con rol de profesor/instructor (LP enrollments,
    que a diferencia del classlist sí trae el nombre del rol).

    Devuelve {items: [{Identifier, DisplayName, RoleName}]}.
    """
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)

    keywords = ("instructor", "profesor", "docente", "teacher", "facilitador")
    items = []
    bookmark = None
    for _ in range(5):  # máx 5 páginas de ~100
        url = (
            f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}"
            f"/enrollments/orgUnits/{org_unit_id}/users/"
        )
        if bookmark:
            url += f"?bookmark={urllib.parse.quote(str(bookmark))}"
        status, data = await _bs_get_cached(url, headers)
        if status != 200 or not isinstance(data, dict):
            break
        for rec in (data.get("Items") or []):
            if not isinstance(rec, dict):
                continue
            user = rec.get("User") or {}
            role = rec.get("Role") or {}
            role_name = str(role.get("Name") or "")
            if any(k in role_name.lower() for k in keywords):
                items.append({
                    "Identifier": user.get("Identifier"),
                    "DisplayName": user.get("DisplayName"),
                    "RoleName": role_name,
                })
        paging = data.get("PagingInfo") or {}
        bookmark = paging.get("Bookmark")
        if not paging.get("HasMoreItems") or not bookmark:
            break

    return {"count": len(items), "items": items}


@router.get("/brightspace/course/{org_unit_id}/content/consumption")
async def brightspace_content_consumption(request: Request, org_unit_id: int):
    """Resumen de consumo de contenidos por estudiante: cuantos temas del
    curso ha visitado cada uno segun el user progress de Brightspace
    (scope content:completions:read, ya incluido en el SCOPE por defecto).

    Devuelve {perUser: {userId: temasVisitados}, usersQueried, usersWithData}.
    Best-effort: si Brightspace no expone el progreso (403/404) devuelve
    perUser vacio para que el frontend muestre "no disponible".
    """
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)

    cl_url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/classlist/"
    cl_status, cl_data = await _bs_get_cached(cl_url, headers)
    if cl_status != 200:
        return JSONResponse(status_code=cl_status, content=cl_data)
    users = cl_data if isinstance(cl_data, list) else (cl_data.get("Items") or [])
    user_ids = [str(u.get("Identifier")) for u in users if isinstance(u, dict) and u.get("Identifier")]

    sem = asyncio.Semaphore(8)
    per_user: dict = {}
    per_user_topics: dict = {}
    method = None

    def _topic_id_of(rec) -> Optional[str]:
        if not isinstance(rec, dict):
            return None
        for k in ("ContentObjectId", "TopicId", "ObjectId", "Id"):
            if rec.get(k) is not None:
                return str(rec[k])
        return None

    # ── Estrategia 1: user progress por estudiante ──────────────────────
    async def _progress_for(uid: str):
        url = (
            f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
            f"/{org_unit_id}/content/userprogress/{uid}"
        )
        async with sem:
            status, data = await _bs_get_cached(url, headers)
        if status != 200:
            return uid, None, []
        items = data if isinstance(data, list) else (data.get("Objects") or data.get("Items") or [])
        if not isinstance(items, list):
            return uid, None, []
        topics = [t for t in (_topic_id_of(it) for it in items) if t]
        return uid, len(items), topics[:500]

    if user_ids:
        probe_uid, probe_val, probe_topics = await _progress_for(user_ids[0])
        if probe_val is not None:
            method = "userprogress"
            per_user[probe_uid] = probe_val
            per_user_topics[probe_uid] = probe_topics
            rest = await asyncio.gather(*[_progress_for(u) for u in user_ids[1:100]])
            for uid, n, topics in rest:
                if n is not None:
                    per_user[uid] = n
                    per_user_topics[uid] = topics

    # ── Estrategia 2 (fallback): completions por tema ───────────────────
    # Una llamada por tema devuelve los registros de TODOS los usuarios.
    if method is None:
        root_url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/content/root/"
        root_status, root_data = await _bs_get_cached(root_url, headers)
        topic_ids = []
        if root_status == 200 and isinstance(root_data, list):
            for mod in root_data:
                if not isinstance(mod, dict) or mod.get("IsHidden") is True:
                    continue
                for it in (mod.get("Structure") or []):
                    if (
                        isinstance(it, dict)
                        and it.get("IsHidden") is not True
                        and it.get("Type") == 1
                        and it.get("Id") is not None
                    ):
                        topic_ids.append(it["Id"])

        async def _completions_for_topic(tid):
            url = (
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
                f"/{org_unit_id}/content/topics/{tid}/completions/"
            )
            async with sem:
                status, data = await _bs_get_cached(url, headers)
            if status != 200:
                return tid, []
            items = data if isinstance(data, list) else (data.get("Objects") or data.get("Items") or [])
            return tid, (items if isinstance(items, list) else [])

        if topic_ids:
            all_completions = await asyncio.gather(
                *[_completions_for_topic(t) for t in topic_ids[:200]]
            )
            found_any = False
            for tid, records in all_completions:
                for rec in records:
                    if not isinstance(rec, dict):
                        continue
                    uid = rec.get("UserId") or rec.get("userId")
                    if uid is None:
                        continue
                    found_any = True
                    key = str(uid)
                    per_user[key] = per_user.get(key, 0) + 1
                    per_user_topics.setdefault(key, []).append(str(tid))
            if found_any:
                method = "topic_completions"
                # Los estudiantes sin registros quedan en 0 explícito para
                # que el frontend los cuente en el promedio.
                for uid in user_ids:
                    per_user.setdefault(uid, 0)
                    per_user_topics.setdefault(uid, [])

    return {
        "orgUnitId": org_unit_id,
        "perUser": per_user,
        "perUserTopics": per_user_topics,
        "method": method,
        "usersQueried": len(user_ids),
        "usersWithData": len(per_user),
    }


@router.get("/brightspace/users/{user_id}")
async def brightspace_user(request: Request, user_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/users/{user_id}"
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/course/{org_unit_id}/content/root")
async def brightspace_content_root(request: Request, org_unit_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/content/root/"
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/course/{org_unit_id}/grades/items")
async def brightspace_grade_items(request: Request, org_unit_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/grades/"
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/course/{org_unit_id}/grades/student/{user_id}")
async def brightspace_grade_values(request: Request, org_unit_id: int, user_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/grades/values/{user_id}/"
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/course/{org_unit_id}/grades/{grade_object_id}/student/{user_id}")
async def brightspace_grade_value_by_item(
    request: Request, org_unit_id: int, grade_object_id: int, user_id: int
):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/grades/{grade_object_id}/values/{user_id}"
    )
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/course/{org_unit_id}/gradeitem/{grade_object_id}")
async def brightspace_gradeitem_detail(request: Request, org_unit_id: int, grade_object_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/grades/{grade_object_id}"
    )
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/course/{org_unit_id}/grades/student/{user_id}/evidence")
async def brightspace_student_evidence(request: Request, org_unit_id: int, user_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)

    items_url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/grades/"
    _, items_data = await _bs_get(items_url, headers)
    grade_items = (
        items_data if isinstance(items_data, list)
        else items_data.get("Items") or items_data.get("items") or []
    )

    import asyncio
    async def _fetch_one(item):
        gid = item.get("Id") or item.get("id")
        if not gid:
            return None
        url = (
            f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
            f"/{org_unit_id}/grades/{gid}/values/{user_id}"
        )
        s, d = await _bs_get(url, headers)
        if s != 200:
            return None
        return {
            "gradeObjectId": gid,
            "name":          item.get("Name") or item.get("name") or f"Ítem {gid}",
            "gradeType":     item.get("GradeType") or item.get("gradeType"),
            "maxPoints":     item.get("MaxPoints") or item.get("maxPoints"),
            "weight":        item.get("Weight") or item.get("weight"),
            "value":         d,
        }

    results = await asyncio.gather(*[_fetch_one(i) for i in grade_items[:50]])
    evidences = [r for r in results if r]
    return {"orgUnitId": org_unit_id, "userId": user_id, "evidences": evidences}


@router.get("/brightspace/course/{org_unit_id}/dropbox/folders")
async def brightspace_dropbox_folders(request: Request, org_unit_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/dropbox/folders/"
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/course/{org_unit_id}/dropbox/folder/{folder_id}")
async def brightspace_dropbox_folder(request: Request, org_unit_id: int, folder_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/dropbox/folders/{folder_id}"
    )
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/course/{org_unit_id}/dropbox/folder/{folder_id}/submissions")
async def brightspace_dropbox_submissions(
    request: Request, org_unit_id: int, folder_id: int
):
    """List all submissions for a dropbox folder. Returns array of submissions
    with files, submitted dates, and entity (user/group) info."""
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/dropbox/folders/{folder_id}/submissions/"
    )
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/course/{org_unit_id}/dropbox/student/{user_id}/status")
async def brightspace_dropbox_student_status(
    request: Request, org_unit_id: int, user_id: int
):
    """Estado de las asignaciones (dropbox) para UN estudiante: cuáles entregó
    (tiene submission) y cuáles ya tienen feedback/calificación del docente.

    Devuelve por asignación publicada: id, nombre, fecha de entrega,
    hasSubmission, submittedAt, isGraded y gradeItemId (para que el frontend
    pueda emparejar la nota del gradebook). Las carpetas cuya lista de
    submissions no se pudo leer quedan con hasSubmission=None y el response
    marca partial=True."""
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)

    status_f, folders_data = await _bs_get(
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/dropbox/folders/",
        headers,
    )
    if status_f != 200:
        return JSONResponse(status_code=status_f, content=folders_data)
    folders = folders_data if isinstance(folders_data, list) else (
        (folders_data or {}).get("Objects") or (folders_data or {}).get("Items") or []
    )
    visible = [f for f in folders if isinstance(f, dict) and f.get("IsHidden") is not True]

    # Grupos: si una carpeta es de entrega grupal, la submission vive en la
    # entidad GRUPO. Resolvemos una sola vez los grupos del estudiante por
    # cada categoría de grupo usada.
    group_ids_by_category: dict = {}

    async def _user_group_ids(group_type_id):
        key = str(group_type_id)
        if key in group_ids_by_category:
            return group_ids_by_category[key]
        ids: set = set()
        try:
            _, groups_data = await _bs_get(
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}"
                f"/{org_unit_id}/groupcategories/{group_type_id}/groups/",
                headers,
            )
            if isinstance(groups_data, list):
                for g in groups_data:
                    if not isinstance(g, dict):
                        continue
                    enroll = [str(x) for x in (g.get("Enrollments") or [])]
                    if str(user_id) in enroll and g.get("GroupId") is not None:
                        ids.add(str(g.get("GroupId")))
        except Exception as e:
            logger.warning("group resolve failed cat=%s user=%s: %s", group_type_id, user_id, e)
        group_ids_by_category[key] = ids
        return ids

    async def _folder_status(f):
        fid = f.get("Id")
        assess = f.get("Assessment") or {}
        grade_item_id = assess.get("GradeItemId") or f.get("GradeItemId")
        due = f.get("DueDate") or (f.get("Availability") or {}).get("EndDate")
        base = {
            "id": fid,
            "name": f.get("Name") or f"Asignación {fid}",
            "dueDate": due,
            "gradeItemId": grade_item_id,
            "hasSubmission": None,
            "submittedAt": None,
            "isGraded": None,
        }
        if not fid:
            return base
        entity_ids = {str(user_id)}
        if f.get("GroupTypeId") is not None:
            entity_ids |= await _user_group_ids(f.get("GroupTypeId"))
        try:
            s, subs_data = await _bs_get(
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
                f"/{org_unit_id}/dropbox/folders/{fid}/submissions/",
                headers,
            )
            if s != 200:
                return base
            subs_list = subs_data if isinstance(subs_data, list) else (
                (subs_data or {}).get("Items") or (subs_data or {}).get("items") or []
            )
            mine = []
            for entry in subs_list:
                if not isinstance(entry, dict):
                    continue
                eid = (
                    entry.get("EntityId")
                    or entry.get("UserId")
                    or (entry.get("Entity") or {}).get("EntityId")
                )
                if str(eid) in entity_ids:
                    mine.append(entry)
            flat = []
            has_feedback = False
            for entry in mine:
                inner = entry.get("Submissions") or entry.get("submissions") or []
                if isinstance(inner, list):
                    flat.extend([x for x in inner if isinstance(x, dict)])
                if entry.get("Feedback"):
                    has_feedback = True
            flat.sort(key=lambda x: x.get("SubmissionDate") or "", reverse=True)
            base["hasSubmission"] = len(flat) > 0
            base["submittedAt"] = (flat[0].get("SubmissionDate") if flat else None)
            base["isGraded"] = has_feedback
        except Exception as e:
            logger.warning(
                "dropbox student status failed folder=%s user=%s: %s", fid, user_id, e
            )
        return base

    import asyncio
    items = list(await asyncio.gather(*[_folder_status(f) for f in visible]))

    def _due_key(x):
        return (x.get("dueDate") is None, x.get("dueDate") or "", str(x.get("name") or ""))
    items.sort(key=_due_key)

    known = [i for i in items if i.get("hasSubmission") is not None]
    return {
        "orgUnitId": org_unit_id,
        "userId": user_id,
        "items": items,
        "counts": {
            "total": len(items),
            "submitted": sum(1 for i in known if i.get("hasSubmission")),
            "graded": sum(1 for i in items if i.get("isGraded")),
        },
        "partial": len(known) < len(items),
    }


@router.get("/brightspace/course/{org_unit_id}/dropbox/grading-status")
async def brightspace_dropbox_grading_status(request: Request, org_unit_id: int):
    """Estado de entregas y calificación por asignación para TODO el curso.

    Por cada asignación publicada devuelve: quiénes entregaron
    (submittedIds) y quiénes tienen la entrega SIN feedback del docente
    (pendingGrading, con nombre). Alimenta dos vistas del dashboard:
    - "Evaluación y Feedback": entregadas pendientes de calificar y de quién.
    - "Estudiantes prioritarios": vencidas sin entrega por estudiante
      (complemento de submittedIds en asignaciones con fecha pasada).
    En carpetas de entrega GRUPAL no se expanden los grupos a estudiantes:
    se marca isGroup=True y los ids/nombres son de la entidad grupo (se
    excluyen del cálculo por-estudiante en el frontend)."""
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)

    status_f, folders_data = await _bs_get(
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/dropbox/folders/",
        headers,
    )
    if status_f != 200:
        return JSONResponse(status_code=status_f, content=folders_data)
    folders = folders_data if isinstance(folders_data, list) else (
        (folders_data or {}).get("Objects") or (folders_data or {}).get("Items") or []
    )
    visible = [f for f in folders if isinstance(f, dict) and f.get("IsHidden") is not True]

    sem = asyncio.Semaphore(8)

    async def _folder_status(f):
        fid = f.get("Id")
        due = f.get("DueDate") or (f.get("Availability") or {}).get("EndDate")
        base = {
            "id": fid,
            "name": f.get("Name") or f"Asignación {fid}",
            "dueDate": due,
            "isGroup": f.get("GroupTypeId") is not None,
            "submittedIds": [],
            "pendingGrading": [],
            "ok": False,
        }
        if not fid:
            return base
        try:
            async with sem:
                s, subs_data = await _bs_get_cached(
                    f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
                    f"/{org_unit_id}/dropbox/folders/{fid}/submissions/",
                    headers,
                )
            if s != 200:
                return base
            subs_list = subs_data if isinstance(subs_data, list) else (
                (subs_data or {}).get("Items") or (subs_data or {}).get("items") or []
            )
            for entry in subs_list:
                if not isinstance(entry, dict):
                    continue
                ent = entry.get("Entity") or {}
                eid = (
                    entry.get("EntityId")
                    or ent.get("EntityId")
                    or entry.get("UserId")
                )
                if eid is None:
                    continue
                inner = entry.get("Submissions") or entry.get("submissions") or []
                has_sub = isinstance(inner, list) and len(inner) > 0
                if not has_sub:
                    continue
                base["submittedIds"].append(str(eid))
                if not entry.get("Feedback"):
                    base["pendingGrading"].append({
                        "id": str(eid),
                        "name": ent.get("DisplayName") or ent.get("Name") or str(eid),
                    })
            base["ok"] = True
        except Exception as e:
            logger.warning(
                "dropbox grading status failed folder=%s: %s", fid, e
            )
        return base

    items = list(await asyncio.gather(*[_folder_status(f) for f in visible]))

    def _due_key(x):
        return (x.get("dueDate") is None, x.get("dueDate") or "", str(x.get("name") or ""))
    items.sort(key=_due_key)

    known = [i for i in items if i.get("ok")]
    return {
        "orgUnitId": org_unit_id,
        "items": items,
        "partial": len(known) < len(items),
    }


@router.get("/brightspace/course/{org_unit_id}/dropbox/folder/{folder_id}/student/{user_id}/download")
async def brightspace_dropbox_download(
    request: Request, org_unit_id: int, folder_id: int, user_id: int
):
    """Download all files submitted by a student to a dropbox folder.
    Returns a ZIP file (Brightspace native behavior).
    Requires scope: dropbox:folders:read"""
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/dropbox/folders/{folder_id}/submissions/{user_id}/download"
    )
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.get(url, headers=_auth_headers(token))
        if res.status_code != 200:
            return JSONResponse(
                status_code=res.status_code,
                content={"error": "download_failed", "status": res.status_code, "detail": res.text[:300]},
            )
        from fastapi.responses import Response
        ct = res.headers.get("content-type", "application/zip")
        # Try to extract filename from Content-Disposition header
        cd = res.headers.get("content-disposition", "")
        filename = f"submission_{folder_id}_{user_id}.zip"
        if "filename=" in cd:
            try:
                filename = cd.split("filename=", 1)[1].strip().strip('"').strip("'")
            except Exception:
                pass
        return Response(
            content=res.content,
            media_type=ct,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )
    except Exception as e:
        logger.warning("dropbox download failed folder=%s user=%s err=%s", folder_id, user_id, str(e)[:200])
        return JSONResponse(status_code=500, content={"error": "download_exception", "detail": str(e)[:300]})


@router.get("/brightspace/course/{org_unit_id}/dropbox/folder/{folder_id}/student/{user_id}/feedback")
async def brightspace_dropbox_feedback(
    request: Request, org_unit_id: int, folder_id: int, user_id: int,
    bs: BrightspaceClient = Depends(get_brightspace_client),
):
    """Get the teacher's feedback for a student's dropbox submission,
    including the rubric assessment (per-criterion levels + comments) when
    the dropbox has rubrics associated.

    Returns:
        {
            feedback: {Score, Feedback{Text,Html}, Files, IsGraded, ...},
            folderName: str,
            rubrics: [
                {rubricId, name, outOf, score, level, criteria: [
                    {name, level, points, comment}
                ]}
            ],
        }
    Requires scope: dropbox:folders:read + rubrics:assessments:read
    """
    import asyncio
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)

    # 1. Feedback (the correct LE path uses /feedback/{userId} directly, no entityType)
    feedback_url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/dropbox/folders/{folder_id}/feedback/{user_id}"
    )
    # 2. Folder info (for rubric IDs + name + instructions)
    folder_url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/dropbox/folders/{folder_id}"
    )
    # 3. Submissions (for the student's own comment when uploading)
    subs_url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/dropbox/folders/{folder_id}/submissions/"
    )

    (fb_status, fb_data), (_, folder_data), (_, subs_data) = await asyncio.gather(
        _bs_get(feedback_url, headers),
        _bs_get(folder_url, headers),
        _bs_get(subs_url, headers),
    )

    # If feedback fetch failed, still return whatever we have
    if fb_status != 200 or not isinstance(fb_data, dict):
        fb_data = {}

    folder_data = folder_data if isinstance(folder_data, dict) else {}
    folder_name = folder_data.get("Name") or ""
    rubric_refs = (folder_data.get("Assessment") or {}).get("Rubrics") or []

    # 3. For each rubric, fetch the assessment (per-criterion levels + comments).
    # Brightspace has MANY variants of rubric endpoints depending on version
    # and how the rubric is attached. We try several in parallel and merge
    # whatever we get.
    rubrics_out: list[dict] = []

    async def _try(url: str, params: dict | None = None):
        try:
            _, data = await _bs_get(url, headers, params or {})
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    # Feedback may already include embedded RubricAssessments (newer LE)
    fb_rubric_assessments = (
        fb_data.get("RubricAssessments")
        or fb_data.get("rubricAssessments")
        or []
    )
    fb_rubric_by_id: dict = {}
    for ra in fb_rubric_assessments:
        if isinstance(ra, dict):
            rid = ra.get("RubricId") or ra.get("rubricId")
            if rid is not None:
                fb_rubric_by_id[str(rid)] = ra

    # ── PREFERRED PATH (LMS v20.26.4+, LE API 1.93+) ──────────────────────
    # New endpoints documented by D2L for the Rubrics API:
    #   GET /d2l/api/le/1.93/{ou}/rubrics?objectType=Dropbox&objectId={fid}
    #   GET /d2l/api/le/1.93/{ou}/assessment?assessmentType=Rubric&objectType=Dropbox
    #                                     &objectId={fid}&rubricId={rid}&userId={uid}
    #
    # The list endpoint returns an array of Rubric blocks with CriteriaGroups
    # (each group has Levels + Criteria with Cells). The assessment endpoint
    # returns a RubricAssessment with OverallOutcome and CriteriaOutcome.
    #
    # We try this path first; if it 404s (older tenant), we fall back to the
    # legacy probe-many-endpoints logic below.
    modern_rubrics: list[dict] = []
    modern_list_url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/1.93/{org_unit_id}/rubrics"
    )
    modern_list_params = {"objectType": "Dropbox", "objectId": str(folder_id)}
    try:
        ml_status, ml_data = await _bs_get(modern_list_url, headers, modern_list_params)
        if ml_status == 200:
            # Response may be a raw array OR a paged dict with "Items"
            if isinstance(ml_data, list):
                modern_rubrics = ml_data
            elif isinstance(ml_data, dict):
                modern_rubrics = ml_data.get("Items") or ml_data.get("items") or []
    except Exception:
        modern_rubrics = []

    def _flatten_groups(rubric_obj: dict) -> tuple[list, list]:
        """Flatten CriteriaGroups → (criteria, levels)."""
        all_crit = []
        all_lvl = []
        groups = rubric_obj.get("CriteriaGroups") or rubric_obj.get("criteriaGroups") or []
        for g in groups:
            if not isinstance(g, dict):
                continue
            for lvl in (g.get("Levels") or []):
                if isinstance(lvl, dict):
                    all_lvl.append(lvl)
            for c in (g.get("Criteria") or []):
                if isinstance(c, dict):
                    all_crit.append(c)
        # Older shape: flat Criteria/Levels at top
        if not all_crit:
            for c in (rubric_obj.get("Criteria") or []):
                if isinstance(c, dict): all_crit.append(c)
        if not all_lvl:
            for l in (rubric_obj.get("Levels") or []):
                if isinstance(l, dict): all_lvl.append(l)
        return all_crit, all_lvl

    async def _fetch_modern_assessment(rubric_id: int) -> dict:
        url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/1.93/{org_unit_id}/assessment"
        params = {
            "assessmentType": "Rubric",
            "objectType":     "Dropbox",
            "objectId":       str(folder_id),
            "rubricId":       str(rubric_id),
            "userId":         str(user_id),
        }
        try:
            _, data = await _bs_get(url, headers, params)
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    async def _build_modern(rubric_obj: dict) -> dict | None:
        rubric_id = rubric_obj.get("RubricId") or rubric_obj.get("Id")
        if rubric_id is None:
            return None
        criteria_list, levels_list = _flatten_groups(rubric_obj)
        assess = await _fetch_modern_assessment(rubric_id)

        # Build level lookup
        levels_by_id: dict = {}
        for lvl in levels_list:
            lid = lvl.get("Id")
            if lid is not None:
                levels_by_id[str(lid)] = lvl.get("Name") or ""

        # Extract CriteriaOutcome (new shape) or fall back to CriteriaResults
        outcomes_raw = (
            assess.get("CriteriaOutcome")
            or assess.get("criteriaOutcome")
            or assess.get("CriteriaResults")
            or []
        )
        crit_map: dict = {}
        for out in outcomes_raw:
            if not isinstance(out, dict):
                continue
            cid = out.get("CriterionId") or out.get("criterionId")
            if cid is None:
                continue
            fb_obj = out.get("Feedback") or {}
            fb_text = ""
            if isinstance(fb_obj, dict):
                fb_text = fb_obj.get("Html") or fb_obj.get("Text") or ""
            crit_map[str(cid)] = {
                "levelId": out.get("LevelId") or out.get("levelId"),
                "score":   out.get("Score") or out.get("score"),
                "comment": fb_text,
            }

        criteria_out = []
        for c in criteria_list:
            cid = c.get("Id")
            result = crit_map.get(str(cid)) if cid is not None else None
            level_name = ""
            level_desc = ""
            cell_points = None
            sel_level_id = (result or {}).get("levelId")
            if result and sel_level_id is not None:
                level_name = levels_by_id.get(str(sel_level_id), "")
                # The descriptive text ("por qué" del nivel) vive en la celda
                # criterio×nivel de la DEFINICIÓN de la rúbrica, no en la
                # evaluación. Unimos el LevelId seleccionado con esa celda.
                for cell in (c.get("Cells") or []):
                    if not isinstance(cell, dict):
                        continue
                    if str(cell.get("LevelId")) == str(sel_level_id):
                        dobj = cell.get("Description") or {}
                        if isinstance(dobj, dict):
                            level_desc = dobj.get("Html") or dobj.get("Text") or ""
                        cell_points = cell.get("Points")
                        break
            # Brightspace no devuelve Score cuando el criterio vale 0; si hay un
            # nivel seleccionado, usamos los puntos de esa celda (que pueden ser
            # 0) para no mostrar "—" en criterios evaluados en 0.
            crit_score = (result or {}).get("score")
            if crit_score is None and sel_level_id is not None and cell_points is not None:
                crit_score = cell_points
            criteria_out.append({
                "id":               cid,
                "name":             c.get("Name") or "",
                "level":            level_name,
                "levelDescription": level_desc,
                "points":           crit_score,
                "comment":          (result or {}).get("comment") or "",
            })

        # Overall info from OverallOutcome
        overall = assess.get("OverallOutcome") or assess.get("overallOutcome") or {}
        overall_level_name = ""
        if isinstance(overall, dict) and overall.get("LevelId") is not None:
            overall_level_name = levels_by_id.get(str(overall["LevelId"]), "")
            # If not found in criterion-group levels, try OverallLevels
            if not overall_level_name:
                for ol in (rubric_obj.get("OverallLevels") or []):
                    if isinstance(ol, dict) and str(ol.get("Id")) == str(overall["LevelId"]):
                        overall_level_name = ol.get("Name") or ""
                        break
        overall_fb_obj = overall.get("Feedback") if isinstance(overall, dict) else None
        overall_comment = ""
        if isinstance(overall_fb_obj, dict):
            overall_comment = overall_fb_obj.get("Html") or overall_fb_obj.get("Text") or ""

        # Compute max points as sum of max level points per criterion (analytic
        # rubrics). For holistic rubrics, use OverallLevels max.
        max_points = None
        try:
            per_crit_max = 0
            any_pts = False
            for c in criteria_list:
                cells = c.get("Cells") or []
                cell_max = 0
                for cell in cells:
                    pts = cell.get("Points")
                    if pts is not None:
                        any_pts = True
                        try:
                            cell_max = max(cell_max, float(pts))
                        except Exception:
                            pass
                per_crit_max += cell_max
            if any_pts and per_crit_max > 0:
                max_points = per_crit_max
        except Exception:
            max_points = None

        return {
            "rubricId":       rubric_id,
            "name":           rubric_obj.get("Name") or "",
            "outOf":          max_points,
            "score":          (overall or {}).get("Score"),
            "level":          overall_level_name,
            "overallComment": overall_comment,
            "criteria":       criteria_out,
            "_debug": {
                "source":     "le-1.93",
                "critCount":  len(criteria_list),
                "lvlCount":   len(levels_list),
                "outcomes":   len(outcomes_raw),
            },
        }

    if modern_rubrics:
        built = await asyncio.gather(*[_build_modern(r) for r in modern_rubrics])
        rubrics_out = [r for r in built if r]

    # ── LEGACY PATH ──────────────────────────────────────────────────────
    # Only used if the modern endpoint returned nothing (pre-1.93 tenant).
    if not rubrics_out and rubric_refs:
        async def _fetch_rubric(rubric_ref: dict) -> dict | None:
            rubric_id = rubric_ref.get("RubricId")
            if rubric_id is None:
                return None

            # Try BOTH the LP and LE-scoped rubric endpoints for the definition.
            # Course-scoped rubrics often require the LE path with orgUnitId.
            urls_def = [
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/rubrics/{rubric_id}",
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/rubrics/{rubric_id}",
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/unstable/{org_unit_id}/rubrics/{rubric_id}",
            ]
            # Criteria & levels sub-endpoints (some tenants require these explicitly)
            urls_crit = [
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/rubrics/{rubric_id}/criteria/",
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/rubrics/{rubric_id}/criteria/",
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/unstable/{org_unit_id}/rubrics/{rubric_id}/criteria/",
            ]
            urls_lvl = [
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}/rubrics/{rubric_id}/levels/",
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}/{org_unit_id}/rubrics/{rubric_id}/levels/",
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/unstable/{org_unit_id}/rubrics/{rubric_id}/levels/",
            ]

            # Assessment (teacher's per-criterion selection)
            assessment_url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/unstable/{org_unit_id}/assessment"
            assess_params = {
                "assessmentType": "Rubric",
                "objectType":     "Dropbox",
                "objectId":       str(folder_id),
                "rubricId":       str(rubric_id),
                "userId":         str(user_id),
            }
            # Alternative assessment endpoint: LE dropbox rubric assessments
            alt_assessment_url = (
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
                f"/{org_unit_id}/dropbox/folders/{folder_id}/rubrics/{rubric_id}/assessments/{user_id}"
            )

            # Fetch everything in parallel
            tasks = []
            for u in urls_def: tasks.append(_try(u))
            for u in urls_crit: tasks.append(_try(u))
            for u in urls_lvl: tasks.append(_try(u))
            tasks.append(_try(assessment_url, assess_params))
            tasks.append(_try(alt_assessment_url))

            results = await asyncio.gather(*tasks)
            n = len(urls_def)
            defs = results[0:n]
            crits = results[n:n*2]
            lvls = results[n*2:n*3]
            assess_primary = results[n*3] if len(results) > n*3 else {}
            assess_alt = results[n*3 + 1] if len(results) > n*3 + 1 else {}

            # Pick the first non-empty definition
            rubric_def = next((d for d in defs if d), {})
            # Pick first non-empty criteria list (may be a list or dict with Items)
            def _as_list(x):
                if isinstance(x, list): return x
                if isinstance(x, dict):
                    return x.get("Items") or x.get("items") or []
                return []
            criteria_list = []
            for c in crits:
                lst = _as_list(c)
                if lst: criteria_list = lst; break
            if not criteria_list:
                criteria_list = rubric_def.get("Criteria") or []
            levels_list = []
            for l in lvls:
                lst = _as_list(l)
                if lst: levels_list = lst; break
            if not levels_list:
                levels_list = rubric_def.get("Levels") or []

            # Assessment data: prefer embedded in feedback, then alt, then primary
            assess_data = fb_rubric_by_id.get(str(rubric_id)) or {}
            if not assess_data:
                assess_data = assess_alt or assess_primary or {}

            # Extract criterion results
            crit_results_raw = (
                assess_data.get("CriteriaResults")
                or assess_data.get("criteriaResults")
                or []
            )
            crit_map: dict = {}
            for cr in crit_results_raw:
                if not isinstance(cr, dict):
                    continue
                cid = cr.get("CriterionId") or cr.get("criterionId")
                if cid is None:
                    continue
                # level info: LevelAssessed (object) or LevelId (int)
                level_assessed = cr.get("LevelAssessed") or cr.get("levelAssessed") or {}
                level_id = None
                level_name_from_assess = ""
                if isinstance(level_assessed, dict):
                    level_id = level_assessed.get("Id") or level_assessed.get("LevelId")
                    level_name_from_assess = level_assessed.get("Name") or ""
                if level_id is None:
                    level_id = cr.get("LevelId") or cr.get("levelId")
                fb_obj_cr = cr.get("Feedback") or {}
                fb_text = ""
                if isinstance(fb_obj_cr, dict):
                    fb_text = fb_obj_cr.get("Html") or fb_obj_cr.get("Text") or ""
                points = (
                    cr.get("Score")
                    or cr.get("score")
                    or cr.get("PointsAssessed")
                    or cr.get("pointsAssessed")
                )
                crit_map[str(cid)] = {
                    "levelId":        level_id,
                    "levelNameInline": level_name_from_assess,
                    "score":          points,
                    "feedback":       fb_text,
                }

            # Build levels lookup
            levels_by_id: dict = {}
            for lvl in levels_list:
                if isinstance(lvl, dict):
                    lid = lvl.get("Id") or lvl.get("LevelId")
                    if lid is not None:
                        levels_by_id[str(lid)] = lvl.get("Name") or ""

            criteria_out = []
            for c in criteria_list:
                if not isinstance(c, dict):
                    continue
                cid = c.get("Id") or c.get("CriterionId")
                result = crit_map.get(str(cid)) if cid is not None else None
                level_name = ""
                if result:
                    level_name = result.get("levelNameInline") or ""
                    if not level_name and result.get("levelId") is not None:
                        level_name = levels_by_id.get(str(result["levelId"]), "")
                criteria_out.append({
                    "id":       cid,
                    "name":     c.get("Name") or c.get("CriterionName") or "",
                    "level":    level_name,
                    "points":   (result or {}).get("score"),
                    "comment":  (result or {}).get("feedback") or "",
                })

            # If we still have no criteria, fall back to the raw criterion results
            # (only shows IDs + levels/comments, but better than an empty state).
            if not criteria_out and crit_map:
                for cid, r in crit_map.items():
                    criteria_out.append({
                        "id":      cid,
                        "name":    f"Criterio {cid}",
                        "level":   r.get("levelNameInline") or levels_by_id.get(str(r.get("levelId")), ""),
                        "points":  r.get("score"),
                        "comment": r.get("feedback") or "",
                    })

            # Overall level (from assessment)
            overall = (
                assess_data.get("OverallLevel")
                or assess_data.get("Level")
                or {}
            )
            overall_name = ""
            if isinstance(overall, dict):
                overall_name = overall.get("Name") or overall.get("name") or ""

            # Overall comment (on the rubric itself, not per-criterion)
            overall_comment_obj = assess_data.get("Comment") or {}
            overall_comment = ""
            if isinstance(overall_comment_obj, dict):
                overall_comment = overall_comment_obj.get("Html") or overall_comment_obj.get("Text") or ""

            return {
                "rubricId":       rubric_id,
                "name":           rubric_def.get("Name") or rubric_ref.get("Name") or "",
                "outOf":          rubric_def.get("MaxPoints") or rubric_def.get("OutOf"),
                "score":          assess_data.get("Score") or assess_data.get("score"),
                "level":          overall_name,
                "overallComment": overall_comment,
                "criteria":       criteria_out,
                # For debugging; frontend ignores unless dev-mode
                "_debug": {
                    "defKeys":      list(rubric_def.keys()) if isinstance(rubric_def, dict) else [],
                    "critCount":    len(criteria_list),
                    "lvlCount":     len(levels_list),
                    "assessSource": "feedback-embedded" if fb_rubric_by_id.get(str(rubric_id))
                                    else ("alt-le" if assess_alt else "unstable"),
                    "critResults":  len(crit_results_raw),
                },
            }

        fetched = await asyncio.gather(*[_fetch_rubric(r) for r in rubric_refs])
        rubrics_out = [r for r in fetched if r]

    # Normalize feedback text (Brightspace uses Feedback.Text or Feedback.Html)
    fb_obj = fb_data.get("Feedback") if isinstance(fb_data.get("Feedback"), dict) else {}
    feedback_text = fb_obj.get("Html") or fb_obj.get("Text") or ""

    # Assignment-level instructions (lo que el docente escribió al crear la tarea)
    instr_obj = folder_data.get("Instructions") or folder_data.get("CustomInstructions") or {}
    assignment_instructions = ""
    if isinstance(instr_obj, dict):
        assignment_instructions = instr_obj.get("Html") or instr_obj.get("Text") or ""
    elif isinstance(instr_obj, str):
        assignment_instructions = instr_obj

    # Student's submission comment (lo que el estudiante escribió al subir su entrega)
    submission_comment = ""
    submitted_at = None
    subs_list = subs_data if isinstance(subs_data, list) else (
        (subs_data or {}).get("Items") or (subs_data or {}).get("items") or []
    )
    # Group assignments: /feedback/{userId} devuelve 404 porque el feedback vive
    # en la entidad GRUPO, no en el usuario. Resolvemos el grupo del estudiante
    # (vía la categoría GroupTypeId de la carpeta) para poder emparejar su
    # submission por EntityId de grupo.
    group_entity_ids: set[str] = set()
    group_type_id = folder_data.get("GroupTypeId")
    if group_type_id is not None:
        try:
            _, groups_data = await _bs_get(
                f"{BRIGHTSPACE_BASE_URL}/d2l/api/lp/{LP_VERSION}"
                f"/{org_unit_id}/groupcategories/{group_type_id}/groups/",
                headers,
            )
            if isinstance(groups_data, list):
                for g in groups_data:
                    if not isinstance(g, dict):
                        continue
                    enroll = [str(x) for x in (g.get("Enrollments") or [])]
                    if str(user_id) in enroll:
                        gid = g.get("GroupId")
                        if gid is not None:
                            group_entity_ids.add(str(gid))
        except Exception as e:
            logger.warning(
                "group resolve failed folder=%s user=%s: %s", folder_id, user_id, e
            )

    user_subs_match = []
    for s in subs_list:
        if not isinstance(s, dict):
            continue
        eid = (
            s.get("EntityId")
            or s.get("UserId")
            or (s.get("Entity") or {}).get("EntityId")
        )
        if str(eid) == str(user_id) or str(eid) in group_entity_ids:
            user_subs_match.append(s)

    # Fallback: si /feedback/{userId} no devolvió Feedback.Text, sacarlo del bulk
    if not feedback_text and user_subs_match:
        for entry in user_subs_match:
            fb_outer = entry.get("Feedback") or {}
            fb_inner = fb_outer.get("Feedback") if isinstance(fb_outer, dict) else None
            if isinstance(fb_inner, dict):
                feedback_text = fb_inner.get("Html") or fb_inner.get("Text") or ""
                if feedback_text:
                    break
    # Comment is per-submission; pick the most recent
    if user_subs_match:
        # Try to flatten submissions inside grouped entries (Brightspace returns
        # one entry per user with a Submissions[] array)
        flat = []
        for entry in user_subs_match:
            inner = entry.get("Submissions") or entry.get("submissions") or []
            if isinstance(inner, list) and inner:
                flat.extend([sub for sub in inner if isinstance(sub, dict)])
            else:
                flat.append(entry)
        # Pick most recent by SubmissionDate
        def _sub_date(x):
            return x.get("SubmissionDate") or x.get("submissionDate") or ""
        flat.sort(key=_sub_date, reverse=True)
        if flat:
            top = flat[0]
            submitted_at = _sub_date(top) or None
            cmt = top.get("Comment") or {}
            if isinstance(cmt, dict):
                submission_comment = cmt.get("Html") or cmt.get("Text") or ""
            elif isinstance(cmt, str):
                submission_comment = cmt

    # Fallback: si /feedback/{userId} no trae Score/OutOf (caso de calificación
    # cargada directamente al gradebook), consultar el grade item asociado al folder.
    final_score = fb_data.get("Score")
    final_out_of = fb_data.get("OutOf")
    if final_score is None or final_out_of is None:
        # GradeItemId puede estar en Assessment.GradeItemId o GradeItemId top-level
        assess = folder_data.get("Assessment") or {}
        grade_item_id = (
            assess.get("GradeItemId")
            or folder_data.get("GradeItemId")
            or assess.get("GradeItem")
        )
        logger.info(
            "grades fallback folder=%s user=%s gradeItemId=%s feedbackScore=%s feedbackOutOf=%s",
            folder_id, user_id, grade_item_id, final_score, final_out_of,
        )
        if grade_item_id:
            try:
                gv_url = (
                    f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
                    f"/{org_unit_id}/grades/{grade_item_id}/values/{user_id}"
                )
                gi_url = (
                    f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
                    f"/{org_unit_id}/grades/{grade_item_id}"
                )
                (gv_status, gv_data), (gi_status, gi_data) = await asyncio.gather(
                    _bs_get(gv_url, headers),
                    _bs_get(gi_url, headers),
                )
                logger.info(
                    "grades fallback resp gv_status=%s gv_keys=%s gi_status=%s gi_keys=%s",
                    gv_status,
                    list(gv_data.keys()) if isinstance(gv_data, dict) else type(gv_data).__name__,
                    gi_status,
                    list(gi_data.keys()) if isinstance(gi_data, dict) else type(gi_data).__name__,
                )
                if isinstance(gv_data, dict):
                    pv = (
                        gv_data.get("PointsNumerator")
                        or (gv_data.get("GradeValue") or {}).get("PointsNumerator")
                        or gv_data.get("WeightedNumerator")
                    )
                    # DisplayedGrade puede ser string como "25" o "25/100"
                    if pv is None:
                        dg = gv_data.get("DisplayedGrade")
                        if dg:
                            try:
                                pv = float(str(dg).split("/")[0].strip())
                            except Exception:
                                pv = None
                    if pv is not None and final_score is None:
                        final_score = pv
                if isinstance(gi_data, dict) and final_out_of is None:
                    final_out_of = gi_data.get("MaxPoints") or gi_data.get("PointsDenominator")
                logger.info(
                    "grades fallback final folder=%s user=%s score=%s outOf=%s",
                    folder_id, user_id, final_score, final_out_of,
                )
            except Exception as e:
                logger.warning("grades fallback failed folder=%s user=%s: %s", folder_id, user_id, e)

    # Learning outcomes (RAs) aligned to this assignment's rubric(s), if any.
    # The rubric→outcome link comes from the bulk /lo/alignments/ endpoint
    # (CriteriaOutcome does not carry OutcomeId on this tenant). We resolve
    # each rubric's OutcomeId GUIDs to their real code/label via the outcome
    # sets index. Both indexes are cached in GemeloService (TTL 10 min).
    outcomes_out: list[dict] = []
    try:
        from app.services.gemelo_service import GemeloService
        _svc = GemeloService(bs)
        align_index, outcome_index = await asyncio.gather(
            _svc._get_alignment_index(org_unit_id),
            _svc._get_outcome_index(org_unit_id),
        )
        seen_oids: set[str] = set()
        rubric_ids = {str(r.get("rubricId")) for r in rubrics_out if r.get("rubricId") is not None}
        for ref in rubric_refs:
            rid = ref.get("RubricId") if isinstance(ref, dict) else None
            if rid is not None:
                rubric_ids.add(str(rid))
        for rid in rubric_ids:
            oids = align_index.get(rid) or []
            resolved = []
            for oid in oids:
                info = (outcome_index or {}).get(oid) or {}
                item = {
                    "outcomeId": oid,
                    "code": info.get("code"),
                    "label": info.get("title") or info.get("description"),
                }
                resolved.append(item)
                if oid not in seen_oids:
                    seen_oids.add(oid)
                    outcomes_out.append(item)
            # Attach per-rubric outcomes so the UI can show them inline.
            for r in rubrics_out:
                if str(r.get("rubricId")) == rid:
                    r["outcomes"] = resolved
    except Exception as e:
        logger.warning("feedback outcomes resolve failed folder=%s: %s", folder_id, e)

    return JSONResponse(content={
        "folderId":               folder_id,
        "folderName":             folder_name,
        "userId":                 user_id,
        "score":                  final_score,
        "outOf":                  final_out_of,
        "isGraded":               fb_data.get("IsGraded"),
        "feedbackText":           feedback_text,
        "files":                  fb_data.get("Files") or [],
        "rubrics":                rubrics_out,
        "outcomes":               outcomes_out,
        "assignmentInstructions": assignment_instructions,
        "submissionComment":      submission_comment,
        "submittedAt":            submitted_at,
        "raw":                    fb_data,
    })


@router.get("/brightspace/course/{org_unit_id}/assignments/{assignment_id}")
async def brightspace_assignment(request: Request, org_unit_id: int, assignment_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/dropbox/folders/{assignment_id}"
    )
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/course/{org_unit_id}/assignment/{assignment_id}/rubric/student/{user_id}")
async def brightspace_rubric_evaluation(
    request: Request, org_unit_id: int, assignment_id: int, user_id: int
):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/unstable/{org_unit_id}/assessment"
    params = {
        "assessmentType": "Rubric",
        "objectType":     "Dropbox",
        "objectId":       str(assignment_id),
        "userId":         str(user_id),
    }
    status, data = await _bs_get(url, _auth_headers(token), params)
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/course/{org_unit_id}/dropbox/{folder_id}/feedback/user/{user_id}")
async def brightspace_dropbox_feedback_user(
    request: Request, org_unit_id: int, folder_id: int, user_id: int
):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/dropbox/folders/{folder_id}/feedback/{user_id}"
    )
    status, data = await _bs_get(url, _auth_headers(token))
    return JSONResponse(status_code=status, content=data)


@router.get(
    "/brightspace/course/{org_unit_id}/dropbox/{folder_id}/rubric/{rubric_id}/assessment/user/{user_id}"
)
async def brightspace_rubric_assessment_dropbox_user(
    request: Request,
    org_unit_id: int,
    folder_id:   int,
    rubric_id:   int,
    user_id:     int,
):
    token, err = _require_token_from_request(request)
    if err:
        return err
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/unstable/{org_unit_id}/assessment"
    params = {
        "assessmentType": "Rubric",
        "objectType":     "Dropbox",
        "objectId":       str(folder_id),
        "rubricId":       str(rubric_id),
        "userId":         str(user_id),
    }
    status, data = await _bs_get(url, _auth_headers(token), params)
    return JSONResponse(status_code=status, content=data)


@router.get("/brightspace/course/{org_unit_id}/dropbox/folder/{folder_id}/assessment/{user_id}")
async def brightspace_dropbox_assessment(
    request: Request, org_unit_id: int, folder_id: int, user_id: int
):
    token, err = _require_token_from_request(request)
    if err:
        return err
    # Primero obtener el rubricId del folder
    folder_url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/dropbox/folders/{folder_id}"
    )
    _, folder_data = await _bs_get(folder_url, _auth_headers(token))
    rubrics = (folder_data.get("Assessment") or {}).get("Rubrics") or []
    if not rubrics:
        return JSONResponse({"rubrics": [], "assessment": None, "folder": folder_data})

    rubric_id = rubrics[0].get("RubricId")
    url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/unstable/{org_unit_id}/assessment"
    params = {
        "assessmentType": "Rubric",
        "objectType":     "Dropbox",
        "objectId":       str(folder_id),
        "rubricId":       str(rubric_id),
        "userId":         str(user_id),
    }
    status, data = await _bs_get(url, _auth_headers(token), params)
    return JSONResponse(
        status_code=status,
        content={"rubricId": rubric_id, "assessment": data},
    )


# ──────────────────────────────────────────────────────────────────────────────
# Gemelo assignment endpoint (legacy en main.py)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/gemelo/course/{org_unit_id}/assignment/{folder_id}/student/{user_id}")
async def gemelo_assignment(request: Request, org_unit_id: int, folder_id: int, user_id: int):
    token, err = _require_token_from_request(request)
    if err:
        return err
    headers = _auth_headers(token)

    folder_url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/dropbox/folders/{folder_id}"
    )
    rubric_url = (
        f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/{LE_VERSION}"
        f"/{org_unit_id}/dropbox/folders/{folder_id}"
        f"/submissions/"
    )
    import asyncio
    (_, folder_data), (_, subs_data) = await asyncio.gather(
        _bs_get(folder_url, headers),
        _bs_get(rubric_url, headers),
    )

    rubrics = (folder_data.get("Assessment") or {}).get("Rubrics") or []
    rubric_id = rubrics[0].get("RubricId") if rubrics else None

    assessment = None
    if rubric_id:
        url = f"{BRIGHTSPACE_BASE_URL}/d2l/api/le/unstable/{org_unit_id}/assessment"
        params = {
            "assessmentType": "Rubric",
            "objectType":     "Dropbox",
            "objectId":       str(folder_id),
            "rubricId":       str(rubric_id),
            "userId":         str(user_id),
        }
        _, assessment = await _bs_get(url, headers, params)

    subs_list = subs_data if isinstance(subs_data, list) else (
        subs_data.get("Items") or subs_data.get("items") or []
    )
    user_subs = [
        s for s in subs_list
        if str(s.get("EntityId") or s.get("UserId") or "") == str(user_id)
    ]

    return {
        "orgUnitId":  org_unit_id,
        "folderId":   folder_id,
        "userId":     user_id,
        "folder":     folder_data,
        "rubricId":   rubric_id,
        "assessment": assessment,
        "submissions": user_subs,
    }


