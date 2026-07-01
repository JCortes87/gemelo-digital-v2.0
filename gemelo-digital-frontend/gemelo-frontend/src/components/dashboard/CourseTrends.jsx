import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { COLORS } from "../../utils/colors";

/**
 * CourseTrends: line chart showing evolution over time of
 * avgPct, atRiskPct, coveragePct.
 *
 * Data comes from useCourseSnapshots (localStorage-persisted).
 * If there are < 2 snapshots, shows an empty state.
 */
function CourseTrends({ snapshots = [] }) {
  const data = React.useMemo(() => snapshots.map((s) => ({
    date: s.date ? s.date.slice(5) : "",  // MM-DD
    "Nota promedio": s.avgPct != null ? Number((s.avgPct / 10).toFixed(2)) : null,
    "% en riesgo": s.atRiskPct != null ? Number(s.atRiskPct.toFixed(1)) : null,
    "Cobertura": s.coveragePct != null ? Number(s.coveragePct.toFixed(1)) : null,
  })), [snapshots]);

  if (snapshots.length < 2) {
    return (
      <div className="empty-v2" style={{ padding: "28px 20px" }}>
        <div className="empty-v2-icon">
          <TrendingUp size={30} strokeWidth={1.8} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>
          Aún no hay suficientes datos para graficar tendencias
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          Vuelve mañana — se captura un snapshot automático cada día.
        </div>
      </div>
    );
  }

  return (
    <div className="chart-appear">
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>
        Evolución de los últimos <strong>{snapshots.length}</strong> días. Los snapshots se
        capturan automáticamente al abrir el dashboard cada día.
      </div>
      <div
        role="img"
        aria-label={`Gráfico de tendencias del curso a lo largo de los últimos ${snapshots.length} días`}
        style={{ width: "100%", height: 220 }}
      >
        <ResponsiveContainer>
          <LineChart data={data} margin={{ left: -10, right: 10, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted)" }} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
            <Line
              type="monotone"
              dataKey="Nota promedio"
              stroke={COLORS.brand}
              strokeWidth={2.5}
              dot={{ r: 3 }}
              animationDuration={900}
              animationEasing="ease-out"
            />
            <Line
              type="monotone"
              dataKey="% en riesgo"
              stroke={COLORS.critical}
              strokeWidth={2.5}
              dot={{ r: 3 }}
              animationDuration={900}
              animationEasing="ease-out"
            />
            <Line
              type="monotone"
              dataKey="Cobertura"
              stroke={COLORS.ok}
              strokeWidth={2.5}
              dot={{ r: 3 }}
              animationDuration={900}
              animationEasing="ease-out"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default React.memo(CourseTrends);
