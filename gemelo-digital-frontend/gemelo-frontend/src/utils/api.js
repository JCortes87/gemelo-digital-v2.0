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
 * Build a URL for a binary download endpoint, appending the sid as query param
 * so the browser can open it in a new tab without needing Authorization header.
 */
export function apiDownloadUrl(path) {
  const sid = localStorage.getItem("gemelo_sid") || "";
  const sep = path.includes("?") ? "&" : "?";
  const base = apiUrl(path);
  return sid ? `${base}${sep}sid=${encodeURIComponent(sid)}` : base;
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
