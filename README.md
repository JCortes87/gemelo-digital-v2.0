# Gemelo Digital — CESA

Plataforma de analítica académica para CESA (Colegio de Estudios Superiores de Administración) integrada con Brightspace (D2L) vía OAuth 2.0 y LTI 1.3. Ofrece dashboards de riesgo, seguimiento de resultados de aprendizaje (RA), predicción de notas, evidencias y coordinación académica para docentes, estudiantes y administrativos.

- **Producción:** https://gemelo.cesa.edu.co
- **Backend prod:** https://ge-9d9d0220a8704eeabada1b951f3f2d37.ecs.us-east-1.on.aws
- **Versión actual:** `2026.7.10`

---

## Mantenimiento — 2026.7.21 (refactor interno, sin cambios funcionales)

Dos tandas de mantenimiento sin impacto en la API ni en la UI:

- **Refactor #15 — modularización de los dos archivos más grandes del repo:**
  - `TeacherDashboard.jsx` (8.050 → 4.184 líneas): componentes extraídos a `src/pages/teacher/` — `dashboardStyles` (CSS del dashboard), `primitives` (10 átomos de UI), `panels` (13 bloques), `layout` (sidebar/topbar), `modals`, `onboarding` y `RaLinker`. Bundle idéntico (misma huella de bytes) y smoke test en jsdom que valida imports, exports y render de los módulos extraídos.
  - `gemelo.py` (2.281 → 945 líneas): partido en sub-routers FastAPI — `gemelo_outcomes.py` (RAs: registry, alignments, export/import, bulk-create), `gemelo_debug.py` (endpoints de debug), `gemelo_admin.py` (bug reports, anuncios, usage) y `gemelo_shared.py` (helpers comunes). Verificado con diff de rutas: las **86 rutas** registradas son idénticas antes y después.
- **Tanda previa (misma versión):** caché Brightspace de 5 min por usuario en backend, vendor chunks del bundle (react/recharts separados), keys estables en listas, providers memoizados, ESLint más estricto (no-var, prefer-const, eqeqeq), migraciones Alembic reconciliadas en cadena lineal y **primera base de tests**: 32 en backend (pytest: sesiones, deps de cache, roles) y 52 en frontend (vitest: helpers, colores, smoke del refactor). Se corrigió un bug real detectado por los tests: `safeAvg` contaba `null` como 0 y arrastraba los promedios hacia abajo.

---

## Novedades — 2026.7.10 (Resultados de Aprendizaje)

Actualización centrada en la administración de **Resultados de Aprendizaje (RA)** desde la consola super-admin (`/outcomes`):

- **Consola `/outcomes` reorganizada en 4 pestañas** (estilo navegador): *Cursos y alineaciones* (buscar semestre, analizar estado RA de las ofertas, consultar un curso por ID y ver/editar alineaciones), *Registro global* (explorar y editar el catálogo de conjuntos del tenant), *Crear RA (plantilla)* y *Importar manual* (modo avanzado + sondeo de diagnóstico).
- **Creación masiva de RA desde plantilla CSV**: plantilla descargable (compatible con Excel es-CO: BOM + `;`), columna `conjunto` como título del set global (ej. `ACELERACIÓN PARA EL EMPRENDIMIENTO-AE2`), vista previa (dry-run) y escritura real vía `POST /gemelo/outcomes/bulk-create`. Se corrigió el formato `ImportExportOutcome` (discriminador `Source: "lores"`) que provocaba `HTTP 400 JSON Binding Error` en Brightspace.
- **Cursos destino opcionales y múltiples al crear RA**: se pueden agregar varios cursos con el botón «+», o dejar vacío para crear los conjuntos solo en el **catálogo global** (nivel organización, con confirmación). El backend acepta `targetOrgUnitIds[]` y reporta resultado por curso.
- **Análisis de estado RA por semestre**: clasifica cada oferta como *Sin RA / Sin alinear / Alineada* con filtros y contadores.
- **Emparejador automático curso → conjunto**: sugiere el conjunto del catálogo global que coincide con el nombre de la asignatura (con puntaje de afinidad) e importa con vista previa.
- **Import masivo a varios cursos**: checkboxes en la lista de cursos (p. ej. las 8 secciones homónimas de una asignatura), botón *Marcar visibles*, panel con conjuntos sugeridos, dry-run, confirmación, progreso y detalle por curso. Los cursos importados actualizan su estado en la lista sin reanalizar.
- **Editor del registro global**: edición de descripciones de RA con previsualización antes de escribir en Brightspace.
- **Enlazador RA ↔ actividades**: pestañas separadas para asignaciones (rúbricas) y quizzes, con enlaces directos a Brightspace.

