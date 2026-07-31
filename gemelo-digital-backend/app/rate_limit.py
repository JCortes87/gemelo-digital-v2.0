from __future__ import annotations

import os

from slowapi import Limiter
from slowapi.util import get_remote_address


def client_ip(request) -> str:
    # Detrás del ALB el peer es el balanceador; usar la IP original del cliente
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return get_remote_address(request)


RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "1").lower() not in ("0", "false")

limiter = Limiter(key_func=client_ip, enabled=RATE_LIMIT_ENABLED)
