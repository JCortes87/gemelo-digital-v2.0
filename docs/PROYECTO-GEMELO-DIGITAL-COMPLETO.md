# Gemelo Digital CESA — Documentación maestra del proyecto

> Documento de referencia consolidado. Cubre qué hace el proyecto, cómo está
> construido, qué infraestructura usa, cómo se despliega, y dónde encontrar
> cada cosa. Pensado para que cualquier persona técnica que herede el
> proyecto pueda continuarlo sin pedir contexto a nadie.
>
> **Última actualización**: junio 2026.

---

## 1. ¿Qué es Gemelo Digital?

Herramienta de analítica de aprendizaje para **CESA** (Colegio de Estudios
Superiores de Administración). Se integra con **Brightspace** (el LMS de
CESA) y muestra a docentes, coordinadores y estudiantes información
agregada y predictiva sobre el desempeño de cada curso.

### Funcionalidades principales

#### Vista de docente
- **Dashboard del curso** con KPIs agregados: promedio de notas, cobertura
  de evaluación, distribución de riesgo, alertas, etc.
- **Estudiantes prioritarios** — quiénes necesitan intervención y por qué.
- **SmartAlerts** — alertas inteligentes (cobertura baja, desempeño bajo,
  concentración de riesgo, etc.).
- **GradePredictions** — predicción de notas finales por estudiante.
- **DueDateCalendar** — calendario con todas las fechas de entrega.
- **EvidenceReports** — reporte detallado de evidencias por estudiante.
- **AINarrativeSummary** — resumen narrativo del curso generado por IA.
- **CoursesComparison** — comparación entre cursos del mismo docente.
- **CourseTrends** — tendencias del curso a lo largo del semestre
  (persistidas en DB, históricas).
- **Descarga de evidencias** y feedback del docente.

#### Vista de estudiante
- **Portal personal** con todos sus cursos.
- **Mis cursos** y su rendimiento individual.
- **Cortes** y evidencias vencidas.
- **Calendario personal** con fechas de entrega.
- **Proyección explicada** — predicción de nota final con explicación.

#### Vista de coordinador
- **Vista superior** de todos los cursos bajo su responsabilidad.
- **Filtros por semestre** y año académico.

#### Vista de superadmin
- **Búsqueda por ID** de cualquier curso o usuario.
- **Modo impersonar** — ver el sistema desde la perspectiva de otro
  usuario para diagnóstico/soporte.

### Cómo se accede

- **Embebido en Brightspace** vía **LTI 1.3**: el docente entra desde un
  link dentro de su curso.
- **Standalone web**: navegando a `https://gemelo.cesa.edu.co` y
  logueándose con su cuenta CESA (Microsoft SSO vía Brightspace OAuth).

---

## 2. Arquitectura general

```
                         USUARIOS FINALES
                  (docentes, estudiantes, coordinadores)
                              │
                              ▼
    ┌─────────────────────────────────────────────────┐
    │           https://gemelo.cesa.edu.co            │
    │              CloudFront (CDN)                   │
    │           Distribution: E32WDBCT7SFCRD          │
    └────────────────────┬────────────────────────────┘
                         │
                         ▼
    ┌─────────────────────────────────────────────────┐
    │           S3 Bucket: gemelo-frontend-prod        │
    │           (archivos estáticos del SPA React)    │
    └─────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────┐
    │     https://ge-9d9d0220a8704eeabada1b951f3f...  │
    │              ECS Fargate Service                │
    │            Cluster: default                     │
    │            Service: gemelo-digital-api          │
    │     Container: gemelo-backend:latest (de ECR)    │
    │              Backend FastAPI (Python 3.11)      │
    └────────────────────┬────────────────────────────┘
                         │
                         ├──────────────► Brightspace API
                         │                (LMS de CESA)
                         │
                         ▼
    ┌─────────────────────────────────────────────────┐
    │           RDS PostgreSQL                        │
    │           Instance: gemelo-digital-db           │
    │           Engine: PostgreSQL 16, db.t4g.micro   │
    │   Tablas:                                       │
    │   - courses, students, enrollments              │
    │   - grade_items, dropbox_folders, outcome_sets  │
    │   - student_course_metric_snapshots             │
    │   - course_metric_history (tendencias diarias)  │
    │   - sync_runs, sync_state, sync_errors          │
    └─────────────────────────────────────────────────┘
```

