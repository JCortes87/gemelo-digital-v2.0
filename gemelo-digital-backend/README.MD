# Gemelo Digital

Cuidado con el front , cambios realizados volver a la normalidad : 

 const GEMELO_API = API_BASE_URL;  Eliminar 

# Construir Front

npm run build
aws s3 sync .\dist\ s3://gemelo-frontend-prod --delete
aws cloudfront create-invalidation --distribution-id E32WDBCT7SFCRD --paths "/*"

# Construir backend

docker build -t gemelo-api

/gemelo-digital/gemelo-digital-backend

aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 718624265053.dkr.ecr.us-east-1.amazonaws.com

docker tag gemelo-api 718624265053.dkr.ecr.us-east-1.amazonaws.com/gemelo-digital/gemelo-digital-backend

docker push 718624265053.dkr.ecr.us-east-1.amazonaws.com/gemelo-digital/gemelo-digital-backend:latest



Variables de ambiente ECS


{
  "name": "Main",
  "image": "718624265053.dkr.ecr.us-east-1.amazonaws.com/gemelo-digital/gemelo-digital-backend:latest",
  "cpu": 1024,
  "memoryReservation": 2048,
  "portMappings": [
    {
      "name": "main-8000-tcp",
      "containerPort": 8000,
      "hostPort": 8000,
      "protocol": "tcp"
    }
  ],
  "essential": true,
  "environment": [
    {
      "name": "BRIGHTSPACE_SCOPE",
      "value": "core:*:* Application:*:* Data:*:* grades:gradeobjects:read grades:grades:read outcomes:sets:read"
    },
    {
      "name": "BRIGHTSPACE_BASE_URL",
      "value": "https://cesa.brightspace.com"
    },
    {
      "name": "BRIGHTSPACE_AUTH_URL",
      "value": "https://auth.brightspace.com/oauth2/auth"
    },
    {
      "name": "BRIGHTSPACE_CLIENT_ID",
      "value": "b566f3ae-1907-4ca4-92d7-b423590aabf4"
    },
    {
      "name": "BRIGHTSPACE_LP_VERSION",
      "value": "1.50"
    },    
    {
      "name": "FRONTEND_BASE_URL",
      "value": "https://gemelo.cesa.edu.co"
    },
    {
      "name": "BRIGHTSPACE_CLIENT_SECRET",
      "value": "<NUNCA-COMMITEAR-EL-SECRET — usar SSM Parameter Store, ver seccion 'Secretos'>"
    },
    {
      "name": "TOOL_BASE_URL",
      "value": "https://ge-9d9d0220a8704eeabada1b951f3f2d37.ecs.us-east-1.on.aws"
    },
    {
      "name": "BRIGHTSPACE_REDIRECT_URI",
      "value": "https://ge-9d9d0220a8704eeabada1b951f3f2d37.ecs.us-east-1.on.aws/auth/brightspace/callback"
    },
    {
      "name": "BRIGHTSPACE_TOKEN_URL",
      "value": "https://auth.brightspace.com/core/connect/token"
    }
  ],
  "environmentFiles": [],
  "mountPoints": [],
  "volumesFrom": [],
  "logConfiguration": {
    "logDriver": "awslogs",
    "options": {
      "awslogs-group": "/aws/ecs/default/gemelo-digital-backend-22de-a4bb",
      "awslogs-region": "us-east-1",
      "awslogs-stream-prefix": "ecs"
    },
    "secretOptions": []
  },
  "systemControls": []
}

# Secretos

**Nunca commitear secretos** (client secrets, SMTP, API keys) en este repo — ni en el
README ni en `.env` (el `.gitignore` ya excluye `.env`).

- Los secretos de produccion viven en **AWS Secrets Manager** y el taskdef de ECS
  los inyecta via el bloque `secrets` (`valueFrom`), no via `environment`:
  `gemelo/brightspace-client-secret`, `gemelo/database-url`,
  `gemelo/session-secret`, `gemelo/lti-state-secret`, `gemelo/elevenlabs-api-key`.
- Si un secret se filtra (p. ej. quedo en el historial de git), **rotarlo** en
  Brightspace (Admin Tools → Manage Extensibility → OAuth 2.0 → la app → generar
  nuevo secret) y actualizar el valor en Secrets Manager:
  `aws secretsmanager put-secret-value --secret-id gemelo/brightspace-client-secret --secret-string '<NUEVO>'`
  y luego `aws ecs update-service --cluster default --service gemelo-digital-api --force-new-deployment`.
