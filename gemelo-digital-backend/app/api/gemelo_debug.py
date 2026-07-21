# app/api/gemelo_debug.py
"""Sub-router de endpoints de debug (protegidos por require_debug_enabled).
Extraido de gemelo.py (refactor #15). Sin prefix: se monta bajo /gemelo.
"""
from fastapi import APIRouter, Depends, Query

from app.security import require_debug_enabled
from app.services.gemelo_service import GemeloService
from app.api.gemelo_shared import get_service, _http500

router = APIRouter()


@router.get("/debug/{orgUnitId}/folders", dependencies=[Depends(require_debug_enabled)])
async def debug_folders(
    orgUnitId: int,
    svc: GemeloService = Depends(get_service),
):
    try:
        data = await svc.bs.list_dropbox_folders(orgUnitId)
        return {"orgUnitId": orgUnitId, "pythonType": str(type(data)), "data": data}
    except Exception as e:
        _http500(e, "debug_folders", orgUnitId=orgUnitId)


@router.get("/debug/{orgUnitId}/rubric/{rubricId}", dependencies=[Depends(require_debug_enabled)])
async def debug_rubric(
    orgUnitId: int,
    rubricId: str,
    svc: GemeloService = Depends(get_service),
):
    try:
        return await svc.bs.get_rubric_detail(orgUnitId, rubricId)
    except Exception as e:
        _http500(e, "debug_rubric", orgUnitId=orgUnitId, rubricId=rubricId)



@router.get(
    "/debug/{orgUnitId}/folder/{folderId}/student/{userId}/rubric/{rubricId}/assessment",
    dependencies=[Depends(require_debug_enabled)],
)
async def debug_assessment(
    orgUnitId: int,
    folderId: int,
    userId: int,
    rubricId: int,
    svc: GemeloService = Depends(get_service),
):
    try:
        return await svc.bs.get_dropbox_rubric_assessment(
            orgUnitId=orgUnitId,
            folderId=folderId,
            rubricId=rubricId,
            userId=userId,
        )
    except Exception as e:
        _http500(
            e, "debug_assessment",
            orgUnitId=orgUnitId, folderId=folderId,
            userId=userId, rubricId=rubricId,
        )


@router.get("/debug/{orgUnitId}/classlist", dependencies=[Depends(require_debug_enabled)])
async def debug_classlist(
    orgUnitId: int,
    full: bool = Query(False, description="Si true, devuelve la lista completa"),
    limit: int = Query(3, ge=1, le=500, description="Tamaño del sample cuando full=false"),
    svc: GemeloService = Depends(get_service),
):
    try:
        data = await svc.bs.list_classlist(orgUnitId)

        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            items = data.get("Items") or data.get("items") or []
        else:
            items = []

        payload = {
            "orgUnitId": orgUnitId,
            "pythonType": str(type(data)),
            "count": len(items),
        }
        payload["items" if full else "sample"] = items if full else items[:limit]
        return payload
    except Exception as e:
        _http500(e, "debug_classlist", orgUnitId=orgUnitId)


@router.get("/debug/{orgUnitId}/grades/items", dependencies=[Depends(require_debug_enabled)])
async def debug_grade_items(
    orgUnitId: int,
    svc: GemeloService = Depends(get_service),
):
    try:
        data = await svc.bs.list_grade_items(orgUnitId)

        if isinstance(data, dict):
            data_list = data.get("Items") or data.get("items") or []
        else:
            data_list = data if isinstance(data, list) else []

        parsed = []
        for it in (data_list[:10] if isinstance(data_list, list) else []):
            if isinstance(it, dict):
                parsed.append({
                    "Id": it.get("Id") or it.get("Identifier"),
                    "Name": it.get("Name"),
                    "Weight": it.get("Weight"),
                    "GradeType": it.get("GradeType"),
                    "CategoryId": it.get("CategoryId"),
                    # Incluimos fechas para diagnóstico del "no enviado"
                    "DueDate": it.get("DueDate"),
                    "EndDate": it.get("EndDate"),
                })

        return {
            "orgUnitId": orgUnitId,
            "pythonType": str(type(data)),
            "count": len(data_list) if isinstance(data_list, list) else None,
            "parsedSample": parsed,
            "rawSample": data_list[:5] if isinstance(data_list, list) else data_list,
        }
    except Exception as e:
        _http500(e, "debug_grade_items", orgUnitId=orgUnitId)


@router.get("/debug/{orgUnitId}/grades/{gradeObjectId}/student/{userId}", dependencies=[Depends(require_debug_enabled)])
async def debug_grade_value(
    orgUnitId: int,
    gradeObjectId: int,
    userId: int,
    svc: GemeloService = Depends(get_service),
):
    try:
        data = await svc.bs.get_grade_value(orgUnitId, gradeObjectId, userId)
        return {
            "orgUnitId": orgUnitId,
            "gradeObjectId": gradeObjectId,
            "userId": userId,
            "pythonType": str(type(data)),
            "raw": data,
            "extracted": {
                "PointsNumerator": data.get("PointsNumerator") if isinstance(data, dict) else None,
                "PointsDenominator": data.get("PointsDenominator") if isinstance(data, dict) else None,
                "WeightedNumerator": data.get("WeightedNumerator") if isinstance(data, dict) else None,
                "WeightedDenominator": data.get("WeightedDenominator") if isinstance(data, dict) else None,
            },
        }
    except Exception as e:
        _http500(
            e, "debug_grade_value",
            orgUnitId=orgUnitId, gradeObjectId=gradeObjectId, userId=userId,
        )

