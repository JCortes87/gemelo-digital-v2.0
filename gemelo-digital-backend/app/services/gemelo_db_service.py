from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from app.db.models import CourseMetricHistory, Enrollment, Student, StudentCourseMetricSnapshot
from app.db.session import SessionLocal


def upsert_course_metric_history(orgUnitId: int, overview: Dict[str, Any]) -> None:
    """
    Guarda (o actualiza) el snapshot diario de métricas agregadas del curso.
    Se llama en background tras cada overview exitoso.

    Extrae avgPct, atRiskPct, coveragePct y totalStudents del dict de overview
    devuelto por build_course_overview o build_course_overview_from_db.
    """
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Extraer métricas del overview (soporta ambas formas del dict)
    gradebook = overview.get("courseGradebook") or {}
    avg_pct = gradebook.get("avgCurrentPerformancePct") or overview.get("avgCurrentPerformancePct")
    coverage_pct = gradebook.get("avgCoveragePct") or overview.get("avgCoveragePct")

    risk_dist = overview.get("globalRiskDistribution") or {}
    total = overview.get("studentsCount") or 0
    alto = risk_dist.get("alto", 0)
    medio = risk_dist.get("medio", 0)
    at_risk_pct = round((alto + medio) / total * 100, 2) if total > 0 else None

    db = SessionLocal()
    try:
        entity = db.execute(
            select(CourseMetricHistory).where(
                CourseMetricHistory.org_unit_id == orgUnitId,
                CourseMetricHistory.snapshot_date == today,
            )
        ).scalar_one_or_none()

        now = datetime.utcnow()
        if entity is None:
            entity = CourseMetricHistory(
                org_unit_id=orgUnitId,
                snapshot_date=today,
                avg_pct=float(avg_pct) if avg_pct is not None else None,
                at_risk_pct=at_risk_pct,
                coverage_pct=float(coverage_pct) if coverage_pct is not None else None,
                total_students=int(total),
                created_at=now,
                updated_at=now,
            )
            db.add(entity)
        else:
            if avg_pct is not None:
                entity.avg_pct = float(avg_pct)
            if at_risk_pct is not None:
                entity.at_risk_pct = at_risk_pct
            if coverage_pct is not None:
                entity.coverage_pct = float(coverage_pct)
            if total:
                entity.total_students = int(total)
            entity.updated_at = now

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_course_metric_history(orgUnitId: int, days: int = 90) -> List[Dict[str, Any]]:
    """
    Devuelve los snapshots diarios de tendencias del curso (últimos N días),
    ordenados por fecha ascendente.
    """
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")

    db = SessionLocal()
    try:
        rows = db.execute(
            select(CourseMetricHistory).where(
                CourseMetricHistory.org_unit_id == orgUnitId,
                CourseMetricHistory.snapshot_date >= cutoff,
            ).order_by(CourseMetricHistory.snapshot_date)
        ).scalars().all()

        return [
            {
                "date": r.snapshot_date,
                "avgPct": r.avg_pct,
                "atRiskPct": r.at_risk_pct,
                "coveragePct": r.coverage_pct,
                "totalStudents": r.total_students,
            }
            for r in rows
        ]
    finally:
        db.close()


