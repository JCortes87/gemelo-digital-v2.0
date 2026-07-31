import React, { useEffect, useState } from "react";
import { apiUrl } from "../../utils/api";

// Caché en módulo: userId → Promise<objectURL|null>. Evita re-pedir la misma
// foto cuando el avatar aparece en varias listas, y persiste entre montajes.
const _avatarCache = new Map();

function fetchAvatarUrl(userId) {
  if (_avatarCache.has(userId)) return _avatarCache.get(userId);
  const sid = typeof localStorage !== "undefined" ? localStorage.getItem("gemelo_sid") : null;
  if (!sid) return Promise.resolve(null);
  // Nota seguridad: antes la imagen se cargaba con <img src="...?sid=...">,
  // lo que filtraba el token de sesión en la URL (historial, logs, Referer).
  // Ahora se pide con fetch + header Authorization y se muestra via blob URL.
  const p = fetch(apiUrl(`/brightspace/user/${userId}/image`), {
    credentials: "include",
    headers: { Authorization: `Bearer ${sid}` },
  })
    .then((res) => {
      if (!res.ok) return null;
      return res.blob().then((b) => URL.createObjectURL(b));
    })
    .catch(() => null);
  _avatarCache.set(userId, p);
  return p;
}

/**
 * Avatar component that attempts to load the user's profile image from
 * Brightspace. Falls back to an initial-based circle if the image fails.
 *
 * Usage:
 *   <StudentAvatar userId={123} name="Juan Perez" size={40} />
 */
export default function StudentAvatar({ userId, name, size = 40, style = {} }) {
  // Estado keyed por userId: si cambia el userId, el render usa null hasta que
  // llegue la foto correcta (sin setState síncrono dentro del effect).
  const [avatar, setAvatar] = useState({ id: null, url: null });
  const initial = (name || "?").trim().charAt(0).toUpperCase();

  useEffect(() => {
    let alive = true;
    if (userId) {
      fetchAvatarUrl(userId).then((url) => {
        if (alive) setAvatar({ id: userId, url });
      });
    }
    return () => { alive = false; };
  }, [userId]);

  const imageUrl = avatar.id === userId ? avatar.url : null;

  const baseStyle = {
    width: size,
    height: size,
    borderRadius: "50%",
    background: "var(--brand-light)",
    border: "2px solid var(--brand-light2, #D6E4FF)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    overflow: "hidden",
    ...style,
  };

  if (!imageUrl) {
    return (
      <div style={baseStyle} aria-label={`Avatar de ${name || "estudiante"}`}>
        <span style={{
          fontSize: Math.round(size * 0.4),
          fontWeight: 900,
          color: "var(--brand)",
        }}>{initial}</span>
      </div>
    );
  }

  return (
    <div style={baseStyle}>
      <img
        src={imageUrl}
        alt={name || "Estudiante"}
        onError={() => setAvatar({ id: userId, url: null })}
        loading="lazy"
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </div>
  );
}
