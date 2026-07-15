import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Users, Activity, Clock, Download, Search, ShieldCheck,
  RefreshCw, Crown, LogIn, CalendarDays, TrendingUp, AlertTriangle, Mail,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import { apiGet } from "../utils/api";
import { downloadCsv } from "../utils/export";
import CesaLoader from "../components/ui/CesaLoader";

/* ────────────────────────────────────────────────────────────────────────────
   Panel de Administración — uso de la plataforma
   Fuente: GET /gemelo/admin/usage/summary (Postgres: login_events/known_users)
   ──────────────────────────────────────────────────────────────────────────── */

const DAY_OPTIONS = [7, 30, 90];

function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-CO", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtDateShort(isoDate) {
  // "2026-07-15" -> "15 jul"
  try {
    const [y, m, d] = String(isoDate).split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
  } catch {
    return isoDate;
  }
}

function relTime(iso) {
  if (!iso) return "";
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "hace un momento";
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs} h`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `hace ${days} día${days !== 1 ? "s" : ""}`;
    const months = Math.floor(days / 30);
    return `hace ${months} mes${months !== 1 ? "es" : ""}`;
  } catch {
    return "";
  }
}

function roleLabel(role, audience) {
  const r = String(role || "").toLowerCase();
  if (r.includes("super admin")) return "Super Admin";
  if (r === "administrator") return "Administrador";
  if (r) return role;
  if ((audience || "").toLowerCase() === "student") return "Estudiante";
  if ((audience || "").toLowerCase() === "staff") return "Docente/Staff";
  return "—";
}

function roleBadgeStyle(role, audience) {
  const r = String(role || "").toLowerCase();
  if (r.includes("admin")) return { background: "var(--brand-light)", color: "var(--brand)" };
  if ((audience || "").toLowerCase() === "student") return { background: "var(--ok-bg)", color: "var(--ok)" };
  return { background: "var(--bg)", color: "var(--muted)" };
}

/* ── KPI card ── */
function KpiCard({ icon, label, value, hint, accent }) {
  const Icon = icon; // mayúscula: componente JSX (varsIgnorePattern del lint)
  return (
    <div style={{
      flex: "1 1 150px", minWidth: 150,
      background: "var(--card)", border: "1px solid var(--border)",
      borderRadius: 14, padding: "16px 18px",
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
        <Icon size={13} strokeWidth={2.4} style={{ color: accent || "var(--brand)" }} />
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.03em", lineHeight: 1 }}>
        {value}
      </div>
      {hint ? <div style={{ fontSize: 11, color: "var(--muted)" }}>{hint}</div> : null}
    </div>
  );
}

export default function AdminPanel() {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();

  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userQuery, setUserQuery] = useState("");

  const load = useCallback(async (d) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet(`/gemelo/admin/usage/summary?days=${d}`);
      setData(res);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    load(days);
  }, [isSuperAdmin, days, load]);

  const totals = data?.totals || {};
  const daily = useMemo(
    () => (Array.isArray(data?.daily) ? data.daily.map(d => ({ ...d, label: fmtDateShort(d.date) })) : []),
    [data],
  );
  const users = useMemo(() => (Array.isArray(data?.users) ? data.users : []), [data]);
  const recent = useMemo(() => (Array.isArray(data?.recent) ? data.recent : []), [data]);

  const usersFiltered = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      String(u.name || "").toLowerCase().includes(q) ||
      String(u.email || "").toLowerCase().includes(q) ||
      String(u.user_id || "").includes(q) ||
      String(u.role || "").toLowerCase().includes(q)
    );
  }, [users, userQuery]);

  const exportUsersCsv = useCallback(() => {
    const headers = ["ID", "Nombre", "Email", "Rol", "Audiencia", "Primer ingreso", "Último ingreso", "Ingresos"];
    const rows = usersFiltered.map(u => [
      u.user_id, u.name || "", u.email || "", u.role || "", u.audience || "",
      u.first_seen || "", u.last_seen || "", u.logins,
    ]);
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`usuarios_gemelo_${today}.csv`, headers, rows);
  }, [usersFiltered]);

  if (!isSuperAdmin) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font)" }}>
        <div style={{ textAlign: "center", color: "var(--muted)" }}>
          <ShieldCheck size={40} strokeWidth={1.6} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>Acceso restringido</div>
          <div style={{ fontSize: 13, marginBottom: 18 }}>Este panel es solo para administradores de G.D.</div>
          <button
            onClick={() => navigate("/")}
            style={{ padding: "10px 18px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontWeight: 700, cursor: "pointer", fontFamily: "var(--font)" }}
          >
            <ArrowLeft size={13} strokeWidth={2.4} style={{ verticalAlign: -2, marginRight: 6 }} />
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font)" }}>
      {/* ── Topbar ── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 20,
        background: "var(--card)", borderBottom: "1px solid var(--border)",
        padding: "0 24px", height: 56,
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <button
          onClick={() => navigate("/")}
          aria-label="Volver al inicio"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "7px 12px", borderRadius: 10,
            border: "1px solid var(--border)", background: "none",
            color: "var(--muted)", fontSize: 12, fontWeight: 700,
            cursor: "pointer", fontFamily: "var(--font)",
          }}
        >
          <ArrowLeft size={14} strokeWidth={2.4} /> Inicio
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 30, height: 30, borderRadius: 9,
            background: "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)", color: "#fff",
          }}>
            <Crown size={16} strokeWidth={2.4} />
          </span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.15 }}>
              Panel de Administración
            </div>
            <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 600 }}>
              Uso de la plataforma · G.D CESA
            </div>
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {/* Selector de período */}
          <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            {DAY_OPTIONS.map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                style={{
                  padding: "7px 13px", border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: 800, fontFamily: "var(--font)",
                  background: days === d ? "var(--brand)" : "var(--card)",
                  color: days === d ? "#fff" : "var(--muted)",
                }}
              >
                {d} días
              </button>
            ))}
          </div>
          <button
            onClick={() => load(days)}
            disabled={loading}
            aria-label="Actualizar"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 12px", borderRadius: 10,
              border: "1px solid var(--border)", background: "var(--card)",
              color: "var(--muted)", fontSize: 12, fontWeight: 700,
              cursor: loading ? "wait" : "pointer", fontFamily: "var(--font)",
            }}
          >
            <RefreshCw size={13} strokeWidth={2.4} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
            Actualizar
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1150, margin: "0 auto", padding: "28px 24px 60px" }}>
        {loading && !data ? (
          <CesaLoader subtitle="Cargando métricas de uso" />
        ) : error ? (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            background: "var(--critical-bg, #fef2f2)", color: "var(--critical, #dc2626)",
            border: "1px solid var(--critical, #dc2626)", borderRadius: 12,
            padding: "14px 18px", fontSize: 13, fontWeight: 600, lineHeight: 1.5,
          }}>
            <AlertTriangle size={17} strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              No se pudieron cargar las métricas de uso.
              <div style={{ fontWeight: 500, fontSize: 12, marginTop: 4, opacity: 0.85 }}>{error}</div>
            </div>
          </div>
        ) : (
          <>
            {/* ── KPIs ── */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 22 }}>
              <KpiCard icon={Users} label="Usuarios G.D" value={totals.users ?? "—"} hint="Han ingresado al menos una vez" />
              <KpiCard icon={Activity} label="Activos 7 días" value={totals.active7d ?? "—"} accent="var(--ok, #16a34a)" hint="Usuarios únicos" />
              <KpiCard icon={TrendingUp} label="Activos 30 días" value={totals.active30d ?? "—"} accent="var(--ok, #16a34a)" hint="Usuarios únicos" />
              <KpiCard icon={LogIn} label="Ingresos hoy" value={totals.loginsToday ?? "—"} />
              <KpiCard icon={CalendarDays} label={`Ingresos ${days}d`} value={totals.loginsPeriod ?? "—"} />
              <KpiCard icon={Clock} label="Ingresos históricos" value={totals.logins ?? "—"} hint="Desde que existe el registro" />
            </div>

            {/* ── Gráfica de ingresos por día ── */}
            <section style={{
              background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 14, padding: "18px 18px 8px", marginBottom: 22,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Activity size={16} strokeWidth={2.4} style={{ color: "var(--brand)" }} />
                <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>
                  Ingresos por día — últimos {days} días
                </span>
              </div>
              {daily.every(d => !d.logins) ? (
                <div style={{ padding: "26px 10px 34px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                  Aún no hay ingresos registrados en este período.
                  <div style={{ fontSize: 11.5, marginTop: 5, opacity: 0.8 }}>
                    El historial en base de datos comienza a registrarse a partir de esta versión — se irá llenando con cada login.
                  </div>
                </div>
              ) : (
                <div style={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={daily} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted)" }} interval="preserveStartEnd" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--muted)" }} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--card)", border: "1px solid var(--border)",
                          borderRadius: 10, fontSize: 12, color: "var(--text)",
                        }}
                        labelStyle={{ color: "var(--muted)", fontWeight: 700 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11.5 }} />
                      <Bar dataKey="logins" name="Ingresos" fill="var(--brand, #0b5fff)" radius={[4, 4, 0, 0]} maxBarSize={26} />
                      <Line dataKey="uniqueUsers" name="Usuarios únicos" type="monotone" stroke="var(--ok, #16a34a)" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 22, alignItems: "start" }}>
              {/* ── Tabla de usuarios ── */}
              <section style={{
                background: "var(--card)", border: "1px solid var(--border)",
                borderRadius: 14, padding: 18, minWidth: 0,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  <Users size={16} strokeWidth={2.4} style={{ color: "var(--brand)" }} />
                  <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>
                    Usuarios que han usado G.D
                  </span>
                  <span style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>
                    {usersFiltered.length} de {users.length}
                  </span>
                  <button
                    onClick={exportUsersCsv}
                    disabled={!usersFiltered.length}
                    style={{
                      marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "6px 11px", borderRadius: 9,
                      border: "1px solid var(--border)", background: "var(--card)",
                      color: usersFiltered.length ? "var(--brand)" : "var(--muted)",
                      fontSize: 11.5, fontWeight: 800, cursor: usersFiltered.length ? "pointer" : "not-allowed",
                      fontFamily: "var(--font)",
                    }}
                  >
                    <Download size={12} strokeWidth={2.6} /> CSV
                  </button>
                </div>

                <div style={{ position: "relative", marginBottom: 12 }}>
                  <Search size={14} strokeWidth={2.4} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
                  <input
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    placeholder="Buscar por nombre, email, ID o rol…"
                    style={{
                      width: "100%", boxSizing: "border-box",
                      padding: "9px 12px 9px 32px", borderRadius: 10,
                      border: "1px solid var(--border)", background: "var(--bg)",
                      color: "var(--text)", fontSize: 13, fontFamily: "var(--font)",
                      outline: "none",
                    }}
                  />
                </div>

                {usersFiltered.length === 0 ? (
                  <div style={{ padding: "22px 10px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                    {users.length === 0
                      ? "Todavía no hay usuarios registrados en la base de datos. Se llenará con los próximos ingresos."
                      : "Sin coincidencias para la búsqueda."}
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          <th style={{ padding: "6px 8px", fontWeight: 800 }}>Usuario</th>
                          <th style={{ padding: "6px 8px", fontWeight: 800 }}>Rol</th>
                          <th style={{ padding: "6px 8px", fontWeight: 800 }}>Último ingreso</th>
                          <th style={{ padding: "6px 8px", fontWeight: 800, textAlign: "right" }}>Ingresos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usersFiltered.map((u) => (
                          <tr key={u.user_id} style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={{ padding: "9px 8px", minWidth: 170 }}>
                              <div style={{ fontWeight: 700, color: "var(--text)" }}>
                                {u.name || `Usuario ${u.user_id}`}
                                <span style={{ fontWeight: 600, color: "var(--muted)", fontSize: 11, marginLeft: 6 }}>#{u.user_id}</span>
                              </div>
                              {u.email ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--muted)", fontSize: 11.5, marginTop: 1 }}>
                                  <Mail size={10.5} strokeWidth={2.2} /> {u.email}
                                </div>
                              ) : null}
                            </td>
                            <td style={{ padding: "9px 8px" }}>
                              <span style={{
                                display: "inline-block", padding: "3px 9px", borderRadius: 99,
                                fontSize: 10.5, fontWeight: 800, whiteSpace: "nowrap",
                                ...roleBadgeStyle(u.role, u.audience),
                              }}>
                                {roleLabel(u.role, u.audience)}
                              </span>
                            </td>
                            <td style={{ padding: "9px 8px", whiteSpace: "nowrap" }}>
                              <div style={{ color: "var(--text)", fontWeight: 600 }}>{fmtDateTime(u.last_seen)}</div>
                              <div style={{ color: "var(--muted)", fontSize: 11 }}>{relTime(u.last_seen)}</div>
                            </td>
                            <td style={{ padding: "9px 8px", textAlign: "right", fontWeight: 800, color: "var(--text)" }}>
                              {u.logins}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* ── Últimos ingresos ── */}
              <section style={{
                background: "var(--card)", border: "1px solid var(--border)",
                borderRadius: 14, padding: 18, minWidth: 0,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <LogIn size={16} strokeWidth={2.4} style={{ color: "var(--brand)" }} />
                  <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>Últimos ingresos</span>
                </div>
                {recent.length === 0 ? (
                  <div style={{ padding: "18px 6px", textAlign: "center", color: "var(--muted)", fontSize: 12.5 }}>
                    Sin ingresos registrados todavía.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {recent.map((e, i) => (
                      <div key={`${e.user_id}-${e.ts}-${i}`} style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "9px 2px",
                        borderTop: i === 0 ? "none" : "1px solid var(--border)",
                      }}>
                        <span style={{
                          width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          background: "var(--brand-light)", color: "var(--brand)",
                          fontSize: 11, fontWeight: 900,
                        }}>
                          {(e.name || "?").trim().charAt(0).toUpperCase()}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {e.name || `Usuario ${e.user_id}`}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>
                            {fmtDateTime(e.ts)} · {relTime(e.ts)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