- El bloque `environment` del taskdef documentado abajo es de referencia: el
  secret NO va ahi.

# Registro de cambios

## 2026-07-21 (4) — Rendimiento, calidad y base de tests

- **`useMemo`/`useCallback` en los 5 context providers** (Auth, Course, Theme,
  I18n, Toast): el `value` del provider ya no se recrea en cada render, así los
  consumidores no re-renderizan sin necesidad.
- **Caché en memoria de 5 min para GETs estables a Brightspace** (`_bs_get_cached`
  en `app/api/deps.py`): whoami, enrollments, estructura organizativa, semestres
  y checks de membresía. Clave por hash del token (aislamiento por usuario),
  solo cachea respuestas 200, deep-copy en lectura/escritura. Notas, entregas y
  datos vivos siguen sin caché.
- **Bundle partido en vendor chunks** (`vite.config.js`, forma función de
  `manualChunks` requerida por Vite 8/Rolldown): `vendor-react` 232 KB y
  `vendor-recharts` 376 KB se cachean entre deploys; el entry `index` bajó de
  315 KB a 83 KB. `ANALYZE=1 npm run build` genera `dist/stats.html` (treemap).
- **Keys estables en listas** (antes `Math.random()` en TeacherDashboard y
  SmartAlerts): ya no se desmonta/remonta cada fila en cada render.
- **ESLint saneado y más estricto** (`eslint.config.js`): se ignoran las copias
  viejas de builds (`dist*/`) que generaban ~410 falsos errores; nuevas reglas
  `no-var`, `prefer-const`, `eqeqeq` y `caughtErrorsIgnorePattern` para el
  patrón `catch (_e)`. Baseline real: 104 problemas (antes reportaba 517).
- **Migraciones Alembic reconciliadas**: existían TRES `add_sync_control_tables`;
  se eliminaron las dos vacías (87095c55fccf, ef7efb89bf39) y `712ebad8e3d1` se
  re-conectó a `0001_initial_schema`. Cadena lineal verificada con
  `alembic history`. Si una BD quedara marcada en una revisión borrada (muy
  improbable, eran no-ops): `alembic stamp head`.
- **Primera base de tests (75 en total)**: frontend `vitest` (43 tests para
  `utils/helpers.js` y `utils/colors.js` — riesgo, cortes, fórmulas, colores;
  `npm test`) y backend `pytest` (32 tests para sesiones en `app/state.py`,
  auth en `app/api/deps.py` incl. aislamiento de caché por usuario, y roles
  `_require_super_admin`; `pip install -r requirements-dev.txt && pytest`).
  Bonus: los tests destaparon que `safeAvg` contaba `null` como 0 (corregido).

## 2026-07-21 (3) — Mejoras de alto impacto (UX y confiabilidad)

- **Sesiones persistentes entre redeploys** (`app_sessions` en Postgres):
  `app/services/session_store_db.py` + write-through en `app/state.py`. La
  memoria sigue siendo el fast-path; la BD es respaldo best-effort con circuit
  breaker (60s) para que una RDS inalcanzable jamás bloquee el login. Un
  redeploy del backend ya NO desloguea a los usuarios.
- **Announcements y bug reports en Postgres** (tablas `announcements` /
  `bug_reports`, servicio `app/services/content_store.py`): sobreviven a los
  redeploys de ECS. El filesystem del contenedor queda solo como fallback si la
  BD falla. Mismo shape de respuesta — el frontend no cambia.
- **Retry con backoff en el frontend** (`src/utils/api.js`): los GET reintentan
  hasta 2 veces (500ms/1500ms) ante 502/503/504 o fallo de red; nunca ante 4xx
  ni aborts. Nuevo componente reutilizable `LoadError.jsx` con botón
  "Reintentar".
- **Sentry opcional (backend y frontend)**: se activa solo si existe
  `SENTRY_DSN` (backend, `sentry-sdk[fastapi]`) o `VITE_SENTRY_DSN` (frontend,
  `@sentry/react` con import dinámico — no infla el bundle si no hay DSN).
  `ErrorBoundary` reporta crashes de render vía `window.__gemeloSentry`.
  Sin DSN, todo funciona exactamente igual que antes. `send_default_pii=False`.