---

## Arquitectura

Monorepo con dos proyectos independientes:

```
gemelo-frontend/
├── gemelo-digital-frontend/gemelo-frontend/   # SPA React (Vite)
├── gemelo-digital-backend/                    # API FastAPI (Python)
├── .github/workflows/                         # CI/CD (deploy-backend, deploy-frontend)
├── docs/                                      # Documentación técnica
└── CLAUDE.md                                  # Guía para Claude Code
```

### Frontend
- **React 19** + **React Router v7** (JSX puro, sin TypeScript)
- **Vite 8** (build y dev server)
- **Recharts** para visualizaciones
- **Lucide React** para iconos
- **DOMPurify** para sanitizar HTML de Brightspace
- **CSS-in-JS** inyectado en runtime (`src/styles/global.js`, ~3600 líneas)
- Sin librería de componentes ni Tailwind
- **Estado:** 5 React Contexts (Auth, Course, Theme, i18n, Toast)

### Backend
- **FastAPI 0.115** + **Uvicorn**
- **httpx** para llamadas a Brightspace API
- **SQLAlchemy 2.0** + **Alembic** (migraciones)
- **psycopg 3** (Postgres)
- **APScheduler** para syncs periódicos
- **python-jose** para JWT

### Infra
- **Frontend:** S3 (`gemelo-frontend-prod`) + CloudFront (`E32WDBCT7SFCRD`)
- **Backend:** ECS Fargate (`cluster: default`, `service: gemelo-digital-api`) + ECR (`gemelo-backend`)
- **Base de datos:** RDS Postgres
- **CI/CD:** GitHub Actions con OIDC (`GemeloDigitalDeployerRole`) — ⚠️ **actualmente roto**, se despliega manualmente (ver sección [Deploy](#deploy))

---

## Requisitos

- **Node.js** 20+ y **npm** 10+
- **Python** 3.11+
- **Docker** (para build de imagen backend)
- **AWS CLI** v2 (para deploys manuales)
- Postgres 15+ (dev local opcional; en prod se usa RDS)

---

## Setup local

### Frontend

```bash
cd gemelo-digital-frontend/gemelo-frontend
npm install
npm run dev              # http://localhost:5174
```

El dev server proxifica automáticamente `/gemelo`, `/brightspace`, `/auth`, `/lti`, `/health`, `/debug`, `/.well-known`, `/speech` a `http://localhost:8000` (ver `vite.config.js`).

> **Nota:** Si defines `VITE_API_BASE_URL` en un `.env`, el frontend hará las llamadas a esa URL (por ejemplo, la API de AWS) en vez de al backend local, y el proxy no aplicará.

### Backend

```bash
cd gemelo-digital-backend
python -m venv .venv
source .venv/Scripts/activate    # Windows Git Bash
pip install -r requirements.txt
cp .env.example .env             # completar credenciales Brightspace
uvicorn app.main:app --reload --port 8000
```

Requiere Postgres corriendo. Aplicar migraciones:

```bash
alembic upgrade head
```

---

## Variables de entorno

### Frontend (`.env` en `gemelo-digital-frontend/gemelo-frontend/`)

| Variable | Descripción |
|---|---|
| `VITE_API_BASE_URL` | URL absoluta del backend. Solo para builds de producción o para apuntar dev local a un backend remoto. En dev local normal, dejar sin definir. |

### Backend (`.env` en `gemelo-digital-backend/`)

| Variable | Descripción |
|---|---|
| `BRIGHTSPACE_BASE_URL` | `https://cesa.brightspace.com` |
| `BRIGHTSPACE_AUTH_URL` | `https://auth.brightspace.com/oauth2/auth` |
| `BRIGHTSPACE_TOKEN_URL` | `https://auth.brightspace.com/core/connect/token` |
| `BRIGHTSPACE_CLIENT_ID` | ID de la app OAuth registrada en Brightspace |
| `BRIGHTSPACE_CLIENT_SECRET` | Secret de la app OAuth |
| `BRIGHTSPACE_SCOPE` | `core:*:* Application:*:* Data:*:* grades:gradeobjects:read grades:grades:read outcomes:sets:read` |
| `BRIGHTSPACE_REDIRECT_URI` | Callback OAuth (backend URL + `/auth/brightspace/callback`) |
| `BRIGHTSPACE_LP_VERSION` | Versión de la LP API (actual: `1.50`) |
| `BRIGHTSPACE_LO_VERSION` | Versión de la LO API (actual: `1.92`) |
| `FRONTEND_BASE_URL` | URL pública del frontend (para redirecciones post-login) |
| `TOOL_BASE_URL` | URL pública del backend (usada por LTI) |
| `DATABASE_URL` | Cadena de conexión Postgres |

---

## Scripts

### Frontend
```bash
npm run dev        # Dev server con HMR
npm run build      # Build producción → dist/
npm run lint       # ESLint 9 (flat config)
npm run preview    # Preview del build
```

### Backend
```bash
uvicorn app.main:app --reload --port 8000    # Dev
alembic upgrade head                          # Aplicar migraciones
alembic revision --autogenerate -m "msg"      # Crear nueva migración
```

No hay framework de tests configurado en el frontend.

---

## Estructura del código

### Frontend (`gemelo-digital-frontend/gemelo-frontend/src/`)

```
components/
  auth/              # LoginScreen, ProtectedRoute
  dashboard/         # SmartAlerts, CourseTrends, DueDateCalendar,
                     # AINarrativeSummary, GradePredictions, EvidenceReports
  student-detail/    # Perfil analítico del estudiante
  ui/                # Breadcrumb, CommandPalette, ErrorBoundary,
                     # StudentAvatar, LastUpdated, ContextualTip
context/             # AuthContext, CourseContext, ThemeContext,
                     # I18nContext, ToastContext
hooks/               # useMediaQuery, useCompactMode, useStudentChat,
                     # useStudentNotes, useCourseSnapshots, useKeyboardShortcuts
pages/               # RoleHome, TeacherDashboard, StudentPortal,
                     # CoordinatorDashboard
utils/               # api (fetch), helpers (riesgo, formato),
                     # colors, export (CSV), prediction, voice, speech
styles/global.js     # Todo el CSS-in-JS con custom properties para theming
```

### Backend (`gemelo-digital-backend/app/`)

```
main.py              # FastAPI app, middlewares, mount de rutas
api/
  gemelo.py          # Endpoints de analytics (dashboard, RA, evidencias, predicciones)
  lti.py             # Launch LTI 1.3
  lti_keys.py        # JWKS público para LTI
  admin.py           # Endpoints administrativos
services/
  brightspace_auth.py     # OAuth flow + refresh token
  brightspace_client.py   # Cliente HTTP a Brightspace API
  gemelo_service.py       # Orquestador principal del dashboard
  gemelo_db_service.py    # Persistencia de snapshots/métricas
  sync_service.py         # Sync periódico Brightspace → DB
  scheduler_service.py    # APScheduler config
  risk_utils.py           # Cálculo de riesgo académico
  role_utils.py           # Detección de roles (docente/estudiante/admin)
  grade_filters.py        # Normalización de grade items
  scale_utils.py          # Conversión de escalas 0-10 ↔ 0-100
  common_utils.py         # Helpers compartidos
alembic/                  # Migraciones DB
config/                   # Configs opcionales por curso (rúbricas manuales)
```

---

## Autenticación y roles

El login es OAuth 2.0 contra Brightspace. Flujo:

1. Usuario click "Iniciar sesión con Microsoft" → redirige a Brightspace.
2. Brightspace autentica y redirige a `BRIGHTSPACE_REDIRECT_URI`.
3. Backend intercambia code por tokens, guarda sesión y responde con hash `#gemelo:{sid}:{orgUnitId}:{isFirstLogin}`.
4. Frontend guarda `sid` en `localStorage` como `gemelo_sid` y lo manda como `Bearer` en cada request.

Los roles se derivan de `/brightspace/courses/enrolled`. Un usuario puede tener rol dual (estudiante + docente). Las rutas están protegidas con `<ProtectedRoute>` según rol:

| Ruta | Rol requerido |
|---|---|
| `/` | RoleHome (selector si tiene rol dual, o auto-redirect) |
| `/dashboard/*` | docente / admin |
| `/coordinator` | docente / admin |
| `/portal/*` | estudiante |

También hay entrada vía LTI 1.3 desde Brightspace (ver `app/api/lti.py`).

---

## Deploy

> ⚠️ **El CI/CD automático está roto.** Los workflows `deploy-backend.yml` / `deploy-frontend.yml` fallan en el step *"Configurar credenciales AWS (via OIDC)"* porque la *trust policy* del rol IAM `GemeloDigitalDeployerRole` no acepta el token OIDC de este repo. **Hasta que se arregle (requiere acceso a AWS IAM), se despliega manualmente desde local** con el AWS CLI + Docker. Todo lo de abajo asume que ya hiciste `aws configure` con un IAM user con permisos de ECR/ECS/S3/CloudFront (cuenta `718624265053`, región `us-east-1`).

**Referencia rápida de recursos AWS:**

| Recurso | Valor |
|---|---|
| Cuenta / región | `718624265053` / `us-east-1` |
| Frontend | S3 `gemelo-frontend-prod` + CloudFront `E32WDBCT7SFCRD` |
| Backend | ECS cluster `default`, service `gemelo-digital-api`, ECR repo `gemelo-backend` |
| URL backend | https://ge-9d9d0220a8704eeabada1b951f3f2d37.ecs.us-east-1.on.aws |

### Flujo completo para subir una actualización

El backend **también sirve el SPA** (copia del build del frontend en `gemelo-digital-backend/frontend_dist/`), así que un cambio de frontend implica reconstruir el bundle **y** refrescar `frontend_dist` antes de construir la imagen del backend.

**1) Build del frontend:**
```bash
cd gemelo-digital-frontend/gemelo-frontend
npm run build                      # genera dist/ con un bundle content-hashed (ej: index-XXXX.js)
```

**2) Deploy del frontend (S3 + CloudFront):**
```bash
aws s3 sync ./dist/ s3://gemelo-frontend-prod --delete --region us-east-1
aws cloudfront create-invalidation --distribution-id E32WDBCT7SFCRD --paths "/*" --region us-east-1
```

