import React, { useEffect, useMemo, useState } from "react";
import { apiGetCached } from "../../utils/api";
import { COLORS } from "../../utils/colors";
import { toDate, fmtPct } from "../../utils/helpers";

/**
 * AssignmentsPanel: estado de las asignaciones (dropbox folders) del curso
 * para el docente — cuántas ha creado, cuántas tienen entregas (con % de
 * entrega de los estudiantes), cuántas están calificadas y cuántas vencieron.
 *
 * Fuente: /brightspace/course/{ou}/dropbox/folders (proxy read-only).
 * Brightspace entrega por folder: DueDate, TotalUsers,
 * TotalUsersWithSubmissions y TotalUsersWithFeedback.
 */
function AssignmentsPanel({ orgUnitId }) {
  const [folders, setFolders] = useState(null); // null = cargando, [] = sin datos
  const [err, setErr] = useState("");
  const [showList, setShowList] = useState(false); // detalle colapsado por defecto

  useEffect(() => {
    if (!orgUnitId) return;
    let cancelled = false;
    (async () => {
      setFolders(null);
      setErr("");
      try {
        const data = await apiGetCached(
          `/brightspace/course/${orgUnitId}/dropbox/folders`,
          { ttl: 300_000 }
        );
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.Objects)
          ? data.Objects
          : Array.isArray(data?.Items)
          ? data.Items
          : [];
        if (!cancelled) setFolders(list);
      } catch {
        if (!cancelled) {
          setErr("No se pudieron cargar las asignaciones del curso.");
          setFolders([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgUnitId]);

  const { rows, stats } = useMemo(() => {
    const now = new Date();
    // Solo asignaciones publicadas (no ocultas para los estudiantes)
    const visible = (folders || []).filter((f) => f?.IsHidden !== true);
    const rows = visible.map((f) => {
      const due =
        toDate(f?.DueDate) || toDate(f?.Availability?.EndDate) || null;
      const start = toDate(f?.Availability?.StartDate) || null;
      const totalUsers = Number(f?.TotalUsers ?? 0) || 0;
      const withSub = Number(f?.TotalUsersWithSubmissions ?? 0) || 0;
      const withFb = Number(f?.TotalUsersWithFeedback ?? 0) || 0;
      const isOverdue = !!(due && due < now);
      const isScheduled = !!(start && start > now);
      const submissionPct = totalUsers > 0 ? (withSub / totalUsers) * 100 : null;
      // "Calificada" = ya hay feedback para todas las entregas recibidas
      const isGraded = withSub > 0 && withFb >= withSub;
      return {
        id: f?.Id,
        name: f?.Name || `Asignación ${f?.Id ?? ""}`,
        due,
        isOverdue,
        isScheduled,
        totalUsers,
        withSub,
        withFb,
        submissionPct,
        isGraded,
      };
    });

    // Ordenar por fecha de entrega ascendente; sin fecha al final
    rows.sort((a, b) => {
      if (a.due && b.due) return a.due - b.due;
      if (a.due) return -1;
      if (b.due) return 1;
      return String(a.name).localeCompare(String(b.name), "es");
    });

    const open = rows.filter((r) => !r.isScheduled);
    const sumUsers = open.reduce((acc, r) => acc + r.totalUsers, 0);
    const sumSubs = open.reduce((acc, r) => acc + r.withSub, 0);

    const stats = {
      created: rows.length,
      hidden: (folders || []).length - visible.length,
      withSubmissions: rows.filter((r) => r.withSub > 0).length,
      graded: rows.filter((r) => r.isGraded).length,
      overdue: rows.filter((r) => r.isOverdue).length,
      globalSubmissionPct: sumUsers > 0 ? (sumSubs / sumUsers) * 100 : null,
    };
    return { rows, stats };
  }, [folders]);

  const fmtDue = (d) =>
    d
      ? d.toLocaleDateString("es-CO", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "Sin fecha";

  if (folders === null) {
    return (
      <div className="empty-state" style={{ minHeight: 100 }}>
        <span
          className="pulse-dot"
          style={{ background: COLORS.brand, width: 10, height: 10 }}
        />
        <span style={{ fontSize: 12 }}>Cargando asignaciones…</span>
      </div>
    );
  }

  if (err) {
    return (
      <div className="empty-state" style={{ minHeight: 100 }}>
        <span className="empty-state-icon">⚠️</span>
        <span style={{ fontSize: 12 }}>{err}</span>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="empty-state" style={{ minHeight: 120 }}>
        <span className="empty-state-icon">📭</span>
        <span style={{ fontSize: 12 }}>Este curso no tiene asignaciones creadas</span>
        <span style={{ fontSize: 11, color: "var(--muted)", textAlign: "center" }}>
          Cuando crees asignaciones (dropbox) en Brightspace aparecerán aquí con su
          estado de entregas y calificación.
        </span>
      </div>
    );
  }

  const miniStats = [
    { label: "Activas", value: stats.created, color: "var(--brand)", bg: "var(--brand-light)", icon: "📝" },
    { label: "No publicadas", value: stats.hidden, color: "var(--muted)", bg: "var(--bg)", icon: "🙈" },
    { label: "Con entregas", value: stats.withSubmissions, color: COLORS.ok, bg: "var(--ok-bg)", icon: "📥" },
    { label: "Calificadas", value: stats.graded, color: COLORS.brand, bg: "var(--brand-light)", icon: "✅" },
    { label: "Vencidas", value: stats.overdue, color: stats.overdue > 0 ? COLORS.critical : "var(--muted)", bg: stats.overdue > 0 ? "var(--critical-bg)" : "var(--bg)", icon: "⏰" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Total de asignaciones del curso (activas + no publicadas) */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 32, fontWeight: 900, fontFamily: "var(--font-mono)", color: "var(--text)", lineHeight: 1.1 }}>
          {stats.created + stats.hidden}
        </div>
        <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Total de asignaciones
        </div>
      </div>

      {/* Mini KPIs — una sola fila dentro de la tarjeta, separados por líneas */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
        }}
      >
        {miniStats.map((s, i) => (
          <div
            key={s.label}
            style={{
              padding: "6px 8px",
              borderLeft: i > 0 ? "1px solid var(--border)" : "none",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 5,
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: s.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
              }}
              aria-hidden="true"
            >
              {s.icon}
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 900,
                fontFamily: "var(--font-mono)",
                color: s.color,
                lineHeight: 1.1,
              }}
            >
              {s.value}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "var(--muted)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* % global de entregas */}
      {stats.globalSubmissionPct != null && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: "var(--muted)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Entregas de estudiantes (asignaciones abiertas o vencidas)
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 900,
                fontFamily: "var(--font-mono)",
                color:
                  stats.globalSubmissionPct >= 70
                    ? COLORS.ok
                    : stats.globalSubmissionPct >= 40
                    ? COLORS.watch
                    : COLORS.critical,
              }}
            >
              {fmtPct(stats.globalSubmissionPct)}
            </span>
          </div>
          <div
            style={{
              height: 6,
              borderRadius: 999,
              background: "rgba(148,163,184,0.2)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, stats.globalSubmissionPct)}%`,
                borderRadius: 999,
                background:
                  stats.globalSubmissionPct >= 70
                    ? COLORS.ok
                    : stats.globalSubmissionPct >= 40
                    ? COLORS.watch
                    : COLORS.critical,
              }}
            />
          </div>
        </div>
      )}

      {/* Botón para desplegar el detalle por asignación (colapsado por defecto) */}
      <button
        className="btn"
        onClick={() => setShowList((v) => !v)}
        aria-expanded={showList}
        style={{ alignSelf: "center", fontSize: 12, padding: "7px 16px", borderRadius: 10 }}
      >
        📋 {showList ? "Ocultar detalle" : `Ver detalle de asignaciones (${rows.length})`} {showList ? "▴" : "▾"}
      </button>

      {/* Listado por asignación */}
      {showList && (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          maxHeight: 320,
          overflowY: "auto",
          paddingRight: 2,
        }}
      >
        {rows.map((r) => {
          const statusChip = r.isOverdue
            ? { label: "Vencida", color: COLORS.critical, bg: "var(--critical-bg)" }
            : r.isScheduled
            ? { label: "Programada", color: "var(--muted)", bg: "var(--bg)" }
            : { label: "Abierta", color: COLORS.ok, bg: "var(--ok-bg)" };
          const subColor =
            r.submissionPct == null
              ? "var(--muted)"
              : r.submissionPct >= 70
              ? COLORS.ok
              : r.submissionPct >= 40
              ? COLORS.watch
              : COLORS.critical;
          return (
            <div
              key={r.id ?? r.name}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "9px 12px",
                background: "var(--card)",
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: "var(--text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={r.name}
                >
                  {r.name}
                </div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                  📅 {fmtDue(r.due)}
                </div>
              </div>

              <span
                className="tag"
                style={{
                  background: statusChip.bg,
                  color: statusChip.color,
                  flexShrink: 0,
                  fontWeight: 800,
                }}
              >
                {statusChip.label}
              </span>

              <div style={{ flexShrink: 0, textAlign: "center", minWidth: 90 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 900,
                    fontFamily: "var(--font-mono)",
                    color: subColor,
                  }}
                >
                  {r.withSub}/{r.totalUsers}
                  {r.submissionPct != null && (
                    <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 4 }}>
                      ({fmtPct(r.submissionPct)})
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>
                  Entregas
                </div>
              </div>

              <div style={{ flexShrink: 0, textAlign: "center", minWidth: 70 }}>
                <div
                  title={r.withFb > r.withSub
                    ? "Incluye estudiantes calificados sin entrega (p. ej. nota 0)"
                    : "Estudiantes con calificación / total de estudiantes"}
                  style={{
                    fontSize: 12,
                    fontWeight: 900,
                    fontFamily: "var(--font-mono)",
                    color: r.isGraded
                      ? COLORS.ok
                      : r.withFb > 0
                      ? COLORS.watch
                      : "var(--muted)",
                  }}
                >
                  {Math.min(r.withFb, r.totalUsers)}/{r.totalUsers}
                  {r.isGraded && <span style={{ marginLeft: 3 }}>✓</span>}
                </div>
                <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>
                  Calificadas
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

export default React.memo(AssignmentsPanel);