- **CI/CD diagnosticado**: los workflows de `.github/workflows/` están bien; el
  fallo es el trust policy del rol `GemeloDigitalDeployerRole`, que confía en el
  repo viejo (`JCortes87/proyecto-gemelos-digitales-JC`) en vez de
  `juandavid639/Proyecto-Gemelos-Digitales`. Fix (requiere permisos IAM):
  `aws iam update-assume-role-policy --role-name GemeloDigitalDeployerRole --policy-document file://trust.json`
  con el `sub` = `repo:juandavid639/Proyecto-Gemelos-Digitales:ref:refs/heads/main`.
  **Ojo**: al arreglarlo, cada push a `main` desplegará automáticamente.

## 2026-07-21 (2) — Mejoras críticas de seguridad

- **Secret fuera del repo**: se eliminó el `BRIGHTSPACE_CLIENT_SECRET` en texto
  plano del README (quedó en el historial de git → **debe rotarse** siguiendo la
  sección "Secretos"). Producción ya lo inyecta desde Secrets Manager.
- **Token de sesión fuera de las URLs**: se eliminó el soporte de `?sid=` en
  query string (backend `deps.py`) y el frontend ahora descarga entregas y fotos
  de perfil con `fetch` + header `Authorization` (blob) — `apiDownload()` en
  `api.js`, `EvidenceReports.jsx` y `StudentAvatar.jsx`. El PDF institucional ya
  no incrusta el token en el enlace de descarga.
- **Rate limiting**: `GET /gemelo/admin/known-users` y
  `GET /gemelo/admin/usage/summary` ahora tienen límite 30/min.
- **CORS restringido**: solo `GET/POST/PUT/OPTIONS` y headers
  `Authorization/Content-Type/Accept` (antes `*`).
- **DX local**: `connect_timeout=5` en el engine de SQLAlchemy — si la BD no es
  alcanzable en dev, el startup falla en ~5s en vez de colgarse minutos.

## 2026-07-21

### Resultados de aprendizaje (RA)
- **Desvincular RA de un curso** desde la consola de RA (flujo semestre → cursos → "Ver RA").
  Se agregó la sección "Conjuntos de RA vinculados a este curso" con un botón
  "Desvincular del curso" por conjunto. Solo actúa a nivel del curso; el catálogo
  global de la organización nunca se modifica y el conjunto puede reimportarse.
  - Backend: método `delete_course_outcome_set` en `brightspace_client.py` y
    endpoint `POST /gemelo/outcomes/course/delete-sets` (solo admin).
  - Brightspace **no rutea** `DELETE` de outcome sets a nivel curso (responde
    "No scopes defined for specified requests"); la vía soportada es **vaciar** el
    conjunto con `PUT /d2l/api/le/{v}/{orgUnitId}/lo/outcomeSets/{setId}` y body
    `{"Outcomes": []}` (scope `outcomes:sets:manage`). El backend verifica el
    resultado releyendo el registro del curso.
- **Descargar CSV** de los cursos seleccionados por semestre (ID, Nombre, Código,
  Tipo, Estado RA y # RA). Archivo Excel-friendly (BOM UTF-8).

### Autenticación / roles
- Se detecta el rol de sistema **Administrator (RoleId 116)**, además de Super
  Administrator, consultando la matrícula del usuario en la unidad organizativa
  raíz (`/enrollments/orgUnits/{orgRoot}/users/{uid}` → `RoleId`), con respaldo por
  nombre de rol. Los Administrator ya pueden usar la consola de RA.
- Fix crítico en `app/state.py`: `save_session` ahora **conserva `role` y
  `all_roles`**; antes los descartaba y `_require_super_admin` respondía 403 a los
  Administrator no listados en `SUPERADMIN_IDS`.
- Nota Brightspace: para que un Administrator liste semestres/cursos, su rol
  necesita permiso de **ver/buscar la estructura organizativa por API**
  (Org Unit Editor, solo lectura). Esto se configura en Brightspace (Roles and
  Permissions), no en código.

> Despliegue manual (sin CI): frontend con `npm run build` + `aws s3 sync` +
> invalidación de CloudFront; backend con `docker buildx build --push` a ECR +
> `aws ecs update-service --force-new-deployment`. Cada redeploy del backend
> reinicia las sesiones en memoria: los usuarios deben volver a iniciar sesión.