**3) Refrescar el bundle embebido en el backend:**
```bash
cd ../../gemelo-digital-backend
rm -rf frontend_dist && cp -r ../gemelo-digital-frontend/gemelo-frontend/dist ./frontend_dist
```

**4) Build + push de la imagen backend (⚠️ flags obligatorios para Fargate):**
```bash
# git-bash en Windows: evita que se mangleen los args con "/"
export MSYS_NO_PATHCONV=1

aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin 718624265053.dkr.ecr.us-east-1.amazonaws.com

# Fargate SOLO acepta un manifiesto Docker v2 de una plataforma. BuildKit por
# defecto agrega provenance/attestation (OCI image index) y Fargate lo rechaza
# con "tasks failed to start". Por eso: --provenance=false --sbom=false --platform linux/amd64
docker buildx build \
  --platform linux/amd64 --provenance=false --sbom=false \
  -t 718624265053.dkr.ecr.us-east-1.amazonaws.com/gemelo-backend:latest \
  --push .
```

**5) Forzar el redeploy en ECS:**
```bash
aws ecs update-service --cluster default --service gemelo-digital-api \
  --force-new-deployment --region us-east-1
```

**6) Esperar a que quede estable y verificar:**
```bash
aws ecs wait services-stable --cluster default --services gemelo-digital-api --region us-east-1

# health y que sirva el bundle nuevo (reemplaza el hash por el de tu build)
BASE=https://ge-9d9d0220a8704eeabada1b951f3f2d37.ecs.us-east-1.on.aws
curl -s "$BASE/health"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/assets/index-XXXX.js"
```

