const API_BASE_URL = (
  import.meta.env?.VITE_API_BASE_URL ||
  import.meta.env?.VITE_GEMELO_BASE_URL ||
  ""
).replace(/\/$/, "");

if (!API_BASE_URL) {
  console.error("⚠️ Falta definir VITE_API_BASE_URL (o VITE_GEMELO_BASE_URL) en el .env");
}

export function apiUrl(path) {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

export { API_BASE_URL };

/**
 * Descarga un endpoint binario autenticando con el header Authorization.
 * El sid NUNCA viaja en la URL (antes iba como ?sid= y quedaba expuesto en
 * historial del navegador, logs del servidor y headers Referer).
 * Dispara la descarga en el navegador vía Blob + <a download>.
 */
export async function apiDownload(path, fallbackFilename = "descarga") {
  const sid = localStorage.getItem("gemelo_sid");
  const res = await fetch(apiUrl(path), {
    method: "GET",
    credentials: "include",
    headers: sid ? { Authorization: `Bearer ${sid}` } : {},
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} - ${String(txt).slice(0, 300)}`);
  }
  // Nombre de archivo desde Content-Disposition, si el backend lo envía
  const cd = res.headers.get("content-disposition") || "";
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(cd);
  const filename = match
    ? decodeURIComponent(match[1].replace(/"/g, "").trim())
    : fallbackFilename;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function apiGet(path, opts = {}) {
  const _sid = localStorage.getItem("gemelo_sid");
  const _authHeader = _sid ? { "Authorization": `Bearer ${_sid}` } : {};
  const res = await fetch(apiUrl(path), {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json", ..._authHeader, ...(opts.headers || {}) },
    signal: opts.signal,
  });

  const ct = res.headers.get("content-type") || "";
  const isJson =
    ct.includes("application/json") ||
    ct.includes("application/problem+json");

  if (!res.ok) {
    const body = isJson
      ? await res.json().catch(() => ({}))
      : await res.text().catch(() => "");
    const msg =
      typeof body === "string"
        ? body
        : body?.detail || body?.message || body?.error || JSON.stringify(body);
    throw new Error(`HTTP ${res.status} - ${String(msg).slice(0, 600)}`);
  }

  if (!isJson) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Respuesta no JSON (${ct}): ${txt.slice(0, 300)}`);
  }

  return res.json();
}

export async function apiPost(path, body, opts = {}) {
  const _sid = localStorage.getItem("gemelo_sid");
  const _authHeader = _sid ? { "Authorization": `Bearer ${_sid}` } : {};
  const res = await fetch(apiUrl(path), {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ..._authHeader,
      ...(opts.headers || {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
    signal: opts.signal,
  });

  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json") || ct.includes("application/problem+json");

  if (!res.ok) {
    const errBody = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
    const msg = typeof errBody === "string"
      ? errBody
      : errBody?.detail || errBody?.message || errBody?.error || JSON.stringify(errBody);
    throw new Error(`HTTP ${res.status} - ${String(msg).slice(0, 600)}`);
  }

  return isJson ? res.json() : res.text();
}

export async function apiPut(path, body, opts = {}) {
  const _sid = localStorage.getItem("gemelo_sid");
  const _authHeader = _sid ? { "Authorization": `Bearer ${_sid}` } : {};
  const res = await fetch(apiUrl(path), {
    method: "PUT",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ..._authHeader,
      ...(opts.headers || {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
    signal: opts.signal,
  });

  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json") || ct.includes("application/problem+json");

  if (!res.ok) {
    const errBody = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
    const msg = typeof errBody === "string"
      ? errBody
      : errBody?.detail || errBody?.message || errBody?.error || JSON.stringify(errBody);
    throw new Error(`HTTP ${res.status} - ${String(msg).slice(0, 600)}`);
  }

  return isJson ? res.json() : res.text();
}

// ── Cache SWR-lite: TTL + dedup de requests en vuelo ─────────────────────────
// Evita que CourseContext y TeacherDashboard dupliquen las mismas llamadas GET.
const _apiCache = new Map(); // path -> { ts, data }
const _inflight = new Map(); // path -> Promise
const DEFAULT_CACHE_TTL_MS = 60_000;

export async function apiGetCached(path, opts = {}) {
  const { signal, ...fetchOpts } = opts;
  const ttl = opts.ttl ?? DEFAULT_CACHE_TTL_MS;
  const now = Date.now();

  let promise = null;
  if (!opts.force) {
    const hit = _apiCache.get(path);
    if (hit && now - hit.ts < ttl) return hit.data;
    promise = _inflight.get(path) || null;
  }

  if (!promise) {
    // OJO: la petición compartida NO recibe el `signal` del llamador. Si un
    // componente se desmonta (p.ej. el doble montaje de StrictMode en dev)
    // y aborta su controller, ese abort NO debe tumbar la promesa que otros
    // consumidores están compartiendo — antes esto hacía que el segundo
    // montaje recibiera "signal is aborted without reason" de un abort ajeno.
    promise = apiGet(path, fetchOpts)
      .then((data) => {
        _apiCache.set(path, { ts: Date.now(), data });
        return data;
      })
      .finally(() => {
        _inflight.delete(path);
      });
    _inflight.set(path, promise);
  }

  if (!signal) return promise;

  // Respetar el abort del llamador sin cancelar la petición compartida:
  // solo SU promesa envolvente rechaza con AbortError (la compartida sigue
  // y deja el resultado en caché para el resto).
  return new Promise((resolve, reject) => {
    const makeAbortErr = () => {
      try { return new DOMException("Aborted", "AbortError"); }
      catch { return Object.assign(new Error("Aborted"), { name: "AbortError" }); }
    };
    if (signal.aborted) { reject(makeAbortErr()); return; }
    const onAbort = () => reject(makeAbortErr());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => { signal.removeEventListener("abort", onAbort); resolve(v); },
      (e) => { signal.removeEventListener("abort", onAbort); reject(e); },
    );
  });
}

export function invalidateApiCache(prefix = "") {
  for (const key of _apiCache.keys()) {
    if (key.startsWith(prefix)) _apiCache.delete(key);
  }
}

export async function mapLimit(arr, limit, mapper) {
  const list = Array.isArray(arr) ? arr : [];
  const results = new Array(list.length);
  let i = 0;
  const workers = new Array(Math.min(limit, list.length)).fill(null).map(async () => {
    while (i < list.length) {
      const idx = i++;
      results[idx] = await mapper(list[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}
