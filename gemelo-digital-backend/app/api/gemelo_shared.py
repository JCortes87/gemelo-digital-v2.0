# app/api/gemelo_shared.py
"""Helpers compartidos por los sub-routers de gemelo (refactor #15).

Extraidos de gemelo.py para que gemelo_outcomes / gemelo_debug / gemelo_admin
puedan importarlos sin crear ciclos de importacion con gemelo.py.
"""
import logging
import traceback

from fastapi import Depends, HTTPException, Request

from app.services.brightspace_client import BrightspaceClient, get_brightspace_client
from app.services.gemelo_service import GemeloService

logger = logging.getLogger("uvicorn.error")


def get_service(
    request: Request,
    bs: "BrightspaceClient" = Depends(get_brightspace_client),
) -> GemeloService:
    return GemeloService(bs)


def _http500(e: Exception, where: str, **ctx):
    # Preservar HTTPException (401/403/404/429...) con su status original: un
    # error de autenticación (401) NO debe enmascararse como 500 — inflaba la
    # RollbackAlarm en cada redeploy (sesiones en memoria perdidas → 401→500) e
    # impedía que el frontend detectara el 401 para pedir re-login.
    if isinstance(e, HTTPException):
        raise e
    logger.error("HTTP 500 en %s | ctx=%s | err=%s", where, ctx, str(e))
    logger.error(traceback.format_exc())
    raise HTTPException(status_code=500, detail=str(e))