---

## 3. Stack tecnológico

### Backend
- **Lenguaje**: Python 3.11
- **Framework web**: FastAPI 0.115
- **Servidor ASGI**: Uvicorn 0.30
- **ORM**: SQLAlchemy 2.0
- **Migraciones DB**: Alembic 1.14
- **Driver PostgreSQL**: psycopg 3.2 (psycopg3)
- **HTTP client (Brightspace API)**: httpx 0.27
- **Autenticación**: python-jose (JWT), cryptography (LTI keys)
- **TTS opcional**: ElevenLabs API (configurable, actualmente desactivada
  en frontend pero infraestructura intacta)
- **Containerizado**: Docker (Python 3.11-slim base)

### Frontend
- **Framework**: React 19
- **Bundler**: Vite 8
- **Routing**: React Router
- **Estado global**: Context API (AuthContext, CourseContext, I18nContext,
  ThemeContext, ToastContext)
- **Charts**: Recharts 3.7
- **Estilos**: CSS Modules
- **Lenguaje**: JavaScript (ES2022+) + algunos archivos TypeScript

### Infraestructura
- **Cloud**: AWS (región us-east-1, North Virginia)
- **Cuenta AWS**: 718624265053
- **Compute**: ECS Fargate (Modo Exprés)
- **Registry**: ECR (Elastic Container Registry)
- **Static hosting**: S3 + CloudFront
- **Database**: RDS PostgreSQL
- **Identity**: IAM con OIDC para GitHub Actions
- **CI/CD**: GitHub Actions

---

## 4. Repositorios

### Repositorio principal (production)
- **URL**: https://github.com/JCortes87/proyecto-gemelos-digitales-JC
- **Dueño actual**: JCortes87
- **Branch productiva**: `main` (cada merge a esta rama dispara deploy automático)
- **Branch de trabajo histórica**: `sync/upstream-abril-2026` (puede usarse para PRs)

### Repositorio del colaborador (referencia, solo lectura)
- **URL**: https://github.com/juandavid639/Proyecto-Gemelos-Digitales
- **Dueño**: Juan David
- **Uso**: referencia para mirar su versión histórica. **NUNCA se debe
  empujar a este repo** desde nuestro setup. Está configurado como remote
  `colaborador` con push deshabilitado.

### Repositorio fork inicial (archivo, no usar)
- **URL**: https://github.com/JCortes87/gemelo-digital-backend-JC
- **Estado**: archivado. Era un experimento inicial. Tiene una rama
  `integracion/manual-controlada` con trabajo histórico.

---

## 5. URLs de producción

### URL principal (lo que los usuarios usan)
- **Frontend SPA**: https://gemelo.cesa.edu.co
- Servida por CloudFront, distribución `E32WDBCT7SFCRD`.

### Backend API
- **URL directa de ECS Fargate**:
  `https://ge-9d9d0220a8704eeabada1b951f3f2d37.ecs.us-east-1.on.aws`
- El frontend la llama via `VITE_API_BASE_URL` (definido en `.env.production`).

### Endpoints clave del backend