### Gotchas del deploy (aprendidos a la mala)

- **Secretos obligatorios en producción (desde 2026-07):** el backend **falla al arrancar** si `TOOL_BASE_URL` es `https://` y no están definidos `SESSION_SECRET` y `LTI_STATE_SECRET` (antes caían al default inseguro `change-me`). Ojo: cambiarlos invalida las cookies LTI activas (los usuarios simplemente relanzan desde Brightspace).
- **Secretos vía AWS Secrets Manager:** `taskdef-clean.json` ya no lleva secretos en `environment`; van en el bloque `secrets` referenciando Secrets Manager. Antes de registrar la nueva task definition:
  ```bash
  # Generar valores fuertes:  python -c "import secrets; print(secrets.token_urlsafe(48))"
  aws secretsmanager create-secret --name gemelo/session-secret          --secret-string "<VALOR>" --region us-east-1
  aws secretsmanager create-secret --name gemelo/lti-state-secret        --secret-string "<VALOR>" --region us-east-1
  aws secretsmanager create-secret --name gemelo/brightspace-client-secret --secret-string "<VALOR>" --region us-east-1
  aws secretsmanager create-secret --name gemelo/database-url            --secret-string "postgresql+psycopg://..." --region us-east-1
  aws secretsmanager create-secret --name gemelo/elevenlabs-api-key      --secret-string "<VALOR>" --region us-east-1
  ```
  y verificar que `ecsTaskExecutionRole` tenga `secretsmanager:GetSecretValue` sobre `arn:aws:secretsmanager:us-east-1:718624265053:secret:gemelo/*`. Registrar con `aws ecs register-task-definition --cli-input-json file://taskdef-clean.json` y apuntar el servicio a la nueva revisión.
