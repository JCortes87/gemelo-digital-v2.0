#!/usr/bin/env python
"""
Aviso de actualización a los usuarios de G.D.

Uso obligatorio del desarrollador al subir/actualizar la plataforma en AWS:
publica un anuncio in-app (visible en Centro de ayuda → Novedades) y lo envía
por correo a todos los usuarios registrados, indicando el tipo de mejora.

Ejemplos:
    python scripts/notify_update.py \
        --version 2026.7.2 \
        --tag Actualización \
        --subject "Nueva versión de G.D" \
        --message "Mejoras de rendimiento en el panel del docente y correcciones."

    # Sin argumentos → modo interactivo (pregunta subject/message/tag/version).
    python scripts/notify_update.py

Requiere SMTP configurado en .env (SMTP_USER/SMTP_PASSWORD). Si no lo está, el
anuncio se publica in-app igual, pero no se envía correo.
"""
import os
import sys
import json
import argparse
from datetime import datetime, timezone

# La consola de Windows (cp1252) no imprime acentos/símbolos → forzar UTF-8.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# Permitir importar el paquete `app` estando en scripts/
_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(_BACKEND_ROOT, ".env"))
except Exception:
    pass

from app.services.email_service import send_email, smtp_configured  # noqa: E402
from app.services.user_registry import list_emails  # noqa: E402

_DATA_DIR = os.getenv("GEMELO_DATA_DIR") or _BACKEND_ROOT
_ANNOUNCEMENTS_FILE = os.path.join(_DATA_DIR, "announcements.json")

TAGS = ["Actualización", "Nuevo", "Mejorado", "Importante", "Anuncio"]


def _load_announcements():
    try:
        with open(_ANNOUNCEMENTS_FILE, encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, list) else []
    except FileNotFoundError:
        return []
    except Exception:
        return []


def _save_announcements(items):
    tmp = _ANNOUNCEMENTS_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(items, fh, ensure_ascii=False)
    os.replace(tmp, _ANNOUNCEMENTS_FILE)


def _prompt(label, default=""):
    suffix = f" [{default}]" if default else ""
    val = input(f"{label}{suffix}: ").strip()
    return val or default


def main():
    ap = argparse.ArgumentParser(description="Publica y envía un aviso de actualización a los usuarios de G.D.")
    ap.add_argument("--subject", help="Asunto del anuncio.")
    ap.add_argument("--message", help="Cuerpo del anuncio (tipo de mejora/actualización).")
    ap.add_argument("--tag", default=None, help=f"Tipo. Uno de: {', '.join(TAGS)}. Por defecto 'Actualización'.")
    ap.add_argument("--version", default=None, help="Versión desplegada (opcional; se antepone al mensaje).")
    ap.add_argument("--author", default="Equipo de desarrollo · G.D", help="Autor mostrado en el anuncio.")
    ap.add_argument("--no-email", action="store_true", help="Solo publicar in-app, sin enviar correo.")
    ap.add_argument("--yes", action="store_true", help="No pedir confirmación antes de enviar.")
    args = ap.parse_args()

    subject = args.subject or _prompt("Asunto")
    message = args.message or _prompt("Mensaje (qué se actualizó/mejoró)")
    tag = (args.tag or _prompt("Tipo (Actualización/Nuevo/Mejorado/Importante/Anuncio)", "Actualización")).strip()
    version = args.version if args.version is not None else _prompt("Versión (opcional)", "")

    subject = (subject or "").strip()
    message = (message or "").strip()
    if not subject or not message:
        print("✖ Asunto y mensaje son obligatorios.")
        return 2
    if tag not in TAGS:
        tag = "Actualización"
    if version:
        message = f"Versión {version}\n\n{message}"

    # Los estudiantes solo reciben el aviso in-app (en el portal), no por correo.
    recipients = [] if args.no_email else list_emails(exclude_students=True)
    smtp_ok = smtp_configured()

    print("\n── Vista previa ──────────────────────────────")
    print(f"  Tipo:        {tag}")
    print(f"  Asunto:      {subject}")
    print(f"  Mensaje:     {message[:200]}{'…' if len(message) > 200 else ''}")
    print(f"  Destinatarios: {len(recipients)} usuario(s) con correo")
    print(f"  SMTP:        {'configurado' if smtp_ok else 'NO configurado (solo in-app)'}")
    print("──────────────────────────────────────────────\n")

    if not args.yes:
        confirm = input("¿Publicar y enviar? (s/N): ").strip().lower()
        if confirm not in ("s", "si", "sí", "y", "yes"):
            print("Cancelado.")
            return 1

    email_result = {"ok": False, "recipients": 0, "error": None}
    if recipients:
        if not smtp_ok:
            email_result["error"] = "smtp_no_configurado"
        else:
            from_name = os.getenv("SMTP_FROM_NAME", "G.D CESA")
            html = (
                f"<div style='font-family:Arial,sans-serif;max-width:560px'>"
                f"<h2 style='color:#0b5fff'>{subject}</h2>"
                f"<div style='white-space:pre-wrap;font-size:15px;line-height:1.6'>{message}</div>"
                f"<hr style='border:none;border-top:1px solid #eee;margin:24px 0'>"
                f"<p style='font-size:12px;color:#888'>Aviso de actualización de {from_name} · CESA.</p>"
                f"</div>"
            )
            res = send_email(to=[], bcc=recipients, subject=subject, body_text=message, body_html=html)
            email_result = {"ok": bool(res.get("ok")), "recipients": res.get("recipients", 0), "error": res.get("error")}

    # Publicar in-app (mismo esquema que /gemelo/admin/announcement)
    items = _load_announcements()
    ann = {
        "id": int(datetime.now(timezone.utc).timestamp() * 1000),
        "ts": datetime.now(timezone.utc).isoformat(),
        "subject": subject,
        "message": message,
        "tag": tag,
        "author": args.author,
        "emailSent": email_result["ok"],
        "recipientCount": email_result["recipients"],
    }
    items.insert(0, ann)
    try:
        _save_announcements(items[:100])
        print("✔ Anuncio publicado in-app (Centro de ayuda → Novedades).")
    except Exception as e:
        print(f"✖ No se pudo persistir el anuncio: {e}")

    if email_result["ok"]:
        print(f"✔ Correo enviado a {email_result['recipients']} usuario(s).")
    elif email_result["error"] == "smtp_no_configurado":
        print("⚠ Correo NO enviado: SMTP no configurado (define SMTP_USER/SMTP_PASSWORD en .env).")
    elif args.no_email:
        print("• Correo omitido (--no-email).")
    elif not recipients:
        print("⚠ No hay usuarios con correo registrados todavía.")
    else:
        print(f"✖ Error enviando correo: {email_result['error']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