| Endpoint | Para qué |
|---|---|
| `GET /health` | Health check del backend. Esperado: `{"status":"ok"}` |
| `GET /debug/db` | Ping a Postgres. Esperado: `{"db_ok":true}` |
| `GET /auth/brightspace/login` | Inicio del OAuth flow con Brightspace |
| `GET /auth/brightspace/callback` | Callback OAuth, recibe el code, genera sesión |
| `GET /auth/me` | Devuelve info del usuario logueado |
| `POST /auth/logout` | Cierra sesión |
| `GET /gemelo/course/{ou}/overview` | Overview agregado del curso (DB-first con fallback Brightspace) |
| `GET /gemelo/course/{ou}/student/{userId}` | Datos del gemelo digital de un estudiante |
| `GET /gemelo/course/{ou}/students` | Lista de estudiantes del curso |
| `GET /gemelo/course/{ou}/ra/dashboard` | Dashboard de Resultados de Aprendizaje |
| `GET /debug/course/{ou}/overview-db` | Igual que overview pero sin auth, solo desde DB |
| `POST /admin/sync-cron-all` | Endpoint protegido para scheduler externo. Sincroniza todos los cursos. |
| `GET /admin/show-refresh-token` | **Herramienta temporal** — captura el refresh_token después de loguear (eliminar tras usar) |
| `POST /speech/tts` | Texto a voz vía ElevenLabs (si está configurada) |
| `POST /speech/stt` | Voz a texto vía ElevenLabs (si está configurada) |
| `GET /.well-known/jwks.json` | JWKS público para LTI 1.3 |
| `POST /lti/login` | OIDC login initiation (LTI 1.3) |
| `POST /lti/launch` | LTI launch endpoint |

---

## 6. Infraestructura AWS — detallada

Región: **us-east-1** (N. Virginia).
Cuenta: **718624265053**.

### ECS (Elastic Container Service)
- **Cluster**: `default`
- **Service**: `gemelo-digital-api` (modo Exprés)
- **Task Definition**: `default-gemelo-digital-api:73` (o revisión más reciente)
- **CPU**: 1 vCPU (1024 unidades)
- **Memoria**: 2 GiB (2048 MiB)
- **Health check path**: `/health`
- **Puerto**: 8000
- **Tareas activas**: 1 (configurable según necesidad)
- **Rol de ejecución**: `ecsTaskExecutionRole`
- **Rol de infraestructura**: `ecsInfrastructureRoleForExpressServices`

### ECR (Elastic Container Registry)
- **Repositorio**: `gemelo-backend`
- **URI**: `718624265053.dkr.ecr.us-east-1.amazonaws.com/gemelo-backend`
- **Tags**:
  - `latest` — imagen más reciente desplegada (siempre actualizada por CI/CD)
  - `<sha>` — etiqueta por cada commit, para trazabilidad y rollback
- **Otros repos en ECR** (no usados por este proyecto):
  - `cesa-backend` — otro proyecto CESA
  - `gemelo-digital/gemelo-digital-backend` — repo histórico, abandonado

### RDS (PostgreSQL)
- **Identifier**: `gemelo-digital-db`
- **Engine**: PostgreSQL 16
- **Clase**: `db.t4g.micro`
- **Endpoint**: `gemelo-digital-db.crp1lzwejl3x.us-east-1.rds.amazonaws.com`
- **Puerto**: 5432
- **Nombre de base de datos**: `gemelo_digital`
- **Usuario**: `gemelo_admin`
- **Password**: (en taskdef como `DATABASE_URL`)
- **Backups automáticos**: configurados por AWS
- **Snapshots manuales**: tomar antes de cada deploy de riesgo

### S3 (Frontend)
- **Bucket**: `gemelo-frontend-prod`
- **Versioning**: **Activo** (permite rollback por archivo).
- **Política**: público (entregado vía CloudFront).

### CloudFront (CDN)
- **Distribution ID**: `E32WDBCT7SFCRD`
- **Dominio asociado**: `gemelo.cesa.edu.co`
- **Cache**: invalidation por workflow después de cada deploy frontend.

### IAM
- **Rol para CI/CD**: `GemeloDigitalDeployerRole`
  - ARN: `arn:aws:iam::718624265053:role/GemeloDigitalDeployerRole`
  - Trust policy: confía en GitHub Actions OIDC desde el repo
    `JCortes87/proyecto-gemelos-digitales-JC`.
  - Policy: `GemeloDigitalDeployerPolicy` (permisos ECR + ECS + S3 + CloudFront)
- **OIDC Provider**: `token.actions.githubusercontent.com`
- **Usuario IAM personal**: el que JC usa para entrar a Console.

### CloudWatch Logs
- **Log group del backend**: `/aws/ecs/default/gemelo-digital-api-cbc4`
- Aquí se ven los logs de uvicorn: arranque, requests, errores.