- **⚠️ `secrets[].valueFrom` requiere el ARN COMPLETO con sufijo** (ej. `...secret:gemelo/database-url-gJuD2u`). Con el ARN parcial (sin el sufijo aleatorio de 6 caracteres) las tareas Fargate fallan con `ResourceNotFoundException: Secrets Manager can't find the specified secret` y el circuit breaker hace rollback. Obtén los ARNs completos con `aws secretsmanager list-secrets --region us-east-1 --query "SecretList[?starts_with(Name,'gemelo/')].ARN"`. El `taskdef-clean.json` ya los tiene.
- **🔴 ROTAR credenciales expuestas:** el `BRIGHTSPACE_CLIENT_SECRET`, el `DATABASE_URL` (contraseña de RDS) y el `ELEVENLABS_API_KEY` estuvieron commiteados en texto plano en `taskdef*.json` y quedaron en el **historial de git**. Hay que rotarlos (Brightspace → Manage Extensibility → OAuth 2.0; RDS → modify master password; ElevenLabs → regenerar API key) y cargar los valores nuevos en Secrets Manager.
- **Endpoints `/debug/*` ahora responden 404** salvo que el task definition tenga `DEBUG_ENDPOINTS_ENABLED=1`. Para los syncs manuales (`/debug/sync/*`) habilita la variable temporalmente o ejecútalos desde un entorno local apuntando a la BD.
- **`start.sh` con CRLF** → el contenedor Linux falla con `exec ./start.sh: no such file or directory`. El `Dockerfile` ya normaliza el CRLF (`sed -i 's/\r$//' ./start.sh`); no lo revierta.
- **Estrategia CANARY con auto-rollback:** el servicio usa despliegue canary (5%, bake ~3 min) con `deploymentCircuitBreaker` y una alarma CloudWatch `default/gemelo-digital-api/RollbackAlarm` (error % > 1.0). Un deploy que falle genera 5xx y **deja la alarma en ALARM**; el siguiente deploy —aunque la imagen sea sana— hará rollback con *"alarm detected"*. Si eso pasa, **espera a que la alarma vuelva a `OK`** antes de reintentar:
  ```bash
  aws cloudwatch describe-alarms --alarm-names \
    "default/gemelo-digital-api/RollbackAlarm" --region us-east-1 \
    --query 'MetricAlarms[0].StateValue'
  ```
- **Verifica el digest de la task en ejecución** para confirmar que corre la imagen nueva (no una cacheada):
  ```bash
  TASK=$(aws ecs list-tasks --cluster default --service-name gemelo-digital-api \
    --desired-status RUNNING --region us-east-1 --query 'taskArns[0]' --output text)
  aws ecs describe-tasks --cluster default --tasks "$TASK" --region us-east-1 \
    --query 'tasks[0].containers[0].imageDigest'
  ```

### Avisos a usuarios (in-app / correo)

Para notificar una actualización a los usuarios existe el endpoint `POST /gemelo/admin/announcement` (requiere sesión **super-admin**, `user_id` en `SUPERADMIN_IDS`, default `5427`). Publica un aviso in-app (campana del portal + Centro de ayuda del docente) y opcionalmente envía correo (BCC) a staff no-estudiante.

```bash
BASE=https://ge-9d9d0220a8704eeabada1b951f3f2d37.ecs.us-east-1.on.aws
curl -s -X POST "$BASE/gemelo/admin/announcement" \
  -H "Authorization: Bearer <TU_gemelo_sid>" -H "Content-Type: application/json" \
  -d '{"subject":"Novedades — versión X.Y.Z","message":"...","tag":"Actualización","send_email":false}'
```

Dos limitaciones actuales en prod:
- **Sin SMTP en el task definition** de ECS → `send_email:true` no envía nada (`smtp_configured()` es false). Las credenciales de `desarrolloprofesoral@cesa.edu.co` sí funcionan vía `smtp.office365.com:587` (STARTTLS); para habilitar correo hay que agregar `SMTP_HOST/PORT/USER/PASSWORD/SMTP_FROM(_NAME)` al task definition y redeployar.
- **Sistema de archivos efímero** → los avisos in-app se guardan en `frontend_dist/../announcements.json` dentro del contenedor y **se pierden en el próximo redeploy** (no hay `GEMELO_DATA_DIR` con volumen persistente). Para persistirlos habría que montar un volumen o moverlos a la base de datos.

