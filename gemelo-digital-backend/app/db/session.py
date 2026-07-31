import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

#|---- Aquí para preparar SessionLocal para uso transaccional--------|

# Cargar .env de forma robusta: primero desde la raiz del backend
# (independiente del cwd con que se levante uvicorn), luego fallback al
# comportamiento default de python-dotenv que busca cwd hacia arriba.
# En produccion (ECS) las env vars vienen del taskdef, no de .env —
# en ese caso load_dotenv no encuentra archivo y eso esta bien.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
_env_path = _BACKEND_ROOT / ".env"
if _env_path.exists():
    load_dotenv(_env_path, override=False)
else:
    load_dotenv(override=False)

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        f"Falta DATABASE_URL en variables de entorno. "
        f"Intentamos cargar .env desde: {_env_path} "
        f"(existe: {_env_path.exists()}). "
        f"Verifica que el archivo exista y contenga DATABASE_URL=postgresql+psycopg://...; "
        f"o, en produccion, que la variable este en el taskdef."
    )

engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    # connect_timeout corto: si la BD no es alcanzable (p. ej. RDS sin acceso
    # desde la red local en dev), fallar en ~5s en vez de colgar el startup
    # varios minutos con el timeout TCP del SO. En produccion (misma VPC que
    # RDS) la conexion tarda milisegundos, asi que no afecta.
    connect_args={"connect_timeout": 5},
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)