---

## 7. Base de datos — esquema

Tablas principales (definidas en `app/db/models.py`):

| Tabla | Para qué |
|---|---|
| `courses` | Catálogo de cursos sincronizados desde Brightspace |
| `students` | Catálogo de estudiantes |
| `enrollments` | Inscripciones (estudiante × curso), con `is_active` |
| `grade_items` | Items de calificación del gradebook |
| `dropbox_folders` | Carpetas de entrega del Brightspace |
| `outcome_sets` | Sets de resultados de aprendizaje |
| `student_course_metric_snapshots` | Snapshot diario de métricas por estudiante |
| `course_metric_history` | Histórico diario de métricas agregadas del curso (para trends) |
| `sync_runs` | Bitácora de ejecuciones de sync |
| `sync_state` | Estado del último sync por curso |
| `sync_errors` | Errores de sync para diagnóstico |

### Migraciones Alembic

Cadena actual (orden de aplicación):
```
0001_initial_schema
  → 87095c55fccf  (add_sync_control_tables — placeholder)
  → ef7efb89bf39  (add_sync_control_tables — placeholder)
  → 712ebad8e3d1  (add_sync_control_tables — placeholder)
  → b6f1918135ed  (add_student_metric_snapshots — placeholder)
  → a1b2c3d4e5f6  (add_date_fields_to_grade_items_dropbox)
  → c3d4e5f6a7b8  (add_course_metric_history)  ← HEAD actual
```

Las migraciones se aplican **automáticamente** al arrancar el container,
gracias al script `start.sh`:

```bash
#!/bin/bash
set -e
if [ -n "$DATABASE_URL" ]; then
  alembic upgrade head
fi
exec uvicorn main:app --host 0.0.0.0 --port 8000
```

### Acceso directo a la DB

Para consultas SQL ad-hoc sobre producción:
- **AWS Console → RDS → Bases de datos → gemelo-digital-db → "Editor de consultas"**.
- O conexión por psql con `DATABASE_URL`.

---

## 8. CI/CD — Despliegue automático

### Cómo se dispara el deploy

Cualquier **push a `main`** que toque archivos en:
- `gemelo-digital-backend/**` → dispara el workflow del backend.
- `gemelo-digital-frontend/**` → dispara el workflow del frontend.
- `.github/workflows/deploy-*.yml` → dispara ambos (cambios al CI).

Si tocas ambos, ambos se disparan en paralelo.

### Disparar manualmente

En **GitHub → repo → Actions → Deploy backend a ECS / Deploy frontend a S3
y CloudFront → Run workflow**.

### Workflows

**`.github/workflows/deploy-backend.yml`**:
1. Checkout del código.
2. Configura credenciales AWS vía OIDC.
3. Login a ECR.
4. Build de la imagen Docker (`docker build` desde `gemelo-digital-backend/`).
5. Push a ECR con tags `latest` y SHA del commit.
6. `aws ecs update-service --force-new-deployment`.
7. Espera a que el servicio quede estable.
8. Tiempo total: ~10 minutos.

**`.github/workflows/deploy-frontend.yml`**:
1. Checkout del código.
2. Setup Node.js 20.
3. `npm ci` en `gemelo-digital-frontend/gemelo-frontend/`.
4. `npm run build`.
5. Configura credenciales AWS vía OIDC.
6. `aws s3 sync ./dist/ s3://gemelo-frontend-prod --delete`.
7. `aws cloudfront create-invalidation --distribution-id E32WDBCT7SFCRD --paths "/*"`.
8. Tiempo total: ~2-3 minutos.

### Seguridad de CI/CD

- **Sin Access Keys en GitHub** — usa OIDC para credenciales temporales.
- **Trust scope** — solo se aceptan workflows desde el repo
  `JCortes87/proyecto-gemelos-digitales-JC`. Si alguien intentara desde
  otro repo, AWS lo rechazaría.
- **Policy mínima** — el rol solo tiene los permisos exactos para ECR,
  ECS, S3 y CloudFront del proyecto.

