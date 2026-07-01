"""
Sincronización automática de cursos activos contra Brightspace.

Este módulo encapsula el ciclo de trabajo que ejecuta el endpoint
/admin/sync-cron-all cuando un schedule externo (típicamente AWS
EventBridge) lo dispara periódicamente. La idea es mantener los
snapshots en Postgres frescos para que las lecturas del dashboard
se sirvan rápido sin pegarle a Brightspace en cada visita.

Flujo de cada corrida:

  1. Lee BRIGHTSPACE_SERVICE_REFRESH_TOKEN del entorno y mintea un
     access_token nuevo con esa credencial.
  2. Resuelve la lista de orgUnitIds a sincronizar (todos los cursos
     activos por defecto, o una lista explícita pasada por el caller).
  3. Para cada curso, ejecuta SyncService.sync_student_metric_snapshots
     y acumula el resultado.
  4. Devuelve un resumen con éxitos, fallos y detalle por curso.

El ciclo es idempotente: SyncService hace upsert sobre
student_course_metric_snapshots, así que si AWS reintenta por timeout
no se duplica nada — solo se reescriben los mismos campos.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from app.db.models import Enrollment
from app.db.session import SessionLocal
from app.services.brightspace_auth import mint_access_token_from_refresh
from app.services.brightspace_client import BrightspaceClient
from app.services.sync_service import SyncService

logger = logging.getLogger("uvicorn.error")


#|---------- Resolver la lista de cursos a sincronizar ----------|
def list_active_org_unit_ids() -> List[int]:
    """
    Devuelve los orgUnitIds distintos que tienen al menos un enrollment
    activo en la base de datos. Es la fuente de verdad para "qué cursos
    debemos refrescar" en cada corrida del schedule.

    Si la tabla enrollments está vacía (instancia recién desplegada),
    retorna lista vacía y el caller debe decidir qué hacer (típicamente
    no-op).
    """
    db = SessionLocal()
    try:
        rows = db.execute(
            select(Enrollment.org_unit_id)
            .where(Enrollment.is_active.is_(True))
            .distinct()
        ).scalars().all()
        return sorted({int(x) for x in rows if x is not None})
    finally:
        db.close()


#|---------- Ciclo principal de sincronización para un batch de cursos ----------|
async def run_sync_for_all_courses(
    refresh_token: str,
    org_unit_ids: Optional[List[int]] = None,
) -> Dict[str, Any]:
    """
    Ejecuta el ciclo de sincronización para los cursos especificados,
    o para todos los cursos activos si no se pasa una lista.

    Pasos internos:
      1. Mintar un access_token fresh a partir del refresh_token recibido.
         Si falla (refresh_token revocado, red, Brightspace caído),
         retorna early con ok=False sin tocar ningún curso.
      2. Resolver la lista de cursos a procesar.
      3. Iterar y sincronizar cada uno secuencialmente. Errores en un
         curso no detienen al resto — se acumulan en el resumen.
      4. Retornar resumen agregado.

    Args:
        refresh_token: el refresh_token de la cuenta que tiene permisos
                       para leer los cursos. Típicamente leído de la env
                       BRIGHTSPACE_SERVICE_REFRESH_TOKEN por el endpoint
                       que llama a esta función.
        org_unit_ids: lista opcional de cursos a sincronizar. Si es None,
                      se usa la lista completa de cursos activos en DB.

    Returns:
        Dict con la siguiente forma:

        {
            "ok": bool,                    # True si TODOS los cursos sincronizaron OK
            "totalCourses": int,
            "successCount": int,
            "failureCount": int,
            "results": [
                {
                    "orgUnitId": int,
                    "ok": bool,
                    "details": dict | None,   # detalle del SyncService si exitoso
                    "error": str | None,      # mensaje corto si falló
                },
                ...
            ],
            "error": str | None,           # error global si la mintada inicial falló
        }
    """
    if not refresh_token:
        return _empty_result(
            ok=False,
            error="No hay refresh_token disponible para mintar access_token",
        )

    #|---------- Mintar el access_token ----------|
    token_data = await mint_access_token_from_refresh(refresh_token)
    if not token_data or not token_data.get("access_token"):
        return _empty_result(
            ok=False,
            error="No se pudo mintar access_token (refresh_token inválido/revocado o problema de red)",
        )

    access_token = token_data["access_token"]
    bs = BrightspaceClient(tokens={"access_token": access_token})
    sync_svc = SyncService(bs)

    #|---------- Resolver lista de cursos ----------|
    if org_unit_ids is None:
        org_unit_ids = list_active_org_unit_ids()

    if not org_unit_ids:
        logger.info("sync-cron-all: no hay cursos activos para sincronizar")
        return _empty_result(ok=True, error=None)

    logger.info(
        "sync-cron-all: arrancando sync de %d curso(s): %s",
        len(org_unit_ids), org_unit_ids,
    )

    #|---------- Sincronizar cada curso, acumulando resultados ----------|
    results: List[Dict[str, Any]] = []
    success = 0
    failure = 0

    for ou in org_unit_ids:
        try:
            #|---------- Sincronizar enrollments antes que snapshots ----------|
            # sync_classlist actualiza la tabla enrollments con la classlist
            # actual de Brightspace y desactiva los estudiantes removidos.
            # Es necesario para que las consultas filtradas por is_active
            # excluyan a los estudiantes ya no inscritos del curso.
            classlist_details = await sync_svc.sync_classlist(ou)
            snapshots_details = await sync_svc.sync_student_metric_snapshots(ou)

            results.append({
                "orgUnitId": ou,
                "ok": True,
                "details": {
                    "classlist": classlist_details,
                    "snapshots": snapshots_details,
                },
                "error": None,
            })
            success += 1
            logger.info(
                "sync-cron-all ou=%s OK (deactivated=%s)",
                ou,
                classlist_details.get("deactivated_enrollments", 0),
            )
        except Exception as e:
            error_msg = str(e)[:300]
            results.append({
                "orgUnitId": ou,
                "ok": False,
                "details": None,
                "error": error_msg,
            })
            failure += 1
            logger.warning("sync-cron-all ou=%s FALLO: %s", ou, error_msg)

    return {
        "ok": failure == 0,
        "error": None,
        "totalCourses": len(org_unit_ids),
        "successCount": success,
        "failureCount": failure,
        "results": results,
    }


#|---------- Helper: armar respuesta vacia para early-return ----------|
def _empty_result(ok: bool, error: Optional[str]) -> Dict[str, Any]:
    """
    Construye un resumen 'vacio' (sin cursos procesados) para los casos
    en que abortamos antes de iterar (ej. mintada fallida o lista vacia).
    """
    return {
        "ok": ok,
        "error": error,
        "totalCourses": 0,
        "successCount": 0,
        "failureCount": 0,
        "results": [],
    }