async def build_course_overview_from_db(orgUnitId: int) -> dict:
    """
    Lee el overview agregado del curso directamente desde Postgres,
    sin tocar la API de Brightspace.

    Devuelve la misma forma que `GemeloService.build_course_overview`
    (medias del gradebook, distribucion de riesgo, alertas, etc.) pero
    armada a partir de los snapshots persistidos.

    Depende de que `SyncService.sync_student_metric_snapshots(orgUnitId)`
    haya corrido recientemente. Si no hay snapshots para ese curso,
    retorna `hasData: False`.
    """
    db = SessionLocal()
    try:
        #|---------- Lectura de snapshots filtrando estudiantes inactivos ----------|
        # El JOIN con Enrollment garantiza que solo aparezcan estudiantes que
        # siguen inscritos en el curso. Sin este filtro, estudiantes removidos
        # de Brightspace quedaban apareciendo en "Estudiantes prioritarios" y
        # en las metricas agregadas porque sus snapshots viejos seguian en DB.
        rows = db.execute(
            select(StudentCourseMetricSnapshot)
            .join(
                Enrollment,
                (Enrollment.org_unit_id == StudentCourseMetricSnapshot.org_unit_id)
                & (Enrollment.brightspace_user_id == StudentCourseMetricSnapshot.brightspace_user_id),
            )
            .where(
                StudentCourseMetricSnapshot.org_unit_id == orgUnitId,
                Enrollment.is_active.is_(True),
            )
        ).scalars().all()

        student_rows = db.execute(
            select(Student).where(
                Student.brightspace_user_id.in_(
                    [r.brightspace_user_id for r in rows]
                )
            )
        ).scalars().all()

        student_names = {
            s.brightspace_user_id: s.display_name or str(s.brightspace_user_id)
            for s in student_rows
        }

        students_count = len(rows)

        thresholds = {
            "critical": 50,
            "watch": 70,
        }

        if students_count == 0:
            return {
                "orgUnitId": orgUnitId,
                "studentsCount": 0,
                "hasData": False,
                "source": "db",
                "lastSyncAt": None,
                "macroCompetencies": [],
                "courseGradebook": {
                    "avgCurrentPerformancePct": None,
                    "avgCoveragePct": None,
                    "avgPendingSubmittedPct": 0.0,
                    "avgNotSubmittedPct": 0.0,
                    "avgOpenPct": 0.0,
                    "avgGradedItemsCount": 0,
                    "avgTotalItemsCount": 0,
                    "coverageCountText": "0/0",
                    "status": "sin_datos",
                },
                "performanceBands": {
                    "optimal":  {"count": 0, "pct": 0},
                    "watch":    {"count": 0, "pct": 0},
                    "critical": {"count": 0, "pct": 0},
                    "noData":   {"count": 0, "pct": 0},
                },
                "globalRiskDistribution": {"alto": 0, "medio": 0, "bajo": 0, "pending": 0},
                "studentsAtRisk": [],
                "thresholds": thresholds,
                "alerts": [],
            }

        def _avg(values):
            nums = [v for v in values if v is not None]
            if not nums:
                return None
            return round(sum(nums) / len(nums), 2)

        avg_perf     = _avg([r.current_performance_pct for r in rows])
        avg_cov      = _avg([r.coverage_pct for r in rows])
        avg_pending  = _avg([r.pending_submitted_weight_pct for r in rows]) or 0.0
        avg_not_sub  = _avg([r.not_submitted_weight_pct for r in rows]) or 0.0
        avg_open     = _avg([r.open_weight_pct for r in rows]) or 0.0

        avg_graded = round(sum(r.graded_items_count for r in rows) / students_count, 2)
        avg_total  = round(sum(r.total_items_count  for r in rows) / students_count, 2)

        # Edad de los datos: max(updated_at) sobre los snapshots del curso.
        last_sync_at = max((r.updated_at for r in rows if r.updated_at), default=None)
        last_sync_at_iso = last_sync_at.isoformat() if last_sync_at else None

        risk_dist = {"alto": 0, "medio": 0, "bajo": 0, "pending": 0}
        students_at_risk = []

        band_optimal  = 0
        band_watch    = 0
        band_critical = 0
        band_no_data  = 0

        for r in rows:
            risk = r.risk_level or "pending"
            risk_dist[risk] = risk_dist.get(risk, 0) + 1

            perf = r.current_performance_pct
            if perf is None:
                band_no_data += 1
            else:
                try:
                    pf = float(perf)
                    if pf >= float(thresholds["watch"]):
                        band_optimal += 1
                    elif pf >= float(thresholds["critical"]):
                        band_watch += 1
                    else:
                        band_critical += 1
                except Exception:
                    band_no_data += 1

            is_at_risk = (
                risk in ("alto", "medio")
                or (r.current_performance_pct is not None and r.current_performance_pct < 50.0)
                or (r.not_submitted_weight_pct or 0) > 0
                or (r.coverage_pct or 0) < 60
            )

            if is_at_risk:
                students_at_risk.append({
                    "userId":                     r.brightspace_user_id,
                    "displayName":                student_names.get(r.brightspace_user_id, str(r.brightspace_user_id)),
                    "risk":                       risk,
                    "currentPerformancePct":      r.current_performance_pct,
                    "coveragePct":                r.coverage_pct,
                    "notSubmittedWeightPct":      r.not_submitted_weight_pct,
                    "pendingSubmittedWeightPct":  r.pending_submitted_weight_pct,
                    "pendingSubmittedCount":      r.pending_submitted_count,
                    "overdueCount":               r.overdue_count,
                    "openCount":                  r.open_count,
                    "gradedItemsCount":           r.graded_items_count,
                    "totalItemsCount":            r.total_items_count,
                })

        def _pct(count: int) -> float:
            if students_count == 0:
                return 0
            return round((count / students_count) * 100, 2)

        performance_bands = {
            "optimal":  {"count": band_optimal,  "pct": _pct(band_optimal)},
            "watch":    {"count": band_watch,    "pct": _pct(band_watch)},
            "critical": {"count": band_critical, "pct": _pct(band_critical)},
            "noData":   {"count": band_no_data,  "pct": _pct(band_no_data)},
        }

        alerts = []

        pending_pct = round(100 - (avg_cov or 0), 2)
        if avg_cov is not None and avg_cov < 100:
            severity = "observacion" if avg_cov >= 50 else "alto"
            alerts.append({
                "id": "coverage_low",
                "severity": severity,
                "title": "Cobertura de evaluación",
                "message": f"El curso tiene {avg_cov:.2f}% de cobertura; queda {pending_pct:.2f}% pendiente por calificar.",
                "kpis": {
                    "coveragePct":       avg_cov,
                    "pendingPct":        pending_pct,
                    "gradedItemsCount":  round(avg_graded),
                    "totalItemsCount":   round(avg_total),
                    "coverageCountText": f"{round(avg_graded)}/{round(avg_total)}",
                },
            })

        if avg_perf is not None and avg_perf < thresholds["watch"]:
            severity = "observacion" if avg_perf >= thresholds["critical"] else "alto"
            alerts.append({
                "id": "performance_low",
                "severity": severity,
                "title": "Desempeño académico del curso",
                "message": f"La nota promedio actual del curso es {avg_perf:.2f}%.",
                "kpis": {
                    "avgCurrentPerformancePct": avg_perf,
                },
            })

        alto = risk_dist.get("alto", 0)
        pct_alto = _pct(alto)
        if alto > 0:
            alerts.append({
                "id": "risk_concentration_high",
                "severity": "observacion" if pct_alto < 30 else "alto",
                "title": "Concentración de riesgo alto",
                "message": f"{alto} de {students_count} estudiantes ({pct_alto:.2f}%) están en riesgo ALTO.",
                "actionRequired": "Revisar estudiantes prioritarios y activar intervención.",
                "affectedCount": alto,
                "kpis": {
                    "alto":    risk_dist.get("alto", 0),
                    "medio":   risk_dist.get("medio", 0),
                    "bajo":    risk_dist.get("bajo", 0),
                    "pending": risk_dist.get("pending", 0),
                    "pctAlto": pct_alto,
                },
            })

        return {
            "orgUnitId": orgUnitId,
            "studentsCount": students_count,
            "hasData": True,
            "source": "db",
            "lastSyncAt": last_sync_at_iso,
            "macroCompetencies": [],
            "courseGradebook": {
                "avgCurrentPerformancePct": avg_perf,
                "avgCoveragePct":           avg_cov,
                "avgPendingSubmittedPct":   avg_pending,
                "avgNotSubmittedPct":       avg_not_sub,
                "avgOpenPct":               avg_open,
                "avgGradedItemsCount":      avg_graded,
                "avgTotalItemsCount":       avg_total,
                "coverageCountText":        f"{round(avg_graded)}/{round(avg_total)}",
                "status": (
                    "solido"
                    if avg_perf is not None and avg_perf >= thresholds["watch"]
                    else "observacion"
                    if avg_perf is not None and avg_perf >= thresholds["critical"]
                    else "alto"
                    if avg_perf is not None
                    else "sin_datos"
                ),
            },
            "performanceBands":       performance_bands,
            "globalRiskDistribution": risk_dist,
            "studentsAtRisk":         students_at_risk,
            "thresholds":             thresholds,
            "alerts":                 alerts,
        }

    finally:
        db.close()
