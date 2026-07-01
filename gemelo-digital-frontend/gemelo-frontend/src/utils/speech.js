import { apiUrl } from "./api";

let _elCurrentAudio = null;
let _elToken = 0;            // token monotonico: identifica la reproduccion vigente
let _elController = null;    // AbortController del fetch /speech/tts en curso

export function elStop() {
  // Invalida cualquier reproduccion o carga en curso. Si un fetch lanzado
  // antes termina despues de este stop, su token ya no coincide y se descarta
  // (asi nunca suenan dos audios a la vez aunque se hagan clics rapidos).
  _elToken++;
  if (_elController) { try { _elController.abort(); } catch (_) {} _elController = null; }
  if (_elCurrentAudio) { _elCurrentAudio.pause(); _elCurrentAudio = null; }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

// Auto-stop on navigation / tab hide so audio never overlaps across screens.
if (typeof window !== "undefined" && !window.__elNavHooked) {
  window.__elNavHooked = true;
  window.addEventListener("popstate", elStop);
  window.addEventListener("pagehide", elStop);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) elStop();
  });
  const _origPush = history.pushState;
  const _origReplace = history.replaceState;
  history.pushState = function (...args) { elStop(); return _origPush.apply(this, args); };
  history.replaceState = function (...args) { elStop(); return _origReplace.apply(this, args); };
}

export async function elSpeak(rawText, onStart, onEnd) {
  if (!rawText || !rawText.trim()) return;
  elStop();
  const myToken = _elToken;
  const controller = new AbortController();
  _elController = controller;

  const clean = rawText
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "menor que").replace(/&gt;/g, "mayor que").replace(/&amp;/g, "y")
    .replace(/[^\u0000-\u007F\u00C0-\u024F\u0400-\u04FF\s]/g, "")
    .replace(/\[.*?\]/g, "").replace(/\s+/g, " ").trim().slice(0, 2000);

  try {
    const sid = localStorage.getItem("gemelo_sid");
    const hdrs = { "Content-Type": "application/json" };
    if (sid) hdrs["Authorization"] = "Bearer " + sid;
    const res = await fetch(apiUrl("/speech/tts"), {
      method: "POST", credentials: "include", headers: hdrs,
      body: JSON.stringify({ text: clean }),
      signal: controller.signal,
    });
    if (myToken !== _elToken) return;            // nos supero otra llamada / stop
    if (!res.ok) throw new Error("TTS " + res.status);
    const blob = await res.blob();
    if (myToken !== _elToken) return;            // re-chequeo tras descargar el audio
    const url  = URL.createObjectURL(blob);
    const audio = new Audio(url);
    _elCurrentAudio = audio;
    _elController = null;
    audio.onended = audio.onerror = () => {
      URL.revokeObjectURL(url);
      if (myToken === _elToken) { _elCurrentAudio = null; onEnd && onEnd(); }
    };
    onStart && onStart();                        // onStart cuando el audio EMPIEZA a sonar
    audio.play();
    return audio;
  } catch (e) {
    // Cancelacion deliberada (stop o nueva llamada): no es un error real.
    if (e.name === "AbortError" || myToken !== _elToken) return;

    console.warn("ElevenLabs TTS fallback:", e.message);
    if ("speechSynthesis" in window) {
      const utt = new SpeechSynthesisUtterance(clean);
      utt.lang = "es-CO"; utt.rate = 0.92;
      const esV = window.speechSynthesis.getVoices().find(v => v.lang.startsWith("es"));
      if (esV) utt.voice = esV;
      utt.onend = utt.onerror = () => { if (myToken === _elToken) onEnd && onEnd(); };
      onStart && onStart();
      window.speechSynthesis.speak(utt);
    } else { onEnd && onEnd(); }
  }
}

export async function elListen(onResult, onError) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    const chunks = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: "audio/webm" });
      const form = new FormData();
      form.append("audio", blob, "audio.webm");
      try {
        const sid = localStorage.getItem("gemelo_sid");
        const hdrs = sid ? { "Authorization": "Bearer " + sid } : {};
        const res = await fetch(apiUrl("/speech/stt"), { method: "POST", credentials: "include", headers: hdrs, body: form });
        if (!res.ok) throw new Error("STT " + res.status);
        const data = await res.json();
        onResult && onResult(data.text || "");
      } catch (e) { onError && onError(e); }
    };
    recorder.start();
    setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 10000);
    return recorder;
  } catch (e) { onError && onError(e); }
}
