"""
Endpoints administrativos del backend.

Estos endpoints son invocados por sistemas externos (typicamente AWS
EventBridge u otro scheduler) o usados manualmente durante la
configuracion inicial del entorno. NO son para consumo del frontend
ni del flujo normal de usuarios.

Seguridad:
  - /admin/sync-cron-all valida un secret compartido en el header
    X-Cron-Secret contra la env CRON_SHARED_SECRET. Sin ese match
    devuelve 401.
  - El endpoint temporal /admin/show-refresh-token ya fue ELIMINADO del
    codigo (era una herramienta de una sola vez para capturar el
    refresh_token inicial del scheduler).
"""
from __future__ import annotations

import logging
import os
from typing import List, Optional

from fastapi import APIRouter, Header, HTTPException, Query, Request

from app.services.cron_runner import run_sync_for_all_courses
from app.state import get_session

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/admin", tags=["admin"])


#|---------- Validacion del secret compartido del schedule ----------|
def _validate_cron_secret(provided: Optional[str]) -> None:
    """
    Verifica que el header X-Cron-Secret coincida con el valor de la
    env CRON_SHARED_SECRET.

    Lanza:
      - 503 si el servidor no tiene CRON_SHARED_SECRET configurado
        (no permitimos ejecutar el endpoint sin secret seteado, porque
        seria un agujero abierto).
      - 401 si el header esta ausente o no coincide.
    """
    expected = os.getenv("CRON_SHARED_SECRET", "")
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="CRON_SHARED_SECRET no configurado en el servidor",
        )
    if not provided or provided != expected:
        raise HTTPException(
            status_code=401,
            detail="X-Cron-Secret invalido o ausente",
        )


#|---------- Endpoint principal: sincronizacion automatica de cursos ----------|
@router.post("/sync-cron-all")
async def admin_sync_cron_all(
    org_unit_ids_csv: Optional[str] = Query(
        None,
        alias="orgUnitIds",
        description=(
            "Lista opcional de orgUnitIds en formato CSV (ej. '29120,40000'). "
            "Si se omite, sincroniza TODOS los cursos con enrollments activos."
        ),
    ),
    x_cron_secret: Optional[str] = Header(default=None, alias="X-Cron-Secret"),
):
    """
    Endpoint que dispara la sincronizacion de snapshots contra Brightspace
    para los cursos activos. Pensado para ser invocado por un schedule
    externo (AWS EventBridge u otro) cada N minutos, manteniendo la DB
    fresca para acelerar los dashboards.

    Auth:
        - Header X-Cron-Secret debe coincidir con la env
          CRON_SHARED_SECRET.
        - NO requiere sesion de usuario; el endpoint usa una cuenta de
          servicio cuyo refresh_token vive en la env
          BRIGHTSPACE_SERVICE_REFRESH_TOKEN.

    Comportamiento:
        - Por defecto sincroniza todos los cursos con al menos un
          enrollment activo en la DB.
        - Si se pasa el query param ?orgUnitIds=29120,40000, limita a
          esa lista (util para empezar piloto con un curso).

    Idempotente: SyncService hace upsert sobre los snapshots, asi que
    reintentos del schedule no duplican datos.

    Returns: resumen con stats agregadas y detalle por curso.
    """
    _validate_cron_secret(x_cron_secret)

    refresh_token = os.getenv("BRIGHTSPACE_SERVICE_REFRESH_TOKEN", "")
    if not refresh_token:
        raise HTTPException(
            status_code=503,
            detail="BRIGHTSPACE_SERVICE_REFRESH_TOKEN no configurado en el servidor",
        )

    #|---------- Parseo del CSV de orgUnitIds (opcional) ----------|
    org_unit_ids: Optional[List[int]] = None
    if org_unit_ids_csv:
        try:
            org_unit_ids = [
                int(x.strip())
                for x in org_unit_ids_csv.split(",")
                if x.strip()
            ]
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="orgUnitIds debe ser una lista CSV de enteros (ej. '29120,40000')",
            )

    logger.info(
        "sync-cron-all disparado (orgUnitIds=%s)",
        org_unit_ids if org_unit_ids else "TODOS",
    )

    result = await run_sync_for_all_courses(refresh_token, org_unit_ids)

    #|---------- Si la mintada inicial fallo, devolvemos 502 para que el schedule lo note ----------|
    if not result.get("ok") and result.get("totalCourses", 0) == 0 and result.get("error"):
        # Caso: refresh_token roto o Brightspace caido — el schedule
        # debe registrar el error y posiblemente alertar.
        raise HTTPException(status_code=502, detail=result["error"])

    # Caso: todos OK, o falla parcial (algunos cursos OK, otros no).
    # Devolvemos 200 con el resumen para que el schedule lo loguee.
    return result