### Documentación adicional CI/CD

Ver `docs/setup-scheduler.md` para la guía del schedule de sincronización
periódica (sync-cron-all).

---

## 9. Variables de entorno (producción)

Definidas en el `taskdef` de ECS (sección `environment`):

### Brightspace OAuth
- `BRIGHTSPACE_CLIENT_ID` — Client ID OAuth registrado en Brightspace.
- `BRIGHTSPACE_CLIENT_SECRET` — Client secret.
- `BRIGHTSPACE_REDIRECT_URI` — URL de callback OAuth (debe coincidir con lo registrado en Brightspace).
- `BRIGHTSPACE_AUTH_URL` — `https://auth.brightspace.com/oauth2/auth`
- `BRIGHTSPACE_TOKEN_URL` — `https://auth.brightspace.com/core/connect/token`
- `BRIGHTSPACE_BASE_URL` — `https://cesa.brightspace.com`
- `BRIGHTSPACE_SCOPE` — Scope OAuth con permisos a la API de Brightspace.
- `BRIGHTSPACE_LP_VERSION` — Versión de la API LP (Learning Platform).
- `BRIGHTSPACE_LE_VERSION` — Versión de la API LE (Learning Experience).

### LTI 1.3 (embedding en Brightspace)
- `LTI_CLIENT_ID` — Client ID de la herramienta LTI registrada en Brightspace.
- `LTI_ISSUER` — `https://cesa.brightspace.com`
- `LTI_AUTH_ENDPOINT` — `https://cesa.brightspace.com/d2l/lti/authenticate`
- `LTI_JWKS_URL` — `https://cesa.brightspace.com/d2l/.well-known/jwks`

### Base de datos
- `DATABASE_URL` — URL completa de conexión a RDS. Formato:
  `postgresql+psycopg://user:password@host:5432/dbname`

### URL del frontend y self
- `FRONTEND_BASE_URL` — `https://gemelo.cesa.edu.co`
- `TOOL_BASE_URL` — URL pública del backend (la de ECS Fargate).

### ElevenLabs (voz, opcional)
- `ELEVENLABS_API_KEY` — Si está configurada, los endpoints `/speech/*` funcionan.
- `ELEVENLABS_VOICE_ID` — ID de voz por defecto.

### Otros
- `SESSION_SECRET` — Secret para firmar state en OAuth.
- `LTI_STATE_SECRET` — Secret para firmar state en LTI launches.
- `LTI_PRIVATE_KEY_PATH` — Path a la llave privada RSA para firmar JWTs LTI.

### Variables para scheduler (cuando se active)
- `BRIGHTSPACE_SERVICE_REFRESH_TOKEN` — Refresh token de cuenta de servicio. Ver `docs/setup-scheduler.md`.
- `CRON_SHARED_SECRET` — Secret para autenticar el scheduler externo.

---

## 10. Operaciones comunes — recetario

### Hacer un cambio de código y desplegarlo

1. Hacer el cambio localmente en la rama que prefieras (típicamente
   `sync/upstream-abril-2026` o crear una nueva).
2. `git add` + `git commit` con mensaje descriptivo.
3. Abrir un Pull Request a `main` en GitHub.
4. Revisar y mergear el PR.
5. GitHub Actions deploya automáticamente.

### Ver los logs del backend en producción

1. AWS Console → CloudWatch → Log groups → `/aws/ecs/default/gemelo-digital-api-cbc4`.
2. O desde ECS Console → cluster `default` → service `gemelo-digital-api`
   → pestaña **Registros**.

### Ver qué imagen está corriendo

ECS Console → service → pestaña **Configuración** → busca línea **Imagen**.
Muestra algo como:
```
718624265053.dkr.ecr.us-east-1.amazonaws.com/gemelo-backend:latest
```

### Forzar un redeploy sin cambios de código

ECS Console → service → **Actualizar servicio** → marca casilla
**"Forzar nueva implementación"** → **Actualizar**.

### Tomar un snapshot manual de la base de datos