### Ver logs backend

```bash
export MSYS_NO_PATHCONV=1   # git-bash en Windows
aws logs tail /aws/ecs/default/gemelo-digital-api-cbc4 \
  --region us-east-1 --since 10m --follow
```

---

## Integración Brightspace

Endpoints principales consumidos:

| API | Uso |
|---|---|
| `/d2l/api/lp/{v}/enrollments/myenrollments/` | Cursos del usuario |
| `/d2l/api/lp/{v}/{orgUnitId}/classlist/` | Roster del curso |
| `/d2l/api/le/{v}/{orgUnitId}/grades/` | Grade items del curso |
| `/d2l/api/le/{v}/{orgUnitId}/grades/values/` | Notas de estudiantes |
| `/d2l/api/le/{v}/{orgUnitId}/dropbox/folders/` | Dropbox folders |
| `/d2l/api/le/{v}/{orgUnitId}/lo/outcomeSets/` | Resultados de aprendizaje (RA) |
| `/d2l/api/le/{v}/{orgUnitId}/lo/alignments/` | Alineamientos RA → rúbricas (requiere `1.93+`; 404 en `1.92`) |
| `/d2l/api/le/{v}/lo/bulkImport` (org) y `/{orgUnitId}/lo/bulkImport` | Creación/import de conjuntos de RA (merge, no destruye) |

### Resultados de Aprendizaje (RA)

CESA usa el formato de descripción `CODIGO-Descripción` (ej: `Z1O1DOR3-Emplear los conceptos básicos...`). El backend parsea `outcomeSets` para extraer los códigos, y con la API de alignments (`BRIGHTSPACE_ALIGN_VERSION=1.93`, separada de `BRIGHTSPACE_LO_VERSION=1.92`) mapea RA → rúbricas/quizzes automáticamente para cursos sin configuración manual. Ojo: la granularidad del alignment es a nivel de RÚBRICA (no por criterio), por lo que RA que comparten rúbrica muestran promedios idénticos. La consola `/outcomes` permite además crear conjuntos desde plantilla CSV, importarlos a uno o varios cursos (individual o masivo con checkboxes) y editar descripciones del registro global.

---

## Base de datos

Modelo simplificado (ver `app/models/` para el detalle):

- `courses` — snapshot de metadata de cursos
- `students` — usuarios con rol estudiante enrollados
- `course_metric_history` — histórico diario de métricas del curso (para tendencias)
- `course_overview_cache` — cache de dashboard servido desde DB
- `student_notes` — notas del docente sobre estudiantes
- `sync_tracking` — control de última sync por recurso

Migraciones con Alembic en `alembic/versions/`.

---

## Guía Claude Code

Este repo incluye `CLAUDE.md` con instrucciones para agentes de Claude Code. Al editar el proyecto con Claude, respetar:

- No crear archivos `.md` nuevos sin pedirlo.
- Editar archivos existentes en vez de crear duplicados.
- El UI está mayoritariamente en español.
- No hay TypeScript en el frontend.

---

## Troubleshooting

**"Sin uso" en todos los RA del curso**
Verifica que `outcomeCodeMap` venga poblado en `GET /gemelo/course/{orgUnitId}/learning-outcomes`. Si está vacío pese a que `outcomeSets` tiene datos, revisa logs de CloudWatch por warnings de `auto_lo_config`.

**Login redirige a Brightspace en bucle**
Confirma que `BRIGHTSPACE_REDIRECT_URI` en `.env` coincide exactamente con el registrado en la app OAuth de Brightspace y con `TOOL_BASE_URL`.

**Frontend en localhost muestra datos de AWS**
Elimina o comenta `VITE_API_BASE_URL` en el `.env` del frontend para que use el proxy de Vite hacia `localhost:8000`.

**Cambios en local no se ven en producción**
El bundle nuevo puede estar en el proxy corporativo. Confirma que el archivo `dist/index.html` en S3 referencia el hash del bundle esperado y que la invalidación CloudFront terminó (`Status: Completed`).

---

## Licencia y contacto

Uso interno CESA. Para soporte técnico: equipo de desarrollo Gemelo Digital.
