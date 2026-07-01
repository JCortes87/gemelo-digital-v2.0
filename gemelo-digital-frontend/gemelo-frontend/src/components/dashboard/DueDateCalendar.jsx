import React, { useMemo, useState, useEffect } from "react";
import { apiGet } from "../../utils/api";

/**
 * Per-assignment upcoming delivery list.
 *
 * Shows every assignment with a due date individually (not grouped), sorted
 * chronologically. Each item has:
 *   - Blue chip with abbreviated date
 *   - Assignment name
 *   - Hover tooltip showing exact time remaining
 *   - ⚠ alarm icon if the deadline is within 2 days
 *
 * Props:
 *   orgUnitId: course id
 */
// Local-time date key (YYYY-MM-DD) — avoids UTC drift that shifts 11pm
// deadlines to the next day on toISOString().
function localDateKey(d) {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function DueDateCalendar({ orgUnitId, studentRows, studentEvidences }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Lifted hover state so list items can cross-highlight the calendar
  const [hoverId, setHoverId] = useState(null);

  useEffect(() => {
    if (!orgUnitId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await apiGet(`/gemelo/course/${orgUnitId}/grade-items`);
        if (!alive) return;
        const list = Array.isArray(data?.items) ? data.items : [];
        setItems(list);
      } catch (e) {
        if (alive) setError(String(e?.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [orgUnitId]);

  // Compute per-gradeObjectId submission counts from studentRows (teacher view)
  const submissionStats = useMemo(() => {
    const rows = Array.isArray(studentRows) ? studentRows : [];
    if (rows.length === 0) return null;
    const loaded = rows.filter((s) => !s.isLoading && Array.isArray(s.evidences));
    if (loaded.length === 0) return null;
    const stats = new Map(); // gradeObjectId → { graded, total }
    for (const s of loaded) {
      for (const ev of (s.evidences || [])) {
        const gid = String(ev.gradeObjectId);
        if (!stats.has(gid)) stats.set(gid, { graded: 0, total: 0 });
        const entry = stats.get(gid);
        entry.total += 1;
        if (ev.isGraded || ev.scorePct != null) entry.graded += 1;
      }
    }
    return stats;
  }, [studentRows]);

  // Student view: map gradeObjectId → submission state
  // "graded" = professor has scored it, "overdue" = past due and not graded,
  // null = pending (can't determine submission status without dropbox API)
  const studentSubmissionMap = useMemo(() => {
    const evs = Array.isArray(studentEvidences) ? studentEvidences : [];
    if (evs.length === 0) return null;
    const map = new Map();
    for (const ev of evs) {
      if (ev.isGraded || ev.scorePct != null || ev.status === "graded") {
        map.set(String(ev.gradeObjectId), "graded");
      } else if (ev.status === "overdue_unscored" || ev.isOverdue) {
        map.set(String(ev.gradeObjectId), "overdue");
      }
      // "pending" items are not added — we can't tell if submitted
    }
    return map;
  }, [studentEvidences]);

  // Extract each assignment individually (not grouped by date)
  const assignments = useMemo(() => {
    const now = new Date();
    const list = [];
    for (const it of items) {
      if (!it?.dueDate) continue;
      const d = new Date(it.dueDate);
      if (Number.isNaN(d.getTime())) continue;
      let start = null;
      if (it.startDate) {
        const s = new Date(it.startDate);
        if (!Number.isNaN(s.getTime())) start = s;
      }
      const msDiff = d - now;
      const daysUntil = Math.floor(msDiff / 86400000);
      const hoursUntil = Math.floor(msDiff / 3600000);
      const stats = submissionStats?.get(String(it.id)) || null;
      const studentState = studentSubmissionMap?.get(String(it.id)) ?? null;
      // "graded" → ✓, "overdue" → ✗, null → no icon (unknown)
      const didSubmit = studentState === "graded" ? true : (studentState === "overdue" ? false : null);
      list.push({
        id: it.id,
        name: it.name || `Ítem ${it.id}`,
        weightPct: Number(it.weightPct || 0),
        start,
        due: d,
        dueIso: it.dueDate,
        startIso: it.startDate || null,
        msDiff,
        daysUntil,
        hoursUntil,
        isPast: msDiff < 0,
        isUrgent: msDiff >= 0 && daysUntil <= 2,
        source: it.source,
        gradedCount: stats?.graded ?? null,
        totalStudents: stats?.total ?? null,
        didSubmit,
      });
    }
    list.sort((a, b) => a.due - b.due);
    return list;
  }, [items]);

  const upcoming = useMemo(() => assignments.filter((a) => !a.isPast), [assignments]);
  const recent = useMemo(
    () => assignments.filter((a) => a.isPast).slice(-3).reverse(),
    [assignments]
  );

  const formatRemaining = (a) => {
    if (a.isPast) {
      const daysAgo = Math.abs(a.daysUntil);
      if (daysAgo === 0) return "Venció hoy";
      if (daysAgo === 1) return "Venció ayer";
      return `Venció hace ${daysAgo} días`;
    }
    if (a.daysUntil === 0) {
      if (a.hoursUntil <= 1) return "Vence en menos de 1 hora";
      return `Vence hoy en ${a.hoursUntil}h`;
    }
    if (a.daysUntil === 1) return "Vence mañana";
    if (a.daysUntil <= 7) return `Vence en ${a.daysUntil} días`;
    if (a.daysUntil <= 30) return `Vence en ${Math.round(a.daysUntil / 7)} semana(s)`;
    return `Vence en ${a.daysUntil} días`;
  };

  const formatExactDate = (a) => {
    return a.due.toLocaleDateString("es-CO", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
        Cargando entregas del curso…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--muted)" }}>
        <div style={{ fontSize: 24, opacity: 0.4, marginBottom: 6 }}>📅</div>
        <div style={{ fontSize: 12 }}>No se pudieron cargar las entregas del curso.</div>
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div style={{ padding: "24px 20px", textAlign: "center", color: "var(--muted)" }}>
        <div style={{ fontSize: 28, opacity: 0.4, marginBottom: 8 }}>📅</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>
          Sin fechas de entrega en este curso
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
          {items.length === 0
            ? "El curso no tiene ítems calificables aún."
            : `${items.length} ítems del gradebook, pero ninguno tiene fecha configurada.`}
        </div>
      </div>
    );
  }

  const renderItem = (a, past = false) => {
    const dateObj = a.due;
    const weekday = dateObj.toLocaleDateString("es-CO", { weekday: "short" });
    const day = dateObj.toLocaleDateString("es-CO", { day: "2-digit" });
    const month = dateObj.toLocaleDateString("es-CO", { month: "short" });
    const chipColor = past ? "#94a3b8" : (a.isUrgent ? "#dc2626" : "#0b5fff");
    const chipBg = past
      ? "rgba(148, 163, 184, 0.10)"
      : (a.isUrgent ? "rgba(220, 38, 38, 0.08)" : "rgba(11, 95, 255, 0.06)");
    const chipBorder = past
      ? "rgba(148, 163, 184, 0.30)"
      : (a.isUrgent ? "rgba(220, 38, 38, 0.35)" : "rgba(11, 95, 255, 0.25)");

    const tooltip = `${formatRemaining(a)} · ${formatExactDate(a)}`;
    const isHovered = hoverId === a.id;

    return (
      <div
        key={`${a.id}-${a.dueIso}`}
        title={tooltip}
        onMouseEnter={() => setHoverId(a.id)}
        onMouseLeave={() => setHoverId((cur) => (cur === a.id ? null : cur))}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 12px",
          borderRadius: 10,
          border: `1px solid ${isHovered ? chipColor : chipBorder}`,
          background: isHovered ? `${chipColor}18` : chipBg,
          cursor: "pointer",
          transition: "transform 0.15s, box-shadow 0.15s, background 0.15s, border-color 0.15s",
          transform: isHovered ? "translateY(-1px)" : "",
          boxShadow: isHovered ? `0 4px 12px ${chipColor}22` : "",
        }}
      >
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          minWidth: 46, padding: "6px 8px", borderRadius: 8,
          background: chipColor,
          color: "#fff",
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", opacity: 0.9 }}>{weekday}</div>
          <div style={{ fontSize: 15, fontWeight: 900, lineHeight: 1 }}>{day}</div>
          <div style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", opacity: 0.9 }}>{month}</div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 12, fontWeight: 700, color: "var(--text)",
          }}>
            {a.isUrgent && (
              <span
                title="¡Atención! Esta entrega vence pronto"
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 18, height: 18, borderRadius: "50%",
                  background: "#dc2626",
                  color: "#fff", fontSize: 11, fontWeight: 900,
                  flexShrink: 0,
                  animation: "pulse-alert 1.4s ease-in-out infinite",
                }}
              >!</span>
            )}
            <span style={{
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{a.name}</span>
          </div>
          <div style={{ fontSize: 10, color: past ? "var(--muted)" : chipColor, marginTop: 2, fontWeight: 600 }}>
            {formatRemaining(a)}
          </div>
        </div>

        {a.didSubmit != null && (
          <span style={{
            flexShrink: 0, fontSize: 12, fontWeight: 900,
            width: 22, height: 22, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: a.didSubmit ? "var(--ok-bg)" : "var(--critical-bg)",
            color: a.didSubmit ? "var(--ok)" : "var(--critical)",
            border: `1px solid ${a.didSubmit ? "var(--ok)" : "var(--critical)"}33`,
          }}>
            {a.didSubmit ? "✓" : "✗"}
          </span>
        )}
        {a.totalStudents != null && a.totalStudents > 0 && (
          <span style={{
            flexShrink: 0, fontSize: 10, fontWeight: 700,
            padding: "2px 8px", borderRadius: 10,
            background: (a.gradedCount ?? 0) >= a.totalStudents
              ? "var(--ok-bg)"
              : (a.gradedCount ?? 0) > 0
                ? "var(--watch-bg)"
                : "var(--bg)",
            color: (a.gradedCount ?? 0) >= a.totalStudents
              ? "var(--ok)"
              : (a.gradedCount ?? 0) > 0
                ? "var(--watch)"
                : "var(--muted)",
            border: "1px solid var(--border)",
            fontFamily: "var(--font-mono)",
          }}>
            {a.gradedCount ?? 0}/{a.totalStudents}
          </span>
        )}
        {a.weightPct > 0 && (
          <span className="tag" style={{
            flexShrink: 0, fontSize: 10, fontWeight: 700,
            background: past ? "var(--bg)" : "rgba(11, 95, 255, 0.10)",
            color: past ? "var(--muted)" : "#0b5fff",
          }}>
            {a.weightPct.toFixed(0)}%
          </span>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <style>{`
        @keyframes pulse-alert {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.6); }
          50% { box-shadow: 0 0 0 5px rgba(220, 38, 38, 0); }
        }
        @media (max-width: 900px) {
          .ddc-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Two-column layout: calendar (compact, left) + list (right) */}
      <div
        className="ddc-layout"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(320px, 380px) 1fr",
          gap: 14,
          alignItems: "start",
        }}
      >
        <MonthGrid
          assignments={assignments}
          hoverId={hoverId}
          onHoverChange={setHoverId}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {upcoming.length > 0 ? (
            <div>
              <div style={{
                fontSize: 11, color: "var(--muted)", fontWeight: 800,
                textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span>📅 Próximas entregas ({upcoming.length})</span>
                {upcoming.some((a) => a.isUrgent) && (
                  <span style={{
                    fontSize: 10, color: "#dc2626", fontWeight: 800,
                    padding: "2px 6px", borderRadius: 10,
                    background: "rgba(220, 38, 38, 0.08)",
                    border: "1px solid rgba(220, 38, 38, 0.25)",
                  }}>
                    ⚠ {upcoming.filter((a) => a.isUrgent).length} urgente(s)
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 340, overflowY: "auto" }}>
                {upcoming.map((a) => renderItem(a, false))}
              </div>
            </div>
          ) : (
            <div style={{ padding: "16px 12px", textAlign: "center", color: "var(--muted)", fontSize: 12, background: "var(--bg)", borderRadius: 10, border: "1px solid var(--border)" }}>
              ✓ Sin entregas pendientes
            </div>
          )}

          {recent.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                Vencidas recientemente
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {recent.map((a) => renderItem(a, true))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 10, color: "var(--muted)", textAlign: "center", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
        {items.length} ítems del curso · {assignments.length} con fecha de entrega
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// MonthGrid — lightweight month calendar with hover-range highlighting.
// When the user hovers over an assignment chip, the date range from its
// start date to its due date is highlighted across the grid cells.
// ─────────────────────────────────────────────────────────────────────────
function MonthGrid({ assignments, hoverId, onHoverChange }) {
  // Start on the month that contains the first upcoming assignment (or today)
  const initialMonth = React.useMemo(() => {
    const now = new Date();
    const firstUpcoming = assignments.find((a) => !a.isPast);
    const ref = firstUpcoming ? firstUpcoming.due : now;
    return new Date(ref.getFullYear(), ref.getMonth(), 1);
  }, [assignments]);

  const [cursorMonth, setCursorMonth] = useState(initialMonth);

  useEffect(() => {
    setCursorMonth(initialMonth);
  }, [initialMonth]);

  const year = cursorMonth.getFullYear();
  const month = cursorMonth.getMonth();

  // Build the grid days (6 rows × 7 cols = 42 cells, starting from the
  // Sunday before or on the 1st of the month)
  const gridDays = useMemo(() => {
    const firstOfMonth = new Date(year, month, 1);
    const firstWeekday = firstOfMonth.getDay(); // 0 = Sun
    const start = new Date(year, month, 1 - firstWeekday);
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      cells.push(d);
    }
    return cells;
  }, [year, month]);

  // Index assignments by local YYYY-MM-DD (by due date) for quick lookup.
  // IMPORTANT: we use local date components — NOT toISOString — because a
  // deadline like "2026-04-15T23:59:00-05:00" converts to "2026-04-16" in UTC
  // and would show on the wrong day in the calendar.
  const byDate = useMemo(() => {
    const map = new Map();
    for (const a of assignments) {
      const key = localDateKey(a.due);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a);
    }
    return map;
  }, [assignments]);

  const hoverAssignment = useMemo(
    () => assignments.find((a) => a.id === hoverId) || null,
    [assignments, hoverId]
  );

  const isInHoverRange = (day) => {
    if (!hoverAssignment) return false;
    const start = hoverAssignment.start || hoverAssignment.due;
    const end = hoverAssignment.due;
    const t = day.getTime();
    return t >= new Date(start.toDateString()).getTime() &&
           t <= new Date(end.toDateString()).getTime();
  };

  const isHoverStart = (day) =>
    hoverAssignment?.start &&
    day.toDateString() === hoverAssignment.start.toDateString();

  const isHoverEnd = (day) =>
    hoverAssignment &&
    day.toDateString() === hoverAssignment.due.toDateString();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthName = cursorMonth.toLocaleDateString("es-CO", {
    month: "long",
    year: "numeric",
  });

  const weekdayHeaders = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

  const goPrev = () => setCursorMonth(new Date(year, month - 1, 1));
  const goNext = () => setCursorMonth(new Date(year, month + 1, 1));
  const goToday = () => {
    const t = new Date();
    setCursorMonth(new Date(t.getFullYear(), t.getMonth(), 1));
  };

  return (
    <div style={{
      border: "1px solid var(--border)",
      borderRadius: 12,
      padding: 12,
      background: "var(--card)",
    }}>
      {/* Month header with nav */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        marginBottom: 10,
      }}>
        <button
          onClick={goPrev}
          style={{
            width: 28, height: 28, borderRadius: 6,
            border: "1px solid var(--border)", background: "var(--bg)",
            cursor: "pointer", color: "var(--text)", fontSize: 14,
            fontFamily: "var(--font)",
          }}
          title="Mes anterior"
        >‹</button>
        <button
          onClick={goToday}
          style={{
            height: 28, padding: "0 10px", borderRadius: 6,
            border: "1px solid var(--border)", background: "var(--bg)",
            cursor: "pointer", color: "var(--muted)", fontSize: 10,
            fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
            fontFamily: "var(--font)",
          }}
          title="Ir al mes actual"
        >Hoy</button>
        <div style={{
          flex: 1,
          fontSize: 13, fontWeight: 800, color: "var(--text)",
          textTransform: "capitalize", textAlign: "center",
        }}>
          {monthName}
        </div>
        <button
          onClick={goNext}
          style={{
            width: 28, height: 28, borderRadius: 6,
            border: "1px solid var(--border)", background: "var(--bg)",
            cursor: "pointer", color: "var(--text)", fontSize: 14,
            fontFamily: "var(--font)",
          }}
          title="Mes siguiente"
        >›</button>
      </div>

      {/* Weekday headers */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        gap: 2,
        marginBottom: 4,
      }}>
        {weekdayHeaders.map((w) => (
          <div key={w} style={{
            fontSize: 9, fontWeight: 800, color: "var(--muted)",
            textAlign: "center", padding: "4px 0",
            letterSpacing: "0.05em",
          }}>
            {w}
          </div>
        ))}
      </div>

      {/* Day cells — compact circular style */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        gap: 4,
      }}>
        {gridDays.map((day, idx) => {
          const key = localDateKey(day);
          const inMonth = day.getMonth() === month;
          const dayAssignments = byDate.get(key) || [];
          const isToday = day.getTime() === today.getTime();
          const inRange = isInHoverRange(day);
          const isRangeStart = isHoverStart(day);
          const isRangeEnd = isHoverEnd(day);

          // Pick a "primary color" for this cell based on the most urgent
          // assignment due that day (red > blue > grey-past)
          let primary = null;
          if (dayAssignments.length > 0) {
            const urgent = dayAssignments.find((a) => a.isUrgent);
            const upcomingA = dayAssignments.find((a) => !a.isPast);
            const past = dayAssignments.find((a) => a.isPast);
            primary = urgent || upcomingA || past;
          }
          const primaryColor = !primary
            ? null
            : (primary.isPast ? "#94a3b8" : (primary.isUrgent ? "#dc2626" : "#0b5fff"));

          // Cell background: hover range takes precedence
          let bg = "transparent";
          let borderColor = "transparent";
          if (inRange) {
            // Color the range using the hovered assignment's own color
            const hov = assignments.find((a) => a.id === hoverId);
            const hovColor = hov
              ? (hov.isPast ? "#94a3b8" : (hov.isUrgent ? "#dc2626" : "#0b5fff"))
              : "#0b5fff";
            bg = `${hovColor}1f`;
            borderColor = `${hovColor}55`;
          }
          if (isToday) {
            borderColor = "var(--brand)";
          }

          const hasAssignment = dayAssignments.length > 0;
          const isPrimaryHovered =
            hasAssignment && dayAssignments.some((a) => a.id === hoverId);

          return (
            <div
              key={idx}
              style={{
                aspectRatio: "1 / 1",
                padding: 2,
                borderRadius: 8,
                background: bg,
                border: `1.5px solid ${borderColor}`,
                opacity: inMonth ? 1 : 0.35,
                position: "relative",
                transition: "background 0.12s, border-color 0.12s",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              onMouseEnter={
                hasAssignment && primary
                  ? () => onHoverChange(primary.id)
                  : undefined
              }
              onMouseLeave={
                hasAssignment && primary
                  ? () => onHoverChange((cur) => (cur === primary.id ? null : cur))
                  : undefined
              }
              title={
                hasAssignment
                  ? dayAssignments
                      .map((a) => `${a.isUrgent ? "⚠ " : ""}${a.name} — vence ${a.due.toLocaleDateString("es-CO")}`)
                      .join("\n")
                  : undefined
              }
            >
              {hasAssignment ? (
                <div style={{
                  width: "88%", aspectRatio: "1 / 1", maxWidth: 36,
                  borderRadius: "50%",
                  background: isPrimaryHovered ? primaryColor : `${primaryColor}26`,
                  border: `1.5px solid ${primaryColor}${isPrimaryHovered ? "" : "88"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 800,
                  color: isPrimaryHovered ? "#fff" : primaryColor,
                  cursor: "pointer",
                  position: "relative",
                  boxShadow: isPrimaryHovered ? `0 2px 8px ${primaryColor}55` : "",
                  transition: "all 0.12s",
                }}>
                  {day.getDate()}
                  {primary?.didSubmit === true && (
                    <span style={{
                      position: "absolute",
                      top: -3, right: -3,
                      width: 12, height: 12, borderRadius: "50%",
                      background: "#12B76A", color: "#fff",
                      fontSize: 8, fontWeight: 900,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: "1.5px solid #fff",
                    }}>✓</span>
                  )}
                  {primary?.isUrgent && primary?.didSubmit !== true && (
                    <span style={{
                      position: "absolute",
                      top: -3, right: -3,
                      width: 10, height: 10, borderRadius: "50%",
                      background: "#dc2626", color: "#fff",
                      fontSize: 7, fontWeight: 900,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: "1.5px solid #fff",
                    }}>!</span>
                  )}
                  {dayAssignments.length > 1 && (
                    <span style={{
                      position: "absolute",
                      bottom: -2, right: -2,
                      fontSize: 7, fontWeight: 900,
                      color: "#fff", background: "var(--muted)",
                      borderRadius: 5, padding: "0 3px",
                      border: "1.5px solid #fff",
                    }}>+{dayAssignments.length - 1}</span>
                  )}
                </div>
              ) : (
                <div style={{
                  fontSize: 11, fontWeight: isToday ? 800 : 500,
                  color: isToday ? "var(--brand)" : (inMonth ? "var(--text)" : "var(--muted)"),
                }}>
                  {day.getDate()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Fixed-height hover info footer — always rendered to avoid layout shift */}
      <div style={{
        marginTop: 10,
        minHeight: 52,
        padding: "8px 12px",
        borderRadius: 8,
        background: hoverAssignment ? "rgba(11, 95, 255, 0.06)" : "var(--bg)",
        border: `1px solid ${hoverAssignment ? "rgba(11, 95, 255, 0.25)" : "var(--border)"}`,
        fontSize: 11,
        display: "flex", alignItems: "center", gap: 8,
        transition: "background 0.15s, border-color 0.15s",
      }}>
        {hoverAssignment ? (
          <>
            <span style={{ fontSize: 14 }}>📌</span>
            <div style={{ flex: 1 }}>
              <div style={{
                fontWeight: 800, color: "var(--text)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{hoverAssignment.name}</div>
              <div style={{ color: "var(--muted)", fontSize: 10, marginTop: 1 }}>
                {hoverAssignment.start ? (
                  <>
                    Disponible desde <strong style={{ color: "var(--brand)" }}>
                      {hoverAssignment.start.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}
                    </strong>
                    {" → "}
                  </>
                ) : "Vence "}
                <strong style={{ color: hoverAssignment.isUrgent ? "#dc2626" : "var(--brand)" }}>
                  {hoverAssignment.due.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}
                </strong>
              </div>
            </div>
          </>
        ) : (
          <div style={{ color: "var(--muted)", fontStyle: "italic", textAlign: "center", flex: 1, fontSize: 10 }}>
            Pasa el cursor sobre una entrega para ver sus fechas
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(DueDateCalendar);