RDS Console → bases de datos → `gemelo-digital-db` → **Acciones** →
**Realizar instantánea** → ponle nombre descriptivo (ej.
`pre-deploy-2026-06-15`).

### Disparar un sync manual desde la web

Loguearse en `https://gemelo.cesa.edu.co`. Después llamar al endpoint
con sesión activa:
```
POST https://ge-9d9d0220a8704eeabada1b951f3f2d37.ecs.us-east-1.on.aws/debug/sync/master/{orgUnitId}
```

---

## 11. Rollback y recuperación

### Si un deploy de backend rompe producción

#### Opción A: usar consola de ECS para revertir la imagen
1. ECR Console → `gemelo-backend` → identifica el SHA de la imagen anterior.
2. Agrega tag `latest` a la imagen anterior (esto sobreescribe el tag).
3. ECS → service → "Forzar nueva implementación".

#### Opción B: revertir vía git
1. `git revert <hash-del-commit-malo>` localmente.
2. `git push origin main`.
3. GitHub Actions deploya la versión revertida.

#### Opción C (drástica): volver al backup
1. En GitHub, ve a la rama `backup/pre-merge-jd-junio-10` (o el backup más reciente).
2. Resetea `main` a esa rama.
3. Force push (solo en emergencia).

### Si un deploy de frontend rompe la web

#### Opción rápida — usar versiones S3
1. S3 Console → bucket `gemelo-frontend-prod` → activar **"Show versions"**.
2. Para cada archivo (especialmente `index.html` y archivos en `/assets/`),
   restaurar la versión anterior.
3. CloudFront → distribución `E32WDBCT7SFCRD` → crear invalidation `/*`.

#### Opción robusta — revertir vía git
Misma estrategia que backend opción B.

### Si la base de datos se corrompe

1. RDS Console → Snapshots → busca el snapshot reciente.
2. **Acciones** → **Restaurar instantánea** → te crea una **instancia nueva**.
3. Cambia `DATABASE_URL` en el taskdef para apuntar a la instancia nueva.
4. Forzar redeploy ECS.

⚠️ Restaurar una DB es una operación destructiva — solo hacerlo si
realmente hay corrupción de datos.

---

## 12. Coordinación humana

### Quién es quién (referencial)

- **Juan David**: colaborador original del proyecto. Su repo es el
  histórico de referencia. Para integrar nuevas features de él, hacer
  `git fetch colaborador` y mergear con cuidado (siempre validar
  migraciones de DB).
- **JCortes87**: dueño actual del proyecto. Tiene CI/CD configurado y
  hace los deploys vía GitHub Actions.
- **CESA admin AWS**: quien administra la cuenta AWS 718624265053. Ahí
  se piden permisos adicionales si se necesitan nuevas integraciones.
- **CESA admin Brightspace**: quien gestiona las apps OAuth y LTI en
  Brightspace. Si hay que registrar nuevas URLs de redirect o nuevas
  herramientas LTI, se le pide a esta persona.

### Si necesitas otra persona reciba el proyecto

1. Darle acceso al repo en GitHub (`Settings → Collaborators`).
2. Eventualmente, transferir el repo a una **GitHub Organization de CESA**
   para que quede del área, no de la persona.
3. Después de transferir, actualizar el trust policy del IAM role
   `GemeloDigitalDeployerRole` con la nueva ruta del repo
   (`<org>/proyecto-gemelos-digitales-JC` en lugar de
   `JCortes87/proyecto-gemelos-digitales-JC`).

---

## 13. Documentación adicional en el repo

Otros documentos útiles:

- **`gemelo-digital-backend/README.MD`** — README original del backend con
  instrucciones de deploy manual (histórico, ya no se usa porque hay CI/CD).
- **`docs/setup-scheduler.md`** — Guía completa para configurar el
  scheduler periódico de sincronización con AWS EventBridge.
- **`CLAUDE.md`** — Notas para Claude Code cuando se trabaja sobre el
  codebase.

---

## 14. Decisiones técnicas importantes (contexto histórico)

Estas son decisiones que se tomaron en el pasado y vale la pena conocer
para no romper invariantes al hacer cambios:

### Por qué el backend tiene Postgres además de Brightspace
Brightspace es la fuente de verdad de los datos académicos. Pero
consultarlo en cada request es lento (1-3 segundos por endpoint). Por eso
sincronizamos snapshots a Postgres y los endpoints "DB-first" sirven
desde ahí (~50ms). Si los datos en DB están viejos (>30 min), se cae al
path Brightspace y se persiste de vuelta en background.

### Por qué hay autenticación dual (OAuth + LTI)
- **OAuth**: para login standalone desde la web (`gemelo.cesa.edu.co`).
- **LTI 1.3**: para que la herramienta se embeba dentro de Brightspace
  (el docente entra desde un link en su curso, no hace login porque ya
  está logueado en Brightspace).

Ambas convergen en el mismo `SESSION_STORE` con la cookie
`gemelo_session_id`.

### Por qué el sync de classlist marca enrollments como inactivos
Si un estudiante se sale del curso en Brightspace, su classlist deja de
incluirlo. Antes, sus datos viejos seguían apareciendo en
"Estudiantes prioritarios" para siempre. Ahora `sync_classlist`
acumula los IDs vistos y al final marca como `is_active=False` cualquiera
que ya no aparezca. La consulta de overview filtra por `is_active=True`
para excluirlos automáticamente.

### Por qué hay refresh-token automático en sesiones
El access_token de Brightspace dura ~1 hora. Sin refresh-token, el
dashboard se quedaba sin datos después de 1 hora idle (la cookie seguía
válida pero las API calls a Brightspace fallaban con 401). Ahora el
backend detecta cuando al token le quedan <5 minutos y lo refresca
silenciosamente usando el refresh_token que Brightspace entrega en login.

### Por qué el repo tiene un workflow_dispatch
Permite disparar deploys manuales desde la pestaña Actions de GitHub sin
necesidad de hacer un commit. Útil para re-desplegar la misma versión
(por ejemplo si una variable de entorno cambió en taskdef y necesitas
que el container la lea).

---

## Apéndice: Diagrama del flujo de un request

```
1. Usuario abre https://gemelo.cesa.edu.co
              ▼
2. CloudFront sirve index.html desde S3
              ▼
3. Browser carga el JS de React
              ▼
4. App.jsx detecta que no hay sesión → muestra LoginScreen
              ▼
5. Usuario click "Login Brightspace"
              ▼
6. Frontend redirige a /auth/brightspace/login (popup OAuth)
              ▼
7. Backend redirige a Brightspace OAuth + Microsoft SSO
              ▼
8. Usuario autentica
              ▼
9. Brightspace redirige a /auth/brightspace/callback con code
              ▼
10. Backend intercambia code por access_token + refresh_token
              ▼
11. Backend guarda sesión en SESSION_STORE
              ▼
12. Backend devuelve cookie gemelo_session_id al browser
              ▼
13. Frontend redirige a /dashboard
              ▼
14. Frontend hace GET /gemelo/course/{ou}/overview
              ▼
15. Backend chequea sesión, refresca token si necesario
              ▼
16. Backend lee desde Postgres (path rápido) o Brightspace (fallback)
              ▼
17. Backend devuelve JSON con métricas
              ▼
18. Frontend renderiza dashboard
```

---

## Apéndice: Glosario

- **LTI 1.3**: Learning Tools Interoperability. Estándar para embeber
  herramientas externas en LMS.
- **Brightspace**: LMS desarrollado por D2L, usado por CESA.
- **orgUnitId**: identificador único de un curso en Brightspace
  (ej. `41742`).
- **OAuth 2.0**: protocolo de autorización; nuestro flujo es
  Authorization Code.
- **ECS Fargate**: servicio de contenedores serverless de AWS.
- **OIDC**: OpenID Connect; usado por GitHub Actions para autenticarse
  con AWS sin Access Keys.
- **Snapshot (en este proyecto)**: registro consolidado de métricas de
  un estudiante en un curso en un momento dado.
- **Gemelo Digital**: representación virtual del progreso académico de
  un estudiante; nombre del proyecto.

---

*Fin del documento.*
