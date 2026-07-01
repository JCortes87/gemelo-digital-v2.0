// Generador del documento Word maestro de Gemelo Digital CESA
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageBreak, ExternalHyperlink, PageNumber, Footer,
  Header, TableOfContents, Bookmark, InternalHyperlink,
} = require("docx");

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

const border = { style: BorderStyle.SINGLE, size: 4, color: "999999" };
const allBorders = { top: border, bottom: border, left: border, right: border };

function H1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text, bold: true })] });
}
function H2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, bold: true })] });
}
function H3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text, bold: true })] });
}
function H4(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_4, children: [new TextRun({ text, bold: true })] });
}
function P(text, opts = {}) {
  return new Paragraph({ children: [new TextRun({ text, ...opts })], spacing: { after: 120 } });
}
function PB(runs) {
  return new Paragraph({ children: runs, spacing: { after: 120 } });
}
function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    children: [new TextRun({ text })],
  });
}
function bulletRich(runs, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    children: runs,
  });
}
function code(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: "Consolas", size: 18 })],
    shading: { fill: "F4F4F4", type: ShadingType.CLEAR },
    spacing: { after: 120 },
  });
}
function codeBlock(text) {
  return text.split("\n").map(line =>
    new Paragraph({
      children: [new TextRun({ text: line || " ", font: "Consolas", size: 18 })],
      shading: { fill: "F4F4F4", type: ShadingType.CLEAR },
    })
  );
}
function divider() {
  return new Paragraph({
    border: { bottom: { color: "999999", space: 1, style: BorderStyle.SINGLE, size: 6 } },
    spacing: { after: 200, before: 200 },
  });
}

function cellText(text, bold = false, fill = null) {
  return new TableCell({
    borders: allBorders,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    ...(fill ? { shading: { fill, type: ShadingType.CLEAR } } : {}),
    children: [new Paragraph({ children: [new TextRun({ text, bold })] })],
  });
}

function table2col(rows, header = ["Campo", "Valor"], widths = [3000, 6360]) {
  const headerRow = new TableRow({
    children: header.map(h => new TableCell({
      borders: allBorders,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      shading: { fill: "D5E8F0", type: ShadingType.CLEAR },
      width: { size: 0, type: WidthType.AUTO },
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
    })),
  });

  const dataRows = rows.map(([col1, col2]) => new TableRow({
    children: [
      new TableCell({
        borders: allBorders,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        width: { size: widths[0], type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun({ text: col1, bold: true })] })],
      }),
      new TableCell({
        borders: allBorders,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        width: { size: widths[1], type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun({ text: col2 })] })],
      }),
    ],
  }));

  return new Table({
    width: { size: widths[0] + widths[1], type: WidthType.DXA },
    columnWidths: widths,
    rows: [headerRow, ...dataRows],
  });
}

function table3col(rows, header = ["Col1", "Col2", "Col3"], widths = [2500, 2500, 4360]) {
  const headerRow = new TableRow({
    children: header.map(h => new TableCell({
      borders: allBorders,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      shading: { fill: "D5E8F0", type: ShadingType.CLEAR },
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
    })),
  });

  const dataRows = rows.map((row) => new TableRow({
    children: row.map((cell, i) => new TableCell({
      borders: allBorders,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      width: { size: widths[i], type: WidthType.DXA },
      children: [new Paragraph({ children: [new TextRun({ text: cell, bold: i === 0 })] })],
    })),
  }));

  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: [headerRow, ...dataRows],
  });
}

// ─────────────────────────────────────────────────────────
// Construir el documento
// ─────────────────────────────────────────────────────────

const children = [];

// ── PORTADA ──
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 2000, after: 200 },
  children: [new TextRun({ text: "GEMELO DIGITAL CESA", bold: true, size: 56 })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 200 },
  children: [new TextRun({ text: "Documentación maestra del proyecto", size: 32 })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 200 },
  children: [new TextRun({ text: "Estado consolidado a junio de 2026", italics: true, size: 24 })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 800, after: 200 },
  children: [new TextRun({ text: "Colegio de Estudios Superiores de Administración", size: 24 })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 200 },
  children: [new TextRun({ text: "Herramienta de analítica de aprendizaje", italics: true, size: 22 })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 1200, after: 200 },
  children: [new TextRun({ text: "Documento técnico para operación, mantenimiento y transferencia", size: 20 })],
}));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ── TABLA DE CONTENIDOS ──
children.push(H1("Tabla de contenidos"));
children.push(P("Para navegar haga click en cualquier sección. En Word puede actualizar la tabla con F9.", { italics: true }));
children.push(new TableOfContents("Contenido", { hyperlink: true, headingStyleRange: "1-3" }));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 1. INTRODUCCIÓN ──
children.push(H1("1. Introducción y propósito"));
children.push(P("Este documento es la referencia consolidada del proyecto Gemelo Digital CESA. Su objetivo es que cualquier persona técnica que herede el proyecto pueda continuarlo sin pedir contexto a nadie."));
children.push(P("Cubre absolutamente todo:"));
children.push(bullet("Qué hace el sistema y para qué sirve."));
children.push(bullet("Cómo está construido (stack, arquitectura, decisiones técnicas)."));
children.push(bullet("Qué infraestructura usa en AWS."));
children.push(bullet("Cómo se despliega (CI/CD automático)."));
children.push(bullet("Cómo operarlo día a día (logs, sync, monitoreo)."));
children.push(bullet("Cómo recuperarse ante problemas (rollback, snapshots)."));
children.push(bullet("Quién es quién y cómo coordinarse con CESA y el colaborador."));

children.push(H2("1.1 Última actualización del proyecto"));
children.push(P("Junio de 2026. Última sesión de trabajo importante: integración de la arquitectura completa del colaborador (Juan David) con todas las features modernas (vista de estudiante, calendario, predicciones, alertas inteligentes, etc.) más nuestros aportes propios (refresh-token, fix de estudiantes fantasma, CI/CD vía GitHub Actions OIDC)."));

children.push(H2("1.2 Estado actual"));
children.push(P("En producción HOY (después del deploy de junio):"));
children.push(bullet("Backend: versión integrada con todas las features de JD + nuestros aportes."));
children.push(bullet("Frontend: arquitectura nueva con React Router, Context API, calendarios, alertas inteligentes, predicciones."));
children.push(bullet("Base de datos: PostgreSQL con migraciones automáticas vía start.sh."));
children.push(bullet("CI/CD: GitHub Actions OIDC desplegando backend y frontend automáticamente al mergear a main."));
children.push(bullet("Pendiente: reactivar voz TTS ElevenLabs en el chat del asistente (infraestructura intacta, falta cablear en la nueva arquitectura)."));

children.push(H2("1.3 Dónde pararse para trabajar — LEER ANTES DE TOCAR NADA"));

// Big visual warning box
children.push(new Paragraph({
  shading: { fill: "FFE4B5", type: ShadingType.CLEAR },
  border: { top: { color: "FF8C00", space: 1, style: BorderStyle.SINGLE, size: 12 },
            bottom: { color: "FF8C00", space: 1, style: BorderStyle.SINGLE, size: 12 },
            left: { color: "FF8C00", space: 1, style: BorderStyle.SINGLE, size: 12 },
            right: { color: "FF8C00", space: 1, style: BorderStyle.SINGLE, size: 12 } },
  spacing: { before: 200, after: 200 },
  children: [new TextRun({
    text: "Lee esta sección completa antes de hacer cualquier cambio al proyecto. Aclara dónde debes estar parado físicamente en tu PC y en GitHub para no romper nada del trabajo del colaborador.",
    bold: true,
    size: 22,
    color: "8B0000",
  })],
}));

children.push(H3("Carpeta de trabajo en tu PC (la única que importa)"));
children.push(P("Hoy estamos trabajando exclusivamente en esta carpeta:"));
children.push(...codeBlock(`C:\\Users\\jose.cortesh\\OneDrive - Colegio de Estudios Superiores de Administracion\\Escritorio\\Gemelo digital\\GEMELO-DIGITAL-V2`));
children.push(P("Características de esta carpeta:"));
children.push(bullet("Es la única carpeta activa del proyecto. Cualquier cambio que hagas debe ocurrir aquí."));
children.push(bullet("Está clonada desde tu repo de GitHub (JCortes87/proyecto-gemelos-digitales-JC)."));
children.push(bullet("Vive dentro de OneDrive, así que se sincroniza automáticamente como respaldo personal."));
children.push(bullet("Si alguna vez accidentalmente trabajas en otra carpeta, los cambios NO van a producción aunque uses los mismos comandos git."));

children.push(P("Para abrir esta carpeta rápido:"));
children.push(bullet("Explorador de Windows: copia la ruta de arriba y pégala en la barra de direcciones."));
children.push(bullet("Terminal PowerShell: cd \"C:\\Users\\jose.cortesh\\...\\GEMELO-DIGITAL-V2\" (usa Tab para autocompletar)."));
children.push(bullet("VS Code: File → Open Folder y navegar hasta GEMELO-DIGITAL-V2."));

children.push(H3("Carpetas anteriores que NO debes usar"));
children.push(P("Estas carpetas existen en tu PC pero están obsoletas. NO toques nada en ellas:"));
children.push(table2col([
  ["GEMELO-DIGITAL (sin V2)", "Versión vieja del proyecto. Ya no se usa. NO trabajar aquí."],
  ["repo-juan-reciente", "Carpeta de trabajo histórica. NO trabajar aquí."],
  ["repo-juan", "Carpeta de trabajo histórica. NO trabajar aquí."],
  ["backup-backend", "Backup de respaldo histórico. NO trabajar aquí."],
  ["gemelo definitivo", "Carpeta vieja. NO trabajar aquí."],
]));
children.push(P("Aunque estas carpetas tengan archivos del proyecto, cambios hechos en ellas NO llegan a producción y pueden generar confusión. Solo GEMELO-DIGITAL-V2 importa."));

children.push(H3("Repositorio de GitHub donde estamos parados"));
children.push(P("El repositorio activo es:"));
children.push(table2col([
  ["URL completa", "https://github.com/JCortes87/proyecto-gemelos-digitales-JC"],
  ["Dueño", "JCortes87 (tu cuenta personal de GitHub)"],
  ["Branch principal (production)", "main"],
  ["Branch de trabajo", "Puedes crear branches nuevos derivados de main"],
  ["Recibe pushes desde tu PC?", "SÍ — este es el repo \"origin\" en tu config git"],
  ["Tiene CI/CD activo?", "SÍ — cada push a main dispara deploy automático"],
]));

children.push(H3("Repositorio que NUNCA debes tocar"));

// Big red warning box
children.push(new Paragraph({
  shading: { fill: "FFCCCC", type: ShadingType.CLEAR },
  border: { top: { color: "8B0000", space: 1, style: BorderStyle.SINGLE, size: 16 },
            bottom: { color: "8B0000", space: 1, style: BorderStyle.SINGLE, size: 16 },
            left: { color: "8B0000", space: 1, style: BorderStyle.SINGLE, size: 16 },
            right: { color: "8B0000", space: 1, style: BorderStyle.SINGLE, size: 16 } },
  spacing: { before: 200, after: 200 },
  children: [new TextRun({
    text: "ATENCIÓN: NO empujar código al repo de Juan David bajo ninguna circunstancia.",
    bold: true,
    size: 24,
    color: "8B0000",
  })],
}));

children.push(table2col([
  ["URL", "https://github.com/juandavid639/Proyecto-Gemelos-Digitales"],
  ["Dueño", "Juan David (NO tú)"],
  ["¿Por qué no tocarlo?", "Es el repo personal del colaborador. Pushear ahí contamina su rama main con código que él no aprobó."],
  ["¿Cómo está bloqueado?", "El push a colaborador está configurado con URL inválida (DISABLED-no-push-to-upstream). Cualquier intento de push falla automáticamente antes de llegar a GitHub."],
  ["¿Es seguro hacer git fetch desde aquí?", "SÍ. El fetch solo descarga datos a tu PC, no modifica el repo de él. Útil para ver sus avances."],
]));

children.push(H3("Resumen visual — antes de tocar nada, verifica"));
children.push(P("Tres verificaciones rápidas para confirmar que estás en el lugar correcto:"));
children.push(table3col([
  ["1. Estoy en GEMELO-DIGITAL-V2", "Mira la barra de ruta de tu explorador o terminal. Debe terminar en \"GEMELO-DIGITAL-V2\".", "Si no, navegar ahí antes de continuar."],
  ["2. git remote -v muestra origin → JCortes87", "Abre terminal en la carpeta y corre el comando. La línea origin debe apuntar a github.com/JCortes87/proyecto-gemelos-digitales-JC.", "Si apunta a otro repo, estás en la carpeta equivocada."],
  ["3. colaborador tiene push DISABLED", "El mismo comando git remote -v debe mostrar colaborador (push) DISABLED-no-push-to-upstream.", "Si está habilitado, configurarlo de nuevo para protección."],
], ["Verificación", "Cómo confirmar", "Si algo falla"], [2200, 4060, 3100]));

children.push(H3("Si por accidente terminas tocando algo del repo de JD"));
children.push(P("Aunque está bloqueado, si por algún motivo un push se llegara a ejecutar contra el repo de JD:"));
children.push(bullet("Probablemente fallaría por permisos insuficientes en GitHub (no tienes acceso de escritura)."));
children.push(bullet("Si llegara a pasar (escenario improbable), notificar a Juan David inmediatamente para revertir."));
children.push(bullet("El daño es reversible vía git revert en su lado, pero contaminar su historial es un error grave."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 2. QUÉ ES GEMELO DIGITAL ──
children.push(H1("2. ¿Qué es Gemelo Digital?"));
children.push(P("Herramienta de analítica de aprendizaje para CESA. Se integra con Brightspace (el LMS de CESA) y muestra a docentes, coordinadores y estudiantes información agregada y predictiva sobre el desempeño de cada curso."));
children.push(P("El nombre \"Gemelo Digital\" alude a la idea de crear una representación virtual del progreso académico de cada estudiante — su \"gemelo digital\" — para que el docente pueda actuar a tiempo sobre quienes están en riesgo."));

children.push(H2("2.1 Funcionalidades por perfil de usuario"));

children.push(H3("Vista de docente"));
children.push(bullet("Dashboard del curso con KPIs agregados: promedio de notas, cobertura de evaluación, distribución de riesgo, alertas."));
children.push(bullet("Estudiantes prioritarios — quiénes necesitan intervención y por qué."));
children.push(bullet("SmartAlerts — alertas inteligentes (cobertura baja, desempeño bajo, concentración de riesgo)."));
children.push(bullet("GradePredictions — predicción de notas finales por estudiante."));
children.push(bullet("DueDateCalendar — calendario con todas las fechas de entrega."));
children.push(bullet("EvidenceReports — reporte detallado de evidencias por estudiante."));
children.push(bullet("AINarrativeSummary — resumen narrativo del curso generado por IA."));
children.push(bullet("CoursesComparison — comparación entre cursos del mismo docente."));
children.push(bullet("CourseTrends — tendencias del curso a lo largo del semestre (persistidas en DB, históricas)."));
children.push(bullet("Descarga de evidencias y feedback del docente."));

children.push(H3("Vista de estudiante"));
children.push(bullet("Portal personal con todos sus cursos."));
children.push(bullet("Mis cursos y su rendimiento individual."));
children.push(bullet("Cortes y evidencias vencidas."));
children.push(bullet("Calendario personal con fechas de entrega."));
children.push(bullet("Proyección explicada — predicción de nota final con explicación."));

children.push(H3("Vista de coordinador"));
children.push(bullet("Vista superior de todos los cursos bajo su responsabilidad."));
children.push(bullet("Filtros por semestre y año académico."));

children.push(H3("Vista de superadmin"));
children.push(bullet("Búsqueda por ID de cualquier curso o usuario."));
children.push(bullet("Modo impersonar — ver el sistema desde la perspectiva de otro usuario para diagnóstico/soporte."));

children.push(H2("2.2 Cómo se accede"));
children.push(bullet("Embebido en Brightspace vía LTI 1.3: el docente entra desde un link dentro de su curso. Brightspace pasa la información del usuario vía un JWT y nuestro backend crea la sesión automáticamente."));
children.push(bullet("Standalone web: navegando a https://gemelo.cesa.edu.co y logueándose con su cuenta CESA (Microsoft SSO vía Brightspace OAuth)."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 3. ARQUITECTURA ──
children.push(H1("3. Arquitectura general"));
children.push(P("El sistema tiene 4 \"cajoncitos\" principales que se hablan entre sí. Cada uno vive en un servicio AWS diferente."));

children.push(H2("3.1 Componentes"));
children.push(table2col([
  ["Frontend SPA", "React 19 + Vite, servido por CloudFront desde S3"],
  ["Backend API", "FastAPI Python 3.11, corriendo en ECS Fargate"],
  ["Base de datos", "PostgreSQL en RDS (gemelo-digital-db)"],
  ["LMS externo", "Brightspace (cesa.brightspace.com)"],
], ["Componente", "Tecnología y ubicación"]));

children.push(H2("3.2 Flujo entre componentes"));
children.push(P("Cuando un usuario abre la herramienta:"));
children.push(bullet("Su navegador pide los archivos estáticos (HTML/JS/CSS) a CloudFront, que los entrega desde S3."));
children.push(bullet("El SPA carga en su navegador y muestra la pantalla de login."));
children.push(bullet("El usuario inicia sesión — el SPA llama al backend API en ECS para autenticar contra Brightspace."));
children.push(bullet("El backend valida con Brightspace, crea sesión, devuelve cookie."));
children.push(bullet("El SPA pide datos del dashboard al backend."));
children.push(bullet("El backend primero busca en PostgreSQL (rápido, ~50ms). Si los datos están viejos, consulta Brightspace en vivo (~1-3s) y actualiza la DB en background."));
children.push(bullet("El SPA renderiza la información."));

children.push(H2("3.3 Diagrama ASCII de la arquitectura"));
children.push(...codeBlock(`
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
    │          S3 Bucket: gemelo-frontend-prod        │
    │          (archivos estáticos del SPA React)     │
    └─────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────┐
    │     https://ge-9d9d...ecs.us-east-1.on.aws      │
    │              ECS Fargate Service                │
    │            Cluster: default                     │
    │            Service: gemelo-digital-api          │
    │     Container: gemelo-backend:latest (ECR)      │
    │            Backend FastAPI (Python 3.11)        │
    └────────────────────┬────────────────────────────┘
                         │
                         ├─────► Brightspace API
                         │       (LMS de CESA)
                         ▼
    ┌─────────────────────────────────────────────────┐
    │           RDS PostgreSQL                        │
    │           Instance: gemelo-digital-db           │
    │           Engine: PostgreSQL 16, db.t4g.micro   │
    └─────────────────────────────────────────────────┘
`));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 4. STACK TECNOLÓGICO ──
children.push(H1("4. Stack tecnológico"));

children.push(H2("4.1 Backend"));
children.push(table2col([
  ["Lenguaje", "Python 3.11"],
  ["Framework web", "FastAPI 0.115"],
  ["Servidor ASGI", "Uvicorn 0.30"],
  ["ORM", "SQLAlchemy 2.0"],
  ["Migraciones DB", "Alembic 1.14"],
  ["Driver PostgreSQL", "psycopg 3.2 (psycopg3)"],
  ["HTTP client (Brightspace API)", "httpx 0.27"],
  ["Autenticación JWT", "python-jose"],
  ["Criptografía LTI", "cryptography"],
  ["TTS opcional", "ElevenLabs API"],
  ["Contenedor", "Docker (Python 3.11-slim base)"],
]));

children.push(H2("4.2 Frontend"));
children.push(table2col([
  ["Framework", "React 19"],
  ["Bundler", "Vite 8"],
  ["Routing", "React Router"],
  ["Estado global", "Context API (Auth, Course, I18n, Theme, Toast)"],
  ["Charts", "Recharts 3.7"],
  ["Estilos", "CSS Modules"],
  ["Lenguaje", "JavaScript (ES2022+) + algunos archivos TypeScript"],
]));

children.push(H2("4.3 Infraestructura"));
children.push(table2col([
  ["Cloud provider", "AWS"],
  ["Región principal", "us-east-1 (North Virginia)"],
  ["ID de cuenta AWS", "718624265053"],
  ["Compute backend", "ECS Fargate (modo Exprés)"],
  ["Registry imágenes", "ECR (Elastic Container Registry)"],
  ["Hosting frontend", "S3 + CloudFront"],
  ["Base de datos", "RDS PostgreSQL"],
  ["Identidad", "IAM con OIDC para GitHub Actions"],
  ["CI/CD", "GitHub Actions"],
]));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 5. REPOSITORIOS ──
children.push(H1("5. Repositorios del proyecto"));
children.push(P("Esta sección es CRÍTICA. Entender qué repo recibe pushes y cuál no, es la diferencia entre operar bien el proyecto o tumbar el trabajo del colaborador. Léala con cuidado."));

children.push(P("Existen 3 repositorios relevantes en GitHub. Cada uno tiene un propósito distinto. Solo UNO recibe pushes desde este setup."));

children.push(H2("5.1 Repositorio principal (production) — JCortes87"));

children.push(P("Este es el repo que vive el código que se despliega a producción. Cualquier push a la rama main de este repo dispara los workflows de GitHub Actions y deploya automáticamente."));

children.push(table2col([
  ["URL completa", "https://github.com/JCortes87/proyecto-gemelos-digitales-JC"],
  ["URL corta para clonar", "git@github.com:JCortes87/proyecto-gemelos-digitales-JC.git"],
  ["Dueño actual", "JCortes87 (cuenta personal de GitHub)"],
  ["Visibilidad", "Privado (solo invitados ven el código)"],
  ["Branch productiva", "main — cualquier merge a esta branch DISPARA DEPLOY"],
  ["Branch de trabajo histórica", "sync/upstream-abril-2026 — usada históricamente para integrar cambios"],
  ["Branches de backup", "backup/pre-merge-jd-junio-10 (estado anterior al merge con JD)"],
  ["Recibe pushes?", "SÍ — este es el único repo donde pusheamos"],
  ["CI/CD activo?", "SÍ — workflows en .github/workflows/"],
]));

children.push(H3("Estructura interna del repo"));
children.push(P("Carpetas principales:"));
children.push(bullet("gemelo-digital-backend/ — código Python del backend (FastAPI)"));
children.push(bullet("gemelo-digital-frontend/gemelo-frontend/ — código React del frontend"));
children.push(bullet(".github/workflows/ — workflows de GitHub Actions (CI/CD)"));
children.push(bullet("docs/ — documentación del proyecto (incluye este documento)"));
children.push(bullet("frontend_dist/ — build pre-compilado del frontend (legacy, mantenido por JD)"));

children.push(H3("Cómo está configurado el git localmente"));
children.push(P("En la carpeta local GEMELO-DIGITAL-V2/, git tiene 2 remotes configurados:"));
children.push(...codeBlock(`origin       https://github.com/JCortes87/proyecto-gemelos-digitales-JC.git (fetch)
origin       https://github.com/JCortes87/proyecto-gemelos-digitales-JC.git (push)
colaborador  https://github.com/juandavid639/Proyecto-Gemelos-Digitales.git (fetch)
colaborador  DISABLED-no-push-to-upstream (push)`));
children.push(P("Lectura de esto:"));
children.push(bullet("origin apunta a TU repo. Puedes hacer fetch (descargar) y push (subir) sin restricción."));
children.push(bullet("colaborador apunta al repo de JD. PUEDES hacer fetch para ver sus cambios, pero el push está literalmente bloqueado con la URL inválida \"DISABLED-no-push-to-upstream\"."));
children.push(bullet("Cualquier intento de \"git push colaborador <cualquier-cosa>\" falla con error de URL. Imposible empujar por accidente."));

children.push(H2("5.2 Repositorio del colaborador (NO TOCAR)"));

// Warning visual
children.push(new Paragraph({
  shading: { fill: "FFE4B5", type: ShadingType.CLEAR },
  border: { top: { color: "FF8C00", space: 1, style: BorderStyle.SINGLE, size: 12 },
            bottom: { color: "FF8C00", space: 1, style: BorderStyle.SINGLE, size: 12 },
            left: { color: "FF8C00", space: 1, style: BorderStyle.SINGLE, size: 12 },
            right: { color: "FF8C00", space: 1, style: BorderStyle.SINGLE, size: 12 } },
  spacing: { before: 200, after: 200 },
  children: [new TextRun({
    text: "ATENCIÓN: NUNCA empujar código a este repo. Es propiedad de Juan David y solo se usa como referencia para ver su versión histórica.",
    bold: true,
    size: 24,
    color: "8B0000",
  })],
}));

children.push(table2col([
  ["URL", "https://github.com/juandavid639/Proyecto-Gemelos-Digitales"],
  ["Dueño", "Juan David"],
  ["Uso permitido", "SOLO LECTURA. Hacer git fetch para ver sus avances."],
  ["Uso NO permitido", "git push (bloqueado). git push --force (bloqueado). Cualquier operación de escritura."],
  ["Cómo está bloqueado", "git remote set-url --push colaborador DISABLED-no-push-to-upstream"],
  ["Qué pasa si intentas pushear", "Git falla con error de URL antes de contactar a GitHub. NO llega al servidor."],
]));

children.push(H3("Por qué este repo está bloqueado"));
children.push(P("Razones:"));
children.push(bullet("Juan David es el colaborador original. Es SU código personal."));
children.push(bullet("Si empujáramos por accidente, contaminaríamos su rama main con código que él no aprobó."));
children.push(bullet("Aunque GitHub probablemente nos rechazara por permisos insuficientes, el bloqueo local es una protección extra."));
children.push(bullet("Sigue el principio de \"fail safe\": prevenir el error antes de que ocurra."));

children.push(H3("Cuándo SÍ puedes hacer git fetch colaborador"));
children.push(P("El fetch desde colaborador es seguro y útil cuando:"));
children.push(bullet("Quieres ver si JD ha publicado cambios nuevos."));
children.push(bullet("Quieres comparar su versión vs la tuya."));
children.push(bullet("Quieres traer alguno de sus avances a tu repo (vía git merge colaborador/main)."));
children.push(P("El fetch solo descarga datos a tu máquina, no modifica nada del lado de JD."));

children.push(H2("5.3 Repositorio fork inicial (archivado, sin uso)"));
children.push(P("Repositorio antiguo que se usó como punto de partida. Está archivado y no debe usarse para nada activo. Se mantiene como referencia histórica únicamente."));
children.push(table2col([
  ["URL", "https://github.com/JCortes87/gemelo-digital-backend-JC"],
  ["Estado", "Archivado. Sin uso activo."],
  ["Branch histórica con valor", "integracion/manual-controlada (contiene el WIP previo)"],
  ["Riesgo de usarlo", "Está desincronizado con el flujo actual. No vale la pena tocarlo."],
]));

children.push(H2("5.4 Resumen visual: qué hacer y qué NO hacer con cada repo"));
children.push(table3col([
  ["JCortes87/proyecto-gemelos-digitales-JC", "SÍ", "Hacer push, merge, deploy, todo. Este es TU repo principal."],
  ["juandavid639/Proyecto-Gemelos-Digitales", "NO", "NUNCA pushear. Solo git fetch para ver sus cambios."],
  ["JCortes87/gemelo-digital-backend-JC", "OBSOLETO", "Ignorar. No hacer nada con él."],
], ["Repositorio", "¿Tocarlo?", "Detalle"], [3500, 1200, 4660]));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 6. URLs DE PRODUCCIÓN ──
children.push(H1("6. URLs de producción y endpoints"));

children.push(H2("6.1 URL principal (usuarios finales)"));
children.push(PB([new TextRun({ text: "Frontend SPA: ", bold: true }), new TextRun({ text: "https://gemelo.cesa.edu.co" })]));
children.push(P("Servido por CloudFront, distribución E32WDBCT7SFCRD. El dominio gemelo.cesa.edu.co apunta vía CNAME a la distribución."));

children.push(H2("6.2 URL del backend API"));
children.push(P("URL directa de ECS Fargate:"));
children.push(code("https://ge-9d9d0220a8704eeabada1b951f3f2d37.ecs.us-east-1.on.aws"));
children.push(P("El frontend la consume vía la variable VITE_API_BASE_URL definida en .env.production."));

children.push(H2("6.3 Endpoints clave del backend"));
children.push(table3col([
  ["GET /health", "Público", "Health check. Esperado: {\"status\":\"ok\"}"],
  ["GET /debug/db", "Público", "Ping a PostgreSQL. Esperado: {\"db_ok\":true}"],
  ["GET /auth/brightspace/login", "Público", "Inicia el OAuth flow con Brightspace"],
  ["GET /auth/brightspace/callback", "Brightspace", "Callback OAuth, recibe code, genera sesión"],
  ["GET /auth/me", "Sesión", "Devuelve info del usuario logueado"],
  ["POST /auth/logout", "Sesión", "Cierra sesión"],
  ["GET /gemelo/course/{ou}/overview", "Sesión", "Overview agregado del curso (DB-first con fallback Brightspace)"],
  ["GET /gemelo/course/{ou}/student/{userId}", "Sesión", "Gemelo digital de un estudiante"],
  ["GET /gemelo/course/{ou}/students", "Sesión", "Lista de estudiantes del curso"],
  ["GET /gemelo/course/{ou}/ra/dashboard", "Sesión", "Dashboard de Resultados de Aprendizaje"],
  ["GET /debug/course/{ou}/overview-db", "Público", "Overview desde DB sin auth"],
  ["POST /admin/sync-cron-all", "Header secret", "Sincroniza todos los cursos. Para scheduler."],
  ["GET /admin/show-refresh-token", "Sesión", "TEMPORAL: captura refresh_token. Eliminar tras usar."],
  ["POST /speech/tts", "Sesión", "Texto a voz vía ElevenLabs"],
  ["POST /speech/stt", "Sesión", "Voz a texto vía ElevenLabs"],
  ["GET /.well-known/jwks.json", "Público", "JWKS público para LTI 1.3"],
  ["POST /lti/login", "Brightspace", "OIDC login initiation LTI 1.3"],
  ["POST /lti/launch", "Brightspace", "LTI launch endpoint"],
], ["Endpoint", "Autenticación", "Descripción"], [3000, 1800, 4560]));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 7. INFRAESTRUCTURA AWS DETALLADA ──
children.push(H1("7. Infraestructura AWS — detalle completo"));
children.push(P("Toda la infraestructura está en us-east-1 (Virginia) en la cuenta AWS 718624265053."));

children.push(H2("7.1 ECS (Elastic Container Service)"));
children.push(P("Donde corre el backend del proyecto en un container Docker."));
children.push(table2col([
  ["Cluster", "default"],
  ["Service", "gemelo-digital-api (modo Exprés)"],
  ["Task Definition", "default-gemelo-digital-api:73 (o revisión más reciente)"],
  ["CPU", "1 vCPU (1024 unidades)"],
  ["Memoria", "2 GiB (2048 MiB)"],
  ["Health check path", "/health"],
  ["Puerto", "8000"],
  ["Tareas activas", "1"],
  ["Rol de ejecución", "ecsTaskExecutionRole"],
  ["Rol de infraestructura", "ecsInfrastructureRoleForExpressServices"],
]));

children.push(H2("7.2 ECR (Elastic Container Registry)"));
children.push(P("Donde se guardan las imágenes Docker del backend."));
children.push(table2col([
  ["Repositorio", "gemelo-backend"],
  ["URI", "718624265053.dkr.ecr.us-east-1.amazonaws.com/gemelo-backend"],
  ["Tag 'latest'", "Imagen más reciente desplegada (siempre actualizada por CI/CD)"],
  ["Tag <sha>", "Una etiqueta por cada commit, para trazabilidad y rollback"],
]));
children.push(P("Otros repos que existen en ECR pero NO se usan en este proyecto:"));
children.push(bullet("cesa-backend — otro proyecto CESA."));
children.push(bullet("gemelo-digital/gemelo-digital-backend — repo histórico, abandonado."));

children.push(H2("7.3 RDS (PostgreSQL)"));
children.push(P("Base de datos principal del proyecto."));
children.push(table2col([
  ["Identifier", "gemelo-digital-db"],
  ["Engine", "PostgreSQL 16"],
  ["Clase de instancia", "db.t4g.micro"],
  ["Endpoint", "gemelo-digital-db.crp1lzwejl3x.us-east-1.rds.amazonaws.com"],
  ["Puerto", "5432"],
  ["Nombre de la base", "gemelo_digital"],
  ["Usuario administrador", "gemelo_admin"],
  ["Password", "En el taskdef de ECS, dentro de DATABASE_URL"],
  ["Backups automáticos", "Configurados por AWS (retención por defecto)"],
  ["Snapshots manuales", "Tomar antes de cada deploy de riesgo"],
]));

children.push(H2("7.4 S3 (Frontend)"));
children.push(table2col([
  ["Bucket", "gemelo-frontend-prod"],
  ["Versioning", "Activo (permite rollback por archivo)"],
  ["Política de acceso", "Privado, entregado vía CloudFront con OAC"],
]));

children.push(H2("7.5 CloudFront (CDN)"));
children.push(table2col([
  ["Distribution ID", "E32WDBCT7SFCRD"],
  ["Dominio asociado", "gemelo.cesa.edu.co"],
  ["Origen", "S3 bucket gemelo-frontend-prod"],
  ["Cache", "Invalidation /* después de cada deploy frontend"],
]));

children.push(H2("7.6 IAM (Identidad y permisos)"));
children.push(P("Rol que GitHub Actions asume para hacer los deploys:"));
children.push(table2col([
  ["Nombre del rol", "GemeloDigitalDeployerRole"],
  ["ARN", "arn:aws:iam::718624265053:role/GemeloDigitalDeployerRole"],
  ["Policy asociada", "GemeloDigitalDeployerPolicy"],
  ["Permisos", "ECR push/pull + ECS update + S3 sync + CloudFront invalidate"],
  ["Trust", "Solo workflows del repo JCortes87/proyecto-gemelos-digitales-JC vía OIDC"],
]));
children.push(P("OIDC Provider:"));
children.push(code("arn:aws:iam::718624265053:oidc-provider/token.actions.githubusercontent.com"));

children.push(H2("7.7 CloudWatch Logs"));
children.push(P("Donde se ven los logs del backend en producción:"));
children.push(code("/aws/ecs/default/gemelo-digital-api-cbc4"));
children.push(P("Aquí se ven los logs de uvicorn: arranque, requests, errores, logs propios del backend."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 8. BASE DE DATOS ──
children.push(H1("8. Base de datos — esquema y migraciones"));

children.push(H2("8.1 Tablas principales"));
children.push(P("Definidas en app/db/models.py:"));
children.push(table3col([
  ["courses", "Catálogo", "Cursos sincronizados desde Brightspace"],
  ["students", "Catálogo", "Catálogo de estudiantes"],
  ["enrollments", "Relación", "Inscripciones estudiante × curso, con is_active"],
  ["grade_items", "Catálogo", "Items de calificación del gradebook"],
  ["dropbox_folders", "Catálogo", "Carpetas de entrega de Brightspace"],
  ["outcome_sets", "Catálogo", "Sets de resultados de aprendizaje"],
  ["student_course_metric_snapshots", "Métrica", "Snapshot diario de métricas por estudiante"],
  ["course_metric_history", "Métrica", "Histórico diario de métricas agregadas del curso (para trends)"],
  ["sync_runs", "Operación", "Bitácora de ejecuciones de sync"],
  ["sync_state", "Operación", "Estado del último sync por curso"],
  ["sync_errors", "Operación", "Errores de sync para diagnóstico"],
], ["Tabla", "Tipo", "Para qué"]));

children.push(H2("8.2 Cadena de migraciones Alembic"));
children.push(P("Orden actual de aplicación:"));
children.push(...codeBlock(`0001_initial_schema
  → 87095c55fccf  (add_sync_control_tables — placeholder)
  → ef7efb89bf39  (add_sync_control_tables — placeholder)
  → 712ebad8e3d1  (add_sync_control_tables — placeholder)
  → b6f1918135ed  (add_student_metric_snapshots — placeholder)
  → a1b2c3d4e5f6  (add_date_fields_to_grade_items_dropbox)
  → c3d4e5f6a7b8  (add_course_metric_history)   ← HEAD actual`));

children.push(H2("8.3 Aplicación automática de migraciones"));
children.push(P("Las migraciones se aplican automáticamente al arrancar el container, gracias al script start.sh:"));
children.push(...codeBlock(`#!/bin/bash
set -e
if [ -n "$DATABASE_URL" ]; then
  echo "[startup] Running database migrations..."
  alembic upgrade head
  echo "[startup] Migrations complete."
else
  echo "[startup] DATABASE_URL not set — skipping migrations."
fi
exec uvicorn main:app --host 0.0.0.0 --port 8000`));
children.push(P("Esto significa que cada deploy verifica las migraciones y aplica las nuevas. No hay que ejecutarlas manualmente."));
children.push(P("Si una migración falla, set -e hace que el container no arranque. ECS detecta el fallo y mantiene los containers viejos corriendo. Así, una migración mal hecha NO tumba producción — pero hay que arreglarla rápido o desplegar la versión anterior."));

children.push(H2("8.4 Acceso directo a la base de datos"));
children.push(P("Para consultas SQL ad-hoc:"));
children.push(bullet("AWS Console → RDS → Bases de datos → gemelo-digital-db → \"Editor de consultas\"."));
children.push(bullet("Conexión psql con la cadena DATABASE_URL (que vive en el taskdef de ECS)."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 9. CI/CD ──
children.push(H1("9. CI/CD — Despliegue automático desde main"));
children.push(P("Esta sección explica el flujo completo de cómo un cambio en tu computadora termina sirviéndose a los usuarios en producción. Es el corazón operacional del proyecto."));

children.push(H2("9.1 Visión general — el flujo completo en 10 pasos"));
children.push(P("Cuando haces un cambio y lo quieres en producción, esto es lo que pasa:"));
children.push(...codeBlock(`1.  Editas código en tu PC (ej. arreglas un bug en backend)
              ▼
2.  git add + git commit + git push origin <tu-rama>
              ▼
3.  Abres Pull Request en GitHub: <tu-rama> → main
              ▼
4.  Revisas los cambios en la pestaña "Files changed" del PR
              ▼
5.  Mergeas el PR con el botón verde "Merge pull request"
              ▼
6.  GitHub detecta el merge a main y dispara los workflows
    en .github/workflows/deploy-backend.yml y deploy-frontend.yml
              ▼
7.  GitHub Actions levanta máquinas virtuales temporales
              ▼
8.  Las máquinas usan OIDC para asumir el rol IAM en AWS
              ▼
9.  Backend: build de imagen Docker → push a ECR → update ECS
    Frontend: npm build → upload a S3 → invalidate CloudFront
              ▼
10. Los usuarios ven los cambios en https://gemelo.cesa.edu.co
    (Backend ~10 min después del merge, Frontend ~3 min)`));

children.push(H2("9.2 Qué archivos disparan qué workflow"));
children.push(P("GitHub Actions inspecciona los paths de los archivos que cambiaron en cada push a main. Si coinciden con los filtros de algún workflow, lo dispara:"));
children.push(table2col([
  ["gemelo-digital-backend/**", "Dispara workflow de backend"],
  ["gemelo-digital-frontend/**", "Dispara workflow de frontend"],
  [".github/workflows/deploy-backend.yml", "Dispara workflow de backend (auto-redeploy si cambia el workflow)"],
  [".github/workflows/deploy-frontend.yml", "Dispara workflow de frontend"],
  ["docs/**", "NO dispara nada (solo documentación)"],
  [".gitignore", "NO dispara nada"],
  ["README.md, CLAUDE.md", "NO dispara nada"],
], ["Path que cambia", "Acción"]));

children.push(P("Si tu commit toca ambos (backend + frontend), ambos workflows corren EN PARALELO. No se esperan entre sí."));

children.push(H2("9.3 Disparar manualmente (workflow_dispatch)"));
children.push(P("Útil cuando NO hay un commit nuevo pero quieres re-deployar:"));
children.push(bullet("Tras cambiar una variable de entorno en el taskdef de ECS, para que el container la recoja."));
children.push(bullet("Tras tocar manualmente un archivo en S3, para refrescar la cache de CloudFront."));
children.push(bullet("Para confirmar que el deploy funciona sin esperar a hacer un cambio real."));

children.push(P("Pasos:"));
children.push(bullet("Ir a GitHub → repo → Actions.", 0));
children.push(bullet("En el panel izquierdo, click en \"Deploy backend a ECS\" o \"Deploy frontend a S3 y CloudFront\".", 0));
children.push(bullet("Click el botón \"Run workflow\" arriba a la derecha.", 0));
children.push(bullet("En el dropdown que aparece, seleccionar branch (main).", 0));
children.push(bullet("Click el botón verde \"Run workflow\".", 0));
children.push(bullet("El workflow arranca en segundos.", 0));

children.push(H2("9.4 Workflow del backend — pasos detallados"));
children.push(P("Definido en .github/workflows/deploy-backend.yml. Cada paso con su propósito:"));
children.push(table2col([
  ["1. Checkout del código", "Descarga el código del repo al runner temporal de GitHub"],
  ["2. Configurar credenciales AWS vía OIDC", "GitHub genera un JWT firmado que AWS verifica; AWS devuelve credenciales temporales asumiendo el rol GemeloDigitalDeployerRole. Sin Access Keys."],
  ["3. Login a Amazon ECR", "Autentica al runner contra el registry para poder hacer push de imágenes"],
  ["4. Construir, taggear y subir imagen Docker", "docker build desde gemelo-digital-backend/, taggea con :latest y :<sha>, push a ECR. Tarda 2-3 min."],
  ["5. Forzar redeploy del servicio ECS", "aws ecs update-service --force-new-deployment. ECS arranca un container nuevo y mata el viejo cuando el nuevo esté healthy."],
  ["6. Esperar a que el servicio quede estable", "aws ecs wait services-stable. Bloquea hasta que ECS confirma el deploy exitoso (puede tardar 5-10 min)."],
  ["7. Resumen del deploy", "Loguea info para que quede registro en la corrida"],
]));
children.push(P("Tiempo total: ~10 minutos."));
children.push(P("Si falla en algún paso, el workflow se marca como rojo (X) y no afecta producción — el container viejo sigue corriendo."));

children.push(H2("9.5 Workflow del frontend — pasos detallados"));
children.push(P("Definido en .github/workflows/deploy-frontend.yml. Cada paso con su propósito:"));
children.push(table2col([
  ["1. Checkout del código", "Igual que backend"],
  ["2. Setup Node.js 20", "Instala Node.js 20 en el runner para tener npm disponible"],
  ["3. Instalar dependencias", "npm ci instala exactamente lo del package-lock.json (reproducible)"],
  ["4. Construir la SPA", "npm run build ejecuta Vite y genera la carpeta dist/ con HTML/CSS/JS minificados"],
  ["5. Configurar credenciales AWS vía OIDC", "Igual que backend"],
  ["6. Sincronizar dist a S3", "aws s3 sync con --delete sube los archivos nuevos y borra los que ya no existen"],
  ["7. Invalidar cache de CloudFront", "create-invalidation con paths /* fuerza a CloudFront a re-pedir los archivos a S3 en el próximo request"],
]));
children.push(P("Tiempo total: ~2-3 minutos."));

children.push(H2("9.6 Seguridad del CI/CD"));
children.push(P("El sistema está diseñado para que sea muy difícil que se filtre algo:"));
children.push(bullet("Sin Access Keys de larga duración: GitHub Actions usa OIDC. Las credenciales temporales que AWS le da vencen automáticamente al terminar el job (no se guardan en ningún lado)."));
children.push(bullet("Trust scope estricto: el rol GemeloDigitalDeployerRole solo confía en workflows que vienen del repo JCortes87/proyecto-gemelos-digitales-JC. Si alguien intenta usarlo desde otro repo (por error de configuración o por ataque), AWS rechaza."));
children.push(bullet("Policy mínima: el rol tiene SOLO los permisos exactos para hacer su trabajo. No puede tocar RDS, no puede crear usuarios IAM, no puede acceder a Secrets Manager. Si se filtrara, el daño potencial es limitado."));
children.push(bullet("Sin secrets en el repo: ningún password, API key o token está en el código. Todo vive en el taskdef de ECS o se obtiene runtime."));

children.push(H2("9.7 Cómo monitorear y diagnosticar deploys"));
children.push(P("Dónde mirar cuando algo no anda:"));

children.push(H3("Ver el estado de los workflows"));
children.push(bullet("GitHub → repo → Actions. Verde = OK, Rojo = falló, Amarillo = corriendo."));
children.push(bullet("Click en una corrida para ver el log de cada paso."));
children.push(bullet("El log muestra exactamente qué comando se ejecutó, su output y su código de salida."));

children.push(H3("Ver los logs del backend en producción"));
children.push(bullet("AWS Console → CloudWatch → Log groups → /aws/ecs/default/gemelo-digital-api-cbc4."));
children.push(bullet("Filtrar por nivel (INFO, WARNING, ERROR) o por timestamp."));
children.push(bullet("Útil para detectar errores que pasan en runtime pero el container sigue corriendo."));

children.push(H3("Verificar que el deploy llegó"));
children.push(P("Tres formas de confirmar:"));
children.push(bullet("ECS Console → service → pestaña \"Implementaciones\". El deploy más reciente debe estar marcado como completado y tener la fecha actual."));
children.push(bullet("Visitar https://ge-...ecs.us-east-1.on.aws/health — debe responder OK con la timestamp actual."));
children.push(bullet("Para frontend: visitar https://gemelo.cesa.edu.co en modo incógnito (para evitar caché del browser). Los cambios visuales deben estar visibles."));

children.push(H2("9.8 Qué hacer si el workflow falla"));
children.push(P("Por orden de probabilidad:"));
children.push(bullet("Lee el log del paso que falló — generalmente dice exactamente qué pasó."));
children.push(bullet("Si dice \"AccessDenied\" o similar: revisa la policy IAM. Quizá faltó un permiso para el recurso nuevo que estás tocando."));
children.push(bullet("Si dice \"Could not assume role\": el OIDC trust policy podría estar mal. Verifica que el repo en la condición coincida exactamente."));
children.push(bullet("Si falla en \"docker build\": probablemente hay un error en el Dockerfile o falta una dependencia. Reproduce localmente."));
children.push(bullet("Si falla en \"npm run build\": error de sintaxis o dependencia rota. Corre npm run build localmente para reproducir."));
children.push(bullet("Si falla en \"aws ecs wait\": el container nuevo no arrancó bien. Mirá CloudWatch Logs del servicio para ver qué error tuvo."));
children.push(P("En todos los casos: el deploy fallido NO afecta producción. Los containers viejos siguen corriendo. Tomate tu tiempo para diagnosticar."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 10. VARIABLES DE ENTORNO ──
children.push(H2("9.9 Push manual a producción — procedimiento clic a clic (fallback de emergencia)"));

children.push(P("Esta sección documenta CÓMO HACER UN DEPLOY MANUALMENTE en caso de que el CI/CD esté roto, no esté disponible, o necesites hacer algo que los workflows no contemplan. Es un procedimiento de respaldo, NO el modo normal de operación."));

// Warning box
children.push(new Paragraph({
  shading: { fill: "FFE4B5", type: ShadingType.CLEAR },
  border: { top: { color: "FF8C00", space: 1, style: BorderStyle.SINGLE, size: 12 },
            bottom: { color: "FF8C00", space: 1, style: BorderStyle.SINGLE, size: 12 },
            left: { color: "FF8C00", space: 1, style: BorderStyle.SINGLE, size: 12 },
            right: { color: "FF8C00", space: 1, style: BorderStyle.SINGLE, size: 12 } },
  spacing: { before: 200, after: 200 },
  children: [new TextRun({
    text: "USAR SOLO EN EMERGENCIA: en condiciones normales SIEMPRE prefiere el deploy automático vía GitHub Actions. El deploy manual es más propenso a errores humanos y rompe la trazabilidad del historial.",
    bold: true,
    size: 22,
    color: "8B0000",
  })],
}));

children.push(H3("Cuándo usar este procedimiento"));
children.push(bullet("GitHub Actions está caído (down) y no puedes mergear ni disparar workflows."));
children.push(bullet("El rol IAM de GitHub Actions tiene un problema y los deploys fallan en autenticarse contra AWS."));
children.push(bullet("Necesitas deployar URGENTE algo crítico y no quieres esperar los 10 min del workflow."));
children.push(bullet("Estás validando algo localmente y quieres subir esa imagen específica sin pasar por git."));
children.push(bullet("Caso normal: NUNCA. Siempre usa el CI/CD."));

children.push(H3("Pre-requisitos antes de empezar"));
children.push(P("Necesitas tener instalado y configurado en tu PC:"));
children.push(table2col([
  ["AWS CLI v2", "Descargar desde https://awscli.amazonaws.com/AWSCLIV2.msi e instalar"],
  ["AWS CLI configurado", "Correr aws configure con tus Access Keys (las generas en IAM Console)"],
  ["Docker Desktop", "Instalado y corriendo (verás el ícono de ballena en la barra de tareas)"],
  ["Node.js 20", "Descargado desde https://nodejs.org (solo necesario para deploy de frontend)"],
  ["Permisos IAM correctos", "Tu usuario IAM debe tener permisos para ECR push, ECS update, S3 sync, CloudFront invalidate"],
]));
children.push(P("Si no tienes alguno de estos, configurarlos toma ~1 hora. En ese caso, evaluar si el CI/CD puede esperar."));

children.push(H3("PROCEDIMIENTO PASO A PASO — Deploy MANUAL del BACKEND"));

children.push(H4("Paso 1: Posicionarte en la carpeta correcta"));
children.push(P("Abre PowerShell y navega a la carpeta del proyecto:"));
children.push(code(`cd "C:\\Users\\jose.cortesh\\OneDrive - Colegio de Estudios Superiores de Administracion\\Escritorio\\Gemelo digital\\GEMELO-DIGITAL-V2\\gemelo-digital-backend"`));
children.push(P("Verifica que estás en la carpeta correcta — debe contener archivos como main.py, Dockerfile, requirements.txt, start.sh."));

children.push(H4("Paso 2: Verificar que Docker Desktop está corriendo"));
children.push(P("Mirar el ícono de ballena en la barra de tareas — debe estar quieto (corriendo), no parpadeando (iniciando)."));
children.push(P("Confirmar desde terminal:"));
children.push(code("docker info"));
children.push(P("Si responde con info del servidor, está OK. Si dice \"cannot connect\", abre Docker Desktop y espera a que arranque."));

children.push(H4("Paso 3: Hacer login en ECR"));
children.push(P("El siguiente comando obtiene una contraseña temporal y la usa para autenticarse contra ECR. Tarda ~3 segundos:"));
children.push(code("aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 718624265053.dkr.ecr.us-east-1.amazonaws.com"));
children.push(P("Esperado: \"Login Succeeded\"."));

children.push(H4("Paso 4: Construir la imagen Docker"));
children.push(P("Desde la carpeta gemelo-digital-backend, construye la imagen con un tag descriptivo (puedes usar la fecha actual o un nombre que recuerdes):"));
children.push(code("docker build -t gemelo-backend:manual-2026-06-15 ."));
children.push(P("Tarda 2-3 minutos. Verás logs de cada paso del Dockerfile (instalar dependencias, copiar archivos, etc.)."));
children.push(P("Esperado: termina con \"Successfully tagged gemelo-backend:manual-2026-06-15\"."));

children.push(H4("Paso 5: Taggear la imagen para ECR"));
children.push(P("La imagen local necesita un tag adicional con la URL completa del registry:"));
children.push(code(`docker tag gemelo-backend:manual-2026-06-15 718624265053.dkr.ecr.us-east-1.amazonaws.com/gemelo-backend:latest

docker tag gemelo-backend:manual-2026-06-15 718624265053.dkr.ecr.us-east-1.amazonaws.com/gemelo-backend:manual-2026-06-15`));
children.push(P("El primero sobreescribe el tag :latest (lo que ECS pulleará automáticamente). El segundo guarda con el tag de fecha por si necesitas rollback después."));

children.push(H4("Paso 6: Push de la imagen a ECR"));
children.push(P("Sube ambos tags a ECR. Tarda 1-2 minutos dependiendo de tu velocidad de internet:"));
children.push(code(`docker push 718624265053.dkr.ecr.us-east-1.amazonaws.com/gemelo-backend:latest

docker push 718624265053.dkr.ecr.us-east-1.amazonaws.com/gemelo-backend:manual-2026-06-15`));
children.push(P("Verás progreso por cada layer de la imagen. Esperado: terminar con la línea \"digest: sha256:...\" para cada push."));

children.push(H4("Paso 7: Forzar el redeploy en ECS"));
children.push(P("Decirle a ECS que pulle la nueva imagen y reinicie el container:"));
children.push(code("aws ecs update-service --cluster default --service gemelo-digital-api --force-new-deployment --region us-east-1"));
children.push(P("ECS responde inmediatamente con el JSON del servicio actualizado. El redeploy real toma 3-5 minutos."));

children.push(H4("Paso 8: Esperar a que el deploy quede estable"));
children.push(P("Este comando bloquea hasta que ECS confirma que el deploy se completó:"));
children.push(code("aws ecs wait services-stable --cluster default --services gemelo-digital-api --region us-east-1"));
children.push(P("Si todo sale bien, vuelve al prompt sin imprimir nada (deploy exitoso). Si falla, ECS revierte automáticamente al container viejo."));

children.push(H4("Paso 9: Verificar que el deploy funcionó"));
children.push(P("Tres formas de confirmar (haz al menos una):"));
children.push(bullet("Visitar https://ge-9d9d0220a8704eeabada1b951f3f2d37.ecs.us-east-1.on.aws/health en el navegador — debe responder con timestamp actual.", 0));
children.push(bullet("ECS Console → service → pestaña Implementaciones — debe aparecer un deploy reciente marcado como completado.", 0));
children.push(bullet("CloudWatch Logs → log group del backend — buscar líneas recientes con \"Application startup complete\".", 0));

children.push(H3("PROCEDIMIENTO PASO A PASO — Deploy MANUAL del FRONTEND"));

children.push(H4("Paso 1: Posicionarte en la carpeta del frontend"));
children.push(code(`cd "C:\\Users\\jose.cortesh\\OneDrive - Colegio de Estudios Superiores de Administracion\\Escritorio\\Gemelo digital\\GEMELO-DIGITAL-V2\\gemelo-digital-frontend\\gemelo-frontend"`));

children.push(H4("Paso 2: Instalar dependencias (solo si es primera vez o cambió package.json)"));
children.push(code("npm install"));
children.push(P("Tarda 2-5 minutos la primera vez. Las siguientes es más rápido."));

children.push(H4("Paso 3: Construir la SPA"));
children.push(code("npm run build"));
children.push(P("Vite construye los archivos optimizados en la carpeta dist/. Tarda 30-60 segundos."));
children.push(P("Esperado: \"✓ built in X.XXs\" al final, sin errores rojos."));

children.push(H4("Paso 4: Subir los archivos a S3"));
children.push(P("Sincroniza la carpeta dist/ con el bucket S3. La opción --delete borra del bucket archivos que ya no existen en dist/:"));
children.push(code("aws s3 sync ./dist/ s3://gemelo-frontend-prod --delete --region us-east-1"));
children.push(P("Verás líneas como \"upload: dist/index.html to s3://...\". Tarda 30-60 segundos."));

children.push(H4("Paso 5: Invalidar el caché de CloudFront"));
children.push(P("Esto fuerza a CloudFront a pedir los archivos nuevos a S3 inmediatamente. Sin esto, los usuarios verían la versión vieja hasta que el caché expire (~24h):"));
children.push(code("aws cloudfront create-invalidation --distribution-id E32WDBCT7SFCRD --paths \"/*\" --region us-east-1"));
children.push(P("Responde con un JSON que incluye el ID de la invalidation. Toma 5-10 minutos en propagarse globalmente."));

children.push(H4("Paso 6: Verificar"));
children.push(bullet("Abrir https://gemelo.cesa.edu.co en modo incógnito (para evitar caché del browser).", 0));
children.push(bullet("Verificar que los cambios se ven (puede tomar hasta 10 min mientras CloudFront propaga).", 0));
children.push(bullet("Si no se ven, recargar con Ctrl+Shift+R (hard reload).", 0));

children.push(H3("Recordatorio importante"));
children.push(P("Si haces un deploy manual:"));
children.push(bullet("El estado de git en tu PC NO se sincroniza automáticamente con producción. Si haces cambios manualmente, también haz commit + push de esos cambios al repo de GitHub para que queden registrados."));
children.push(bullet("El próximo deploy automático sobreescribirá tu deploy manual con lo que esté en main. Asegúrate de que main tenga el código correcto."));
children.push(bullet("Documenta en el chat / wiki / equipo que hiciste un deploy manual y por qué."));

children.push(new Paragraph({ children: [new PageBreak()] }));

children.push(H1("10. Variables de entorno (producción)"));
children.push(P("Definidas en el taskdef de ECS, sección environment. Cuando cambias una, hay que registrar una nueva revisión del taskdef y forzar redeploy."));

children.push(H2("10.1 Brightspace OAuth"));
children.push(table2col([
  ["BRIGHTSPACE_CLIENT_ID", "Client ID OAuth registrado en Brightspace"],
  ["BRIGHTSPACE_CLIENT_SECRET", "Client secret correspondiente"],
  ["BRIGHTSPACE_REDIRECT_URI", "URL de callback OAuth (debe coincidir con Brightspace)"],
  ["BRIGHTSPACE_AUTH_URL", "https://auth.brightspace.com/oauth2/auth"],
  ["BRIGHTSPACE_TOKEN_URL", "https://auth.brightspace.com/core/connect/token"],
  ["BRIGHTSPACE_BASE_URL", "https://cesa.brightspace.com"],
  ["BRIGHTSPACE_SCOPE", "Scope OAuth con permisos a la API"],
  ["BRIGHTSPACE_LP_VERSION", "Versión API LP (Learning Platform)"],
  ["BRIGHTSPACE_LE_VERSION", "Versión API LE (Learning Experience)"],
]));

children.push(H2("10.2 LTI 1.3"));
children.push(table2col([
  ["LTI_CLIENT_ID", "Client ID de la herramienta LTI"],
  ["LTI_ISSUER", "https://cesa.brightspace.com"],
  ["LTI_AUTH_ENDPOINT", "https://cesa.brightspace.com/d2l/lti/authenticate"],
  ["LTI_JWKS_URL", "https://cesa.brightspace.com/d2l/.well-known/jwks"],
]));

children.push(H2("10.3 Base de datos"));
children.push(table2col([
  ["DATABASE_URL", "URL de conexión a RDS (formato: postgresql+psycopg://user:password@host:5432/dbname)"],
]));

children.push(H2("10.4 URLs"));
children.push(table2col([
  ["FRONTEND_BASE_URL", "https://gemelo.cesa.edu.co"],
  ["TOOL_BASE_URL", "URL pública del backend en ECS"],
]));

children.push(H2("10.5 ElevenLabs (opcional)"));
children.push(table2col([
  ["ELEVENLABS_API_KEY", "Si está, /speech/* funciona"],
  ["ELEVENLABS_VOICE_ID", "ID de voz por defecto"],
]));

children.push(H2("10.6 Secrets internos"));
children.push(table2col([
  ["SESSION_SECRET", "Para firmar el state en OAuth"],
  ["LTI_STATE_SECRET", "Para firmar el state en LTI"],
  ["LTI_PRIVATE_KEY_PATH", "Path a la llave RSA para firmar JWTs LTI"],
]));

children.push(H2("10.7 Scheduler (cuando se active)"));
children.push(table2col([
  ["BRIGHTSPACE_SERVICE_REFRESH_TOKEN", "Refresh token de cuenta de servicio para sync automático"],
  ["CRON_SHARED_SECRET", "Secret para autenticar al scheduler externo"],
]));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 11. OPERACIONES COMUNES ──
children.push(H1("11. Operaciones comunes — recetario"));
children.push(P("Cómo hacer las cosas más frecuentes."));

children.push(H2("11.1 Hacer un cambio de código y desplegarlo"));
children.push(bullet("Hacer el cambio localmente en una rama (típicamente sync/upstream-abril-2026 o nueva).", 0));
children.push(bullet("git add + git commit con mensaje descriptivo.", 0));
children.push(bullet("Abrir un Pull Request a main en GitHub.", 0));
children.push(bullet("Revisar el diff en \"Files changed\" del PR.", 0));
children.push(bullet("Mergear el PR (botón verde).", 0));
children.push(bullet("GitHub Actions deploya automáticamente. Ver progreso en pestaña Actions.", 0));

children.push(H2("11.2 Ver los logs del backend en producción"));
children.push(P("Opción 1: AWS Console → CloudWatch → Log groups → /aws/ecs/default/gemelo-digital-api-cbc4."));
children.push(P("Opción 2: ECS Console → cluster default → service gemelo-digital-api → pestaña \"Registros\" (Logs)."));

children.push(H2("11.3 Ver qué imagen está corriendo"));
children.push(P("ECS Console → service → pestaña Configuración → buscar línea \"Imagen\". Muestra algo como:"));
children.push(code("718624265053.dkr.ecr.us-east-1.amazonaws.com/gemelo-backend:latest"));
children.push(P("Si quieres ver el SHA exacto del commit que está corriendo, ver el tag en ECR."));

children.push(H2("11.4 Forzar un redeploy sin cambios de código"));
children.push(P("Útil tras cambiar variables de entorno en taskdef."));
children.push(bullet("ECS Console → service.", 0));
children.push(bullet("Click \"Actualizar servicio\" (Update service).", 0));
children.push(bullet("Marcar la casilla \"Forzar nueva implementación\" (Force new deployment).", 0));
children.push(bullet("Click \"Actualizar\" (Update).", 0));
children.push(P("Alternativa: ir a GitHub Actions → Run workflow del backend."));

children.push(H2("11.5 Tomar un snapshot manual de la base de datos"));
children.push(bullet("RDS Console → bases de datos → gemelo-digital-db.", 0));
children.push(bullet("Click el botón \"Acciones\" arriba a la derecha.", 0));
children.push(bullet("Click \"Realizar instantánea\" (Take snapshot).", 0));
children.push(bullet("Nombre descriptivo (ej. pre-deploy-2026-06-15).", 0));
children.push(bullet("Click confirmar.", 0));

children.push(H2("11.6 Disparar un sync manual desde la web"));
children.push(P("Loguearse en https://gemelo.cesa.edu.co. Luego, con sesión activa, llamar al endpoint:"));
children.push(code("POST https://ge-9d9d0220a8704eeabada1b951f3f2d37.ecs.us-east-1.on.aws/debug/sync/master/{orgUnitId}"));
children.push(P("Reemplazar {orgUnitId} por el ID del curso (ej. 41742). Esto sincroniza classlist + snapshots de ese curso."));

children.push(H2("11.7 Cambiar una variable de entorno en producción"));
children.push(bullet("ECS Console → cluster default → service gemelo-digital-api.", 0));
children.push(bullet("Pestaña Configuración → click \"Editar\".", 0));
children.push(bullet("Buscar la sección \"Variables de entorno\" del container.", 0));
children.push(bullet("Cambiar el valor (o agregar nueva).", 0));
children.push(bullet("Guardar — esto registra una nueva revisión del taskdef.", 0));
children.push(bullet("ECS Console → service → forzar nueva implementación para que el container la recoja.", 0));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 12. ROLLBACK ──
children.push(H1("12. Rollback y recuperación"));
children.push(P("Cómo deshacer si algo sale mal."));

children.push(H2("12.1 Si un deploy de backend rompe producción"));

children.push(H3("Opción A: revertir imagen en ECS"));
children.push(bullet("ECR Console → repositorio gemelo-backend → identificar el SHA de la imagen anterior.", 0));
children.push(bullet("Tag esa imagen como 'latest' (esto sobreescribe el tag actual).", 0));
children.push(bullet("ECS Console → service → forzar nueva implementación.", 0));
children.push(P("El container nuevo pulleará la imagen vieja por su tag latest."));

children.push(H3("Opción B: revertir vía git"));
children.push(bullet("Localmente: git revert <hash-del-commit-malo>.", 0));
children.push(bullet("git push origin main.", 0));
children.push(bullet("GitHub Actions deploya la versión revertida automáticamente.", 0));
children.push(P("Más limpio que la opción A porque queda registro en la historia de git."));

children.push(H3("Opción C (emergencia): backup branch"));
children.push(bullet("Hay un branch backup/pre-merge-jd-junio-10 en GitHub con el estado pre-merge.", 0));
children.push(bullet("git checkout main && git reset --hard backup/pre-merge-jd-junio-10.", 0));
children.push(bullet("git push origin main --force (operación destructiva).", 0));
children.push(P("Solo usar en emergencia extrema. Pierdes commits que no estén en el backup."));

children.push(H2("12.2 Si un deploy de frontend rompe la web"));

children.push(H3("Opción rápida: versiones S3"));
children.push(bullet("S3 Console → bucket gemelo-frontend-prod.", 0));
children.push(bullet("Activar \"Show versions\" en la lista de objetos.", 0));
children.push(bullet("Para cada archivo afectado (index.html, /assets/*), restaurar la versión anterior con \"Actions → Restore\".", 0));
children.push(bullet("CloudFront Console → distribución E32WDBCT7SFCRD → crear invalidation /*.", 0));

children.push(H3("Opción robusta: revertir vía git"));
children.push(P("Misma estrategia que backend opción B. El workflow del frontend deploya la versión revertida."));

children.push(H2("12.3 Si la base de datos se corrompe"));
children.push(bullet("RDS Console → Snapshots → buscar el snapshot reciente.", 0));
children.push(bullet("Click \"Acciones → Restaurar instantánea\" — crea una instancia nueva.", 0));
children.push(bullet("Esperar a que la instancia nueva esté \"Available\".", 0));
children.push(bullet("Cambiar DATABASE_URL en el taskdef para apuntar al endpoint de la instancia nueva.", 0));
children.push(bullet("Forzar redeploy en ECS.", 0));
children.push(P("Restaurar una DB es operación destructiva — solo hacerlo si realmente hay corrupción de datos."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 13. COORDINACIÓN HUMANA ──
children.push(H1("13. Coordinación humana"));

children.push(H2("13.1 Quién es quién"));
children.push(table2col([
  ["Juan David", "Colaborador original del proyecto. Su repo es el histórico de referencia. Para integrar features nuevas de él, hacer git fetch colaborador y mergear con cuidado."],
  ["JCortes87", "Dueño actual del proyecto. Tiene CI/CD configurado y hace los deploys vía GitHub Actions."],
  ["CESA admin AWS", "Quien administra la cuenta AWS 718624265053. Pedirle permisos adicionales si se necesitan nuevas integraciones."],
  ["CESA admin Brightspace", "Quien gestiona apps OAuth y LTI en Brightspace. Pedirle registro de nuevas URLs de redirect o herramientas LTI."],
], ["Persona / rol", "Función y cómo contactar"]));

children.push(H2("13.2 Transferir el proyecto a otra persona"));
children.push(bullet("Darle acceso al repo en GitHub: Settings → Collaborators → invite collaborator.", 0));
children.push(bullet("Eventualmente transferir el repo a una GitHub Organization de CESA para que quede del área, no de la persona.", 0));
children.push(bullet("Tras transferir, actualizar el trust policy del IAM role GemeloDigitalDeployerRole para que apunte al nuevo path del repo (<org>/proyecto-gemelos-digitales-JC en lugar de JCortes87/...).", 0));

children.push(H2("13.3 Acceso a AWS"));
children.push(P("URL de login para CESA:"));
children.push(code("https://718624265053.signin.aws.amazon.com/console"));
children.push(P("Login con IAM username + password + MFA. El usuario debe tener permisos para los servicios usados (ECS, ECR, RDS, S3, CloudFront, IAM, CloudWatch)."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 14. DECISIONES TÉCNICAS ──
children.push(H1("14. Decisiones técnicas (contexto histórico)"));
children.push(P("Estas decisiones se tomaron en el pasado. Conocerlas evita romper invariantes."));

children.push(H2("14.1 Por qué tener Postgres además de Brightspace"));
children.push(P("Brightspace es la fuente de verdad de los datos académicos. Pero consultarlo en cada request es lento (1-3 segundos por endpoint). Por eso se sincronizan snapshots a Postgres y los endpoints \"DB-first\" sirven desde ahí (~50ms). Si los datos en DB están viejos (>30 min), se cae al path Brightspace y se persiste de vuelta en background."));
children.push(P("Mejora típica: 95% de los hits a dashboard se sirven en menos de 100ms, contra 1-3s si fueran directos a Brightspace."));

children.push(H2("14.2 Por qué autenticación dual (OAuth + LTI)"));
children.push(P("OAuth: para login standalone desde la web (gemelo.cesa.edu.co). Permite que un docente acceda sin estar en Brightspace en ese momento."));
children.push(P("LTI 1.3: para que la herramienta se embeba dentro de Brightspace (el docente entra desde un link en su curso, no hace login porque ya está logueado en Brightspace)."));
children.push(P("Ambas convergen en el mismo SESSION_STORE con la cookie gemelo_session_id."));

children.push(H2("14.3 Por qué sync_classlist desactiva enrollments"));
children.push(P("Si un estudiante se sale del curso en Brightspace, su classlist deja de incluirlo. Antes, sus datos viejos seguían apareciendo en \"Estudiantes prioritarios\" para siempre."));
children.push(P("Ahora sync_classlist acumula los IDs vistos durante la sincronización y al final marca como is_active=False cualquier enrollment activo cuyo brightspace_user_id no haya aparecido."));
children.push(P("Las consultas de overview filtran por is_active=True para excluir automáticamente a los \"fantasmas\"."));

children.push(H2("14.4 Por qué hay refresh-token automático"));
children.push(P("El access_token de Brightspace dura ~1 hora. Sin refresh-token, el dashboard se quedaba sin datos después de 1 hora idle: la cookie seguía válida (TTL 8h) pero las API calls a Brightspace fallaban con 401."));
children.push(P("Ahora el backend detecta cuando al token le quedan <5 minutos y lo refresca silenciosamente usando el refresh_token que Brightspace entrega en el login. El usuario no se entera."));

children.push(H2("14.5 Por qué workflow_dispatch en GitHub Actions"));
children.push(P("Permite disparar deploys manuales desde la pestaña Actions de GitHub sin necesidad de hacer un commit. Útil para re-desplegar la misma versión (ej. tras cambiar una variable de entorno en taskdef)."));

children.push(H2("14.6 Por qué start.sh corre las migraciones automáticamente"));
children.push(P("Antes, había que ejecutar alembic upgrade head manualmente después de cada deploy. Eso es propenso al olvido y a inconsistencias entre código y schema."));
children.push(P("Ahora el container ejecuta migraciones al arrancar. Si una migración falla, set -e hace que el container muera, ECS no remplaza los containers viejos, y producción sigue funcionando con la versión anterior."));

children.push(H2("14.7 Por qué push al colaborador está deshabilitado"));
children.push(P("El repo del colaborador (Juan David) es referencia, no destino. Para evitar empujarle código por accidente, se configuró:"));
children.push(code("git remote set-url --push colaborador DISABLED-no-push-to-upstream"));
children.push(P("Cualquier intento de git push colaborador <algo> falla con un error claro de URL inválida."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 15. TRABAJO REALIZADO EN ESTA SESIÓN ──
children.push(H1("15. Trabajo realizado hasta hoy — sesión completa"));
children.push(P("Inventario cronológico y detallado de todo lo que se trabajó. Para entender cómo llegamos al estado actual y reconstruir el contexto si alguien necesita continuar."));

children.push(H2("15.1 Punto de partida"));
children.push(P("Al inicio de la sesión, la situación era:"));
children.push(bullet("Producción ejecutaba la versión del colaborador (Juan David) con sus últimos avances no commiteados a su repo."));
children.push(bullet("Existían 2 repos: el de JD (juandavid639/Proyecto-Gemelos-Digitales) y un fork antiguo nuestro (JCortes87/gemelo-digital-backend-JC) abandonado."));
children.push(bullet("No había CI/CD automatizado — JD hacía deploys manuales desde su PC."));
children.push(bullet("No había documentación consolidada del proyecto."));
children.push(bullet("Habíamos creado el repo JCortes87/proyecto-gemelos-digitales-JC vacío para empezar a trabajar de cero."));

children.push(H2("15.2 Integración inicial del trabajo histórico"));
children.push(P("Primera ronda: clonar la versión upstream del colaborador y añadir el trabajo de la capa Postgres que estaba en el fork viejo."));
children.push(bullet("Clonado del repo de JD como base en una carpeta nueva GEMELO-DIGITAL-V2/."));
children.push(bullet("Configuración de remotes: origin (nuestro repo) y colaborador (JD, solo fetch)."));
children.push(bullet("Bloqueo explícito de push a colaborador con git remote set-url --push colaborador DISABLED-no-push-to-upstream."));
children.push(bullet("Creación de la rama sync/upstream-abril-2026 para trabajo iterativo."));
children.push(bullet("Integración de la capa Postgres del fork viejo: app/db/ con modelos SQLAlchemy, alembic/ con migraciones, app/services/sync_service.py."));
children.push(bullet("Eliminación del app/main.py duplicado (vivía en el fork viejo, no se necesitaba)."));
children.push(bullet("Migración de la sintaxis vieja para que importe correctamente con la nueva arquitectura."));

children.push(H2("15.3 Refresh-token automático en sesiones de usuario"));
children.push(P("Problema observado: tras dejar el dashboard idle por más de 1 hora, dejaba de cargar datos."));
children.push(P("Causa raíz: el access_token de Brightspace dura ~1 hora; la cookie de sesión dura 8h. Sin refresh-token automático, las llamadas a Brightspace fallaban con 401 después de la primera hora."));
children.push(P("Solución implementada:"));
children.push(bullet("Nuevo módulo app/services/brightspace_auth.py con la función mint_access_token_from_refresh(refresh_token)."));
children.push(bullet("Nueva función update_session_tokens(sid, new_data) en app/state.py para actualizar la sesión con el token nuevo."));
children.push(bullet("Modificación de BrightspaceClient._auth_headers_with_refresh() async para detectar tokens próximos a expirar (<5 min) y refrescarlos proactivamente."));
children.push(bullet("Modificación de _request_json() para usar el path async con refresh proactivo."));
children.push(bullet("Compatibilidad backwards: el path sincrono _auth_headers() sigue funcionando para BackgroundTasks que capturaron token en momento del request."));

children.push(H2("15.4 Fix de estudiantes \"fantasma\" removidos"));
children.push(P("Problema observado: estudiantes que se sacaban del curso en Brightspace seguían apareciendo en \"Estudiantes prioritarios\" del dashboard, aunque ya no aparecían en la lista normal."));
children.push(P("Causa raíz: dos bugs concatenados:"));
children.push(bullet("sync_classlist creaba/activaba enrollments para estudiantes presentes en la classlist pero NUNCA marcaba como inactivos los que ya no estaban. Quedaban con is_active=True para siempre."));
children.push(bullet("build_course_overview_from_db leía todos los snapshots del curso sin filtrar por enrollment activo."));
children.push(P("Solución implementada:"));
children.push(bullet("sync_classlist ahora acumula los brightspace_user_id vistos durante la sincronización y, al final, busca enrollments activos en DB cuyo user_id NO esté en el set y los marca is_active=False."));
children.push(bullet("build_course_overview_from_db ahora hace JOIN con enrollments y filtra por is_active=True."));
children.push(bullet("La background task del overview y el cron del scheduler ahora ejecutan sync_classlist + sync_student_metric_snapshots en orden, manteniendo enrollments al día."));
children.push(bullet("Se añade el campo deactivated_enrollments al return del sync_classlist para visibilidad."));

children.push(H2("15.5 Endpoints administrativos para scheduler externo"));
children.push(P("Objetivo: permitir que un sistema externo (típicamente AWS EventBridge) dispare sincronizaciones automáticas cada N minutos sin depender de visitas de usuarios."));
children.push(P("Implementación:"));
children.push(bullet("Nuevo módulo app/services/cron_runner.py con run_sync_for_all_courses(refresh_token, org_unit_ids)."));
children.push(bullet("Nuevo router app/api/admin.py con dos endpoints:"));
children.push(bullet("POST /admin/sync-cron-all — para el scheduler. Auth via header X-Cron-Secret. Mintea access_token usando refresh_token de servicio.", 1));
children.push(bullet("GET /admin/show-refresh-token — herramienta UNA-vez para capturar el refresh_token de la cuenta de servicio inicial. Eliminar tras usar.", 1));
children.push(bullet("Documentación completa en docs/setup-scheduler.md sobre cómo configurar el schedule en AWS EventBridge."));
children.push(bullet("Variables de entorno nuevas requeridas: BRIGHTSPACE_SERVICE_REFRESH_TOKEN, CRON_SHARED_SECRET."));

children.push(H2("15.6 Refactor del backend — extracción de helpers"));
children.push(P("Problema: gemelo_service.py tenía 2107 líneas, difícil de mantener y modificar."));
children.push(P("Solución: extracción de 27 funciones helper a 6 módulos por dominio."));
children.push(table2col([
  ["text_utils.py", "Limpieza de HTML, normalización de texto, detección de \"no entregado\""],
  ["common_utils.py", "Coerción numérica, parsing de datetime, _as_dict"],
  ["grade_filters.py", "Predicados sobre grade values (_is_graded_value, _is_grade_zero, etc.)"],
  ["scale_utils.py", "Thresholds, escalas de rúbricas, _get_thresholds, lookups"],
  ["risk_utils.py", "Roll-up a macrocompetencias, weighted_avg, risk_from_pct"],
  ["role_utils.py", "Roles, identificación de usuarios, normalización de classlist"],
]));
children.push(P("Resultado: gemelo_service.py bajó de 2107 a 1645 líneas (-22%). El código quedó organizado por dominio funcional."));

children.push(H2("15.7 Configuración completa del CI/CD desde cero"));
children.push(P("Sesión grande dedicada a montar el deploy automático. Pasos en orden:"));

children.push(H3("Paso 1: OIDC Identity Provider en AWS"));
children.push(bullet("En IAM Console, crear OIDC Identity Provider apuntando a https://token.actions.githubusercontent.com."));
children.push(bullet("Audience: sts.amazonaws.com."));
children.push(bullet("Resultado: AWS confía en tokens emitidos por GitHub Actions."));

children.push(H3("Paso 2: IAM Policy con permisos mínimos"));
children.push(bullet("Crear policy GemeloDigitalDeployerPolicy con permisos exactos para ECR push/pull, ECS update-service, S3 sync, CloudFront invalidate."));
children.push(bullet("Cada permiso scoped al recurso específico (ej. solo el repo gemelo-backend en ECR, no \"todo ECR\")."));

children.push(H3("Paso 3: IAM Role asumible vía OIDC"));
children.push(bullet("Crear rol GemeloDigitalDeployerRole."));
children.push(bullet("Trust policy: confía en el OIDC provider Y solo si el subject del token corresponde al repo JCortes87/proyecto-gemelos-digitales-JC."));
children.push(bullet("Asociar la policy creada en paso 2."));

children.push(H3("Paso 4: Workflows en el repo"));
children.push(bullet(".github/workflows/deploy-backend.yml — para deploy de backend."));
children.push(bullet(".github/workflows/deploy-frontend.yml — para deploy de frontend."));
children.push(bullet("Ambos disparan en push a main con paths matching."));
children.push(bullet("Usan aws-actions/configure-aws-credentials@v4 para OIDC."));
children.push(bullet("Soportan workflow_dispatch para disparar manualmente desde la UI."));

children.push(H3("Paso 5: Primer deploy"));
children.push(bullet("Merge controlado del trabajo acumulado a main."));
children.push(bullet("GitHub Actions detecta el merge y arranca workflows."));
children.push(bullet("Backend: build + push ECR + update ECS — verde en ~10 min."));
children.push(bullet("Frontend: npm build + sync S3 + invalidate CloudFront — verde en ~3 min."));

children.push(H3("Paso 6: Salvaguardas pre-deploy"));
children.push(bullet("S3 Versioning activado en bucket gemelo-frontend-prod para poder rollback de archivos individuales."));
children.push(bullet("Snapshot manual de RDS tomado con nombre pre-deploy-junio-10-2026."));
children.push(bullet("Branch backup/pre-merge-jd-junio-10 creado y pusheado a GitHub como punto de retorno."));

children.push(H2("15.8 Integración del frontend del colaborador"));
children.push(P("Tras observar que la producción tenía features que nuestra rama no tenía (calendario, alertas, predicciones, vista estudiante), se decidió integrar el trabajo del colaborador."));
children.push(P("Pasos:"));
children.push(bullet("Análisis exhaustivo de los 52+ commits que JD había avanzado desde nuestro fork."));
children.push(bullet("Confirmación de que JD ya tenía nuestro trabajo backend mergeado (ad96123)."));
children.push(bullet("Merge controlado: git merge colaborador/main."));
children.push(bullet("Resolución del único conflicto: línea de imports en gemelo_db_service.py — combinamos Enrollment (nuestro fix) + CourseMetricHistory (de JD)."));
children.push(bullet("Limpieza de archivos basura del merge: cf-config-tmp.json, cf-dist.json, cf-update.json, commits.json (todos añadidos a .gitignore para que no vuelvan)."));
children.push(bullet("Push del merge a main."));
children.push(bullet("GitHub Actions deploya automáticamente la versión integrada."));
children.push(bullet("Verificación en producción: dashboard carga, login funciona, features nuevas (calendar, alerts, predictions) visibles."));

children.push(H2("15.9 Migraciones automáticas con start.sh"));
children.push(P("Aspecto importante del trabajo de JD que ahora forma parte del proyecto:"));
children.push(bullet("start.sh corre alembic upgrade head antes de exec uvicorn."));
children.push(bullet("Dockerfile actualizado para usar CMD [\"./start.sh\"] en vez de uvicorn directo."));
children.push(bullet("set -e en el script garantiza que si una migración falla, el container no arranca."));
children.push(bullet("ECS detecta el fallo y mantiene los containers viejos corriendo — protección automática."));

children.push(H2("15.10 Voz TTS — estado actual y plan"));
children.push(P("Estado actual:"));
children.push(bullet("Backend: endpoints /speech/tts, /speech/stt, /speech/voices funcionando."));
children.push(bullet("Backend: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL configurados en taskdef."));
children.push(bullet("Frontend: utils preservados (src/utils/voice.js, src/utils/speech.js, ~180 líneas)."));
children.push(bullet("Frontend: las llamadas activas a estos utils fueron removidas por JD en commit 9bb5d6b."));
children.push(P("Plan para reactivar (pendiente):"));
children.push(bullet("Identificar el componente del chat estudiante en el frontend nuevo (probable: hook useStudentChat.js o componente de chat IA)."));
children.push(bullet("Conectar las llamadas a elSpeak/elStop desde ese componente."));
children.push(bullet("Incluir el fix de no-superposición (AbortController + token monotónico) que habíamos hecho."));

children.push(H2("15.11 Documentación completa"));
children.push(P("En la fase final de la sesión, se creó documentación consolidada:"));
children.push(bullet("docs/PROYECTO-GEMELO-DIGITAL-COMPLETO.md — versión Markdown (650 líneas)."));
children.push(bullet("docs/Gemelo-Digital-Documentacion-Completa.docx — versión Word (este documento)."));
children.push(bullet("docs/setup-scheduler.md — guía paso-a-paso para configurar el scheduler en AWS EventBridge."));
children.push(bullet("docs/build/generate-docx.js — script generador del Word, regenerable cuando la información cambie."));

children.push(H2("15.12 Lista completa de commits relevantes en main"));
children.push(P("Si quieres rastrear cambios específicos, estos son los SHAs principales:"));
children.push(table2col([
  ["8a50f1b", "Documento Word maestro del proyecto"],
  ["ee7028f", "Documentación maestra Markdown del proyecto"],
  ["be945ab", "Merge integral con el repo del colaborador"],
  ["6c4f948", "Merge inicial colaborador → main (con resolución de conflicto)"],
  ["7f06e27", "Merge a main del fix de estudiantes fantasma"],
  ["e6830b8", "Fix: estudiantes removidos de Brightspace ya no aparecen en métricas"],
  ["1fbd9c0", "Guía de configuración del scheduler en AWS"],
  ["23faffd", "Endpoints para sincronización automática (admin)"],
  ["b6108c6", "Reescritura de comentarios en lenguaje descriptivo"],
  ["a6a9edc", "Refactor backend: 27 helpers a 6 módulos"],
  ["64e9201", "Fix auth: refresh-token automático en sesiones"],
  ["94a9ae1", "Fix: cargar .env de forma robusta independiente del cwd"],
  ["7a80b81", "Fix frontend voz: evitar voces superpuestas"],
  ["1d63a71", "Bump SQLAlchemy a >=2.0.43 (compat Python 3.14)"],
  ["9356f9a", "Bump psycopg a 3.2.13"],
  ["1a0a2ce", "chore: añadir .gitignore y destrackar .env"],
  ["d8a5db0", "Fase 3: integración de capa Postgres"],
]));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 16. PENDIENTES Y SIGUIENTES PASOS ──
children.push(H1("16. Pendientes y siguientes pasos sugeridos"));
children.push(P("Lo que queda por hacer cuando se retome el proyecto."));

children.push(H2("16.1 Pendientes de corto plazo"));
children.push(bullet("Reactivar la voz TTS ElevenLabs en el chat del asistente. La infraestructura backend está intacta (endpoints /speech/* funcionan). En el frontend nuevo de JD, los utils voice.js y speech.js están preservados; falta cablearlos en useStudentChat.js o el componente del chat."));
children.push(bullet("Reintegrar el fix de no-superposición de audios (AbortController + token monotónico) cuando se reactive la voz."));

children.push(H2("16.2 Pendientes de mediano plazo"));
children.push(bullet("Configurar el scheduler de sincronización automática vía AWS EventBridge. Guía completa en docs/setup-scheduler.md."));
children.push(bullet("Capturar refresh_token de cuenta de servicio usando /admin/show-refresh-token."));
children.push(bullet("Eliminar el endpoint /admin/show-refresh-token una vez capturado el token."));
children.push(bullet("Agregar las env vars BRIGHTSPACE_SERVICE_REFRESH_TOKEN y CRON_SHARED_SECRET al taskdef."));

children.push(H2("16.3 Pendientes de largo plazo"));
children.push(bullet("Transferir el repositorio a una GitHub Organization de CESA para que quede del área, no de la persona."));
children.push(bullet("Considerar migrar a AWS IAM Identity Center (SSO) si CESA lo implementa."));
children.push(bullet("Si los costos de RDS suben con más usuarios, evaluar migrar a una instancia más grande o a Aurora Serverless."));
children.push(bullet("Implementar monitoreo y alertas (CloudWatch Alarms) para errores 5xx y caídas del backend."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ── 17. APÉNDICES ──
// ── 17. REFERENCIAS RÁPIDAS — TODAS LAS URLs, PATHS Y ARNs ──
children.push(H1("17. Referencias rápidas — todas las URLs, paths y ARNs"));
children.push(P("Esta sección consolida en un solo lugar todas las URLs, paths del filesystem, ARNs de AWS, y cualquier identificador relevante. Pensada para tener todo a la mano sin tener que buscar por el documento."));

children.push(H2("17.1 Ubicación del proyecto en tu PC"));
children.push(P("Carpeta raíz del proyecto local:"));
children.push(...codeBlock(`C:\\Users\\jose.cortesh\\OneDrive - Colegio de Estudios Superiores de Administracion\\Escritorio\\Gemelo digital\\GEMELO-DIGITAL-V2`));
children.push(P("Subcarpetas importantes dentro del proyecto:"));
children.push(table2col([
  ["Backend (Python)", "GEMELO-DIGITAL-V2\\gemelo-digital-backend\\"],
  ["Frontend (React)", "GEMELO-DIGITAL-V2\\gemelo-digital-frontend\\gemelo-frontend\\"],
  ["Workflows GitHub Actions", "GEMELO-DIGITAL-V2\\.github\\workflows\\"],
  ["Documentación", "GEMELO-DIGITAL-V2\\docs\\"],
  ["Documento Word maestro", "GEMELO-DIGITAL-V2\\docs\\Gemelo-Digital-Documentacion-Completa.docx"],
  ["Documento Markdown maestro", "GEMELO-DIGITAL-V2\\docs\\PROYECTO-GEMELO-DIGITAL-COMPLETO.md"],
  ["Guía del scheduler", "GEMELO-DIGITAL-V2\\docs\\setup-scheduler.md"],
  ["Migraciones Alembic", "GEMELO-DIGITAL-V2\\gemelo-digital-backend\\alembic\\versions\\"],
  ["Modelos DB (SQLAlchemy)", "GEMELO-DIGITAL-V2\\gemelo-digital-backend\\app\\db\\models.py"],
  ["Configuración Docker", "GEMELO-DIGITAL-V2\\gemelo-digital-backend\\Dockerfile"],
  ["Script de arranque (migraciones)", "GEMELO-DIGITAL-V2\\gemelo-digital-backend\\start.sh"],
  ["Backup local del .env", "GEMELO-DIGITAL-V2\\gemelo-digital-backend\\.env (NO commiteado, gitignoreado)"],
]));

children.push(H2("17.2 GitHub — URLs completas"));

children.push(H3("Tu repo (donde está el código de producción)"));
children.push(table2col([
  ["Página principal", "https://github.com/JCortes87/proyecto-gemelos-digitales-JC"],
  ["URL HTTPS para clonar", "https://github.com/JCortes87/proyecto-gemelos-digitales-JC.git"],
  ["URL SSH para clonar", "git@github.com:JCortes87/proyecto-gemelos-digitales-JC.git"],
  ["Branch main (production)", "https://github.com/JCortes87/proyecto-gemelos-digitales-JC/tree/main"],
  ["Branch sync/upstream-abril-2026", "https://github.com/JCortes87/proyecto-gemelos-digitales-JC/tree/sync/upstream-abril-2026"],
  ["Pestaña Actions (deploys)", "https://github.com/JCortes87/proyecto-gemelos-digitales-JC/actions"],
  ["Workflow deploy backend", "https://github.com/JCortes87/proyecto-gemelos-digitales-JC/actions/workflows/deploy-backend.yml"],
  ["Workflow deploy frontend", "https://github.com/JCortes87/proyecto-gemelos-digitales-JC/actions/workflows/deploy-frontend.yml"],
  ["Pull Requests", "https://github.com/JCortes87/proyecto-gemelos-digitales-JC/pulls"],
  ["Settings (configuración)", "https://github.com/JCortes87/proyecto-gemelos-digitales-JC/settings"],
  ["Collaborators (dar acceso a otros)", "https://github.com/JCortes87/proyecto-gemelos-digitales-JC/settings/access"],
]));

children.push(H3("Documentos importantes en el repo (URLs directas)"));
children.push(table2col([
  ["README.md del backend", "https://github.com/JCortes87/proyecto-gemelos-digitales-JC/blob/main/gemelo-digital-backend/README.MD"],
  ["Documento Word maestro (raw para descargar)", "https://github.com/JCortes87/proyecto-gemelos-digitales-JC/raw/main/docs/Gemelo-Digital-Documentacion-Completa.docx"],
  ["Documento Markdown maestro (vista)", "https://github.com/JCortes87/proyecto-gemelos-digitales-JC/blob/main/docs/PROYECTO-GEMELO-DIGITAL-COMPLETO.md"],
  ["Guía del scheduler", "https://github.com/JCortes87/proyecto-gemelos-digitales-JC/blob/main/docs/setup-scheduler.md"],
  ["Workflow backend YAML", "https://github.com/JCortes87/proyecto-gemelos-digitales-JC/blob/main/.github/workflows/deploy-backend.yml"],
  ["Workflow frontend YAML", "https://github.com/JCortes87/proyecto-gemelos-digitales-JC/blob/main/.github/workflows/deploy-frontend.yml"],
]));

children.push(H3("Repo del colaborador (solo referencia, NO empujar)"));
children.push(table2col([
  ["Página principal", "https://github.com/juandavid639/Proyecto-Gemelos-Digitales"],
  ["URL HTTPS para fetch", "https://github.com/juandavid639/Proyecto-Gemelos-Digitales.git"],
  ["Branch main del colaborador", "https://github.com/juandavid639/Proyecto-Gemelos-Digitales/tree/main"],
]));

children.push(H3("Repo fork inicial (archivado)"));
children.push(table2col([
  ["Página principal", "https://github.com/JCortes87/gemelo-digital-backend-JC"],
  ["Estado", "Archivado — no usar"],
]));

children.push(H2("17.3 URLs de producción"));
children.push(table2col([
  ["Frontend público (lo que ven usuarios)", "https://gemelo.cesa.edu.co"],
  ["Backend API directo (para tests)", "https://ge-9d9d0220a8704eeabada1b951f3f2d37.ecs.us-east-1.on.aws"],
  ["Health check del backend", "https://ge-9d9d0220a8704eeabada1b951f3f2d37.ecs.us-east-1.on.aws/health"],
  ["Ping DB", "https://ge-9d9d0220a8704eeabada1b951f3f2d37.ecs.us-east-1.on.aws/debug/db"],
  ["Login Brightspace", "https://ge-9d9d0220a8704eeabada1b951f3f2d37.ecs.us-east-1.on.aws/auth/brightspace/login"],
  ["JWKS público (para LTI)", "https://ge-9d9d0220a8704eeabada1b951f3f2d37.ecs.us-east-1.on.aws/.well-known/jwks.json"],
]));

children.push(H2("17.4 AWS Console — URLs directas"));
children.push(P("Para acceder rápido a cada servicio:"));
children.push(table2col([
  ["Login a la cuenta CESA", "https://718624265053.signin.aws.amazon.com/console"],
  ["ECS — ver clúster default", "https://us-east-1.console.aws.amazon.com/ecs/v2/clusters/default"],
  ["ECS — servicio gemelo-digital-api", "https://us-east-1.console.aws.amazon.com/ecs/v2/clusters/default/services/gemelo-digital-api"],
  ["ECR — repositorio gemelo-backend", "https://us-east-1.console.aws.amazon.com/ecr/repositories/private/718624265053/gemelo-backend"],
  ["RDS — bases de datos", "https://us-east-1.console.aws.amazon.com/rds/home"],
  ["RDS — instancia gemelo-digital-db", "https://us-east-1.console.aws.amazon.com/rds/home?#database:id=gemelo-digital-db"],
  ["S3 — bucket gemelo-frontend-prod", "https://us-east-1.console.aws.amazon.com/s3/buckets/gemelo-frontend-prod"],
  ["CloudFront — todas las distribuciones", "https://us-east-1.console.aws.amazon.com/cloudfront/v4/home"],
  ["CloudFront — distribución E32WDBCT7SFCRD", "https://us-east-1.console.aws.amazon.com/cloudfront/v4/home#/distributions/E32WDBCT7SFCRD"],
  ["CloudWatch — log groups", "https://us-east-1.console.aws.amazon.com/cloudwatch/home#logsV2:log-groups"],
  ["CloudWatch — logs del backend", "https://us-east-1.console.aws.amazon.com/cloudwatch/home#logsV2:log-groups/log-group/$252Faws$252Fecs$252Fdefault$252Fgemelo-digital-api-cbc4"],
  ["IAM — usuarios", "https://us-east-1.console.aws.amazon.com/iam/home#/users"],
  ["IAM — roles", "https://us-east-1.console.aws.amazon.com/iam/home#/roles"],
  ["IAM — rol GemeloDigitalDeployerRole", "https://us-east-1.console.aws.amazon.com/iam/home#/roles/details/GemeloDigitalDeployerRole"],
  ["IAM — policies", "https://us-east-1.console.aws.amazon.com/iam/home#/policies"],
  ["IAM — Identity Providers (OIDC)", "https://us-east-1.console.aws.amazon.com/iam/home#/identity_providers"],
]));

children.push(H2("17.5 Identificadores AWS importantes (ARNs y IDs)"));
children.push(table2col([
  ["AWS Account ID", "718624265053"],
  ["Región principal", "us-east-1 (Virginia)"],
  ["ECS Cluster name", "default"],
  ["ECS Service name", "gemelo-digital-api"],
  ["ECS Task Definition family", "default-gemelo-digital-api"],
  ["ECR Repository name", "gemelo-backend"],
  ["ECR Repository URI", "718624265053.dkr.ecr.us-east-1.amazonaws.com/gemelo-backend"],
  ["RDS Instance ID", "gemelo-digital-db"],
  ["RDS Endpoint", "gemelo-digital-db.crp1lzwejl3x.us-east-1.rds.amazonaws.com"],
  ["S3 Bucket name", "gemelo-frontend-prod"],
  ["CloudFront Distribution ID", "E32WDBCT7SFCRD"],
  ["CloudFront Domain", "gemelo.cesa.edu.co"],
  ["IAM Role ARN", "arn:aws:iam::718624265053:role/GemeloDigitalDeployerRole"],
  ["IAM Policy name", "GemeloDigitalDeployerPolicy"],
  ["OIDC Provider ARN", "arn:aws:iam::718624265053:oidc-provider/token.actions.githubusercontent.com"],
  ["CloudWatch Log Group", "/aws/ecs/default/gemelo-digital-api-cbc4"],
]));

children.push(H2("17.6 Brightspace — URLs y datos"));
children.push(table2col([
  ["Brightspace CESA", "https://cesa.brightspace.com"],
  ["OAuth Auth URL", "https://auth.brightspace.com/oauth2/auth"],
  ["OAuth Token URL", "https://auth.brightspace.com/core/connect/token"],
  ["JWKS de Brightspace (para LTI)", "https://cesa.brightspace.com/d2l/.well-known/jwks"],
  ["LTI Authenticate endpoint", "https://cesa.brightspace.com/d2l/lti/authenticate"],
]));

children.push(H2("17.7 Comandos git de uso frecuente"));
children.push(P("Lista de comandos útiles para operar el proyecto:"));

children.push(H3("Sincronizar con tu repo"));
children.push(code("git pull origin main"));
children.push(P("Trae los últimos cambios desde tu repo en GitHub."));

children.push(H3("Ver el estado de los remotes"));
children.push(code("git remote -v"));
children.push(P("Confirma que origin apunta a tu repo y colaborador está bloqueado."));

children.push(H3("Ver si JD pusheó algo nuevo"));
children.push(code("git fetch colaborador && git log HEAD..colaborador/main --oneline"));
children.push(P("Fetch trae los datos sin tocar tu trabajo. Después el log muestra commits que JD tiene y tú no."));

children.push(H3("Ver las últimas corridas de CI/CD"));
children.push(code("Visitar https://github.com/JCortes87/proyecto-gemelos-digitales-JC/actions"));

children.push(H3("Crear un branch nuevo para trabajar"));
children.push(code("git checkout -b fix/algun-bug"));
children.push(P("Crea y se mueve a un branch nuevo derivado del actual."));

children.push(H3("Hacer un commit"));
children.push(code(`git add <archivos>
git commit -m "descripcion del cambio"
git push origin <nombre-del-branch>`));

children.push(new Paragraph({ children: [new PageBreak()] }));

// Renombrar la sección "Apéndices" para que quede como 18
children.push(H1("18. Apéndices"));

children.push(H2("18.1 Flujo completo de un request"));
children.push(P("Para entender cómo viaja un request desde el navegador hasta la respuesta:"));
children.push(...codeBlock(`1. Usuario abre https://gemelo.cesa.edu.co
              ▼
2. CloudFront sirve index.html desde S3
              ▼
3. Browser carga el JS de React
              ▼
4. App detecta que no hay sesión → muestra LoginScreen
              ▼
5. Usuario click "Login Brightspace"
              ▼
6. Frontend redirige a /auth/brightspace/login (popup OAuth)
              ▼
7. Backend redirige a Brightspace OAuth + Microsoft SSO
              ▼
8. Usuario autentica en Microsoft
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
16. Backend lee desde Postgres (path rápido)
    o desde Brightspace (fallback si datos viejos)
              ▼
17. Backend devuelve JSON con métricas
              ▼
18. Frontend renderiza dashboard`));

children.push(H2("18.2 Glosario de términos"));
children.push(table2col([
  ["LTI 1.3", "Learning Tools Interoperability. Estándar para embeber herramientas externas en LMS."],
  ["Brightspace", "LMS desarrollado por D2L, usado por CESA."],
  ["orgUnitId", "Identificador único de un curso en Brightspace (ej. 41742)."],
  ["OAuth 2.0", "Protocolo de autorización. Flujo usado: Authorization Code."],
  ["ECS Fargate", "Servicio de containers serverless de AWS (no manejas servers)."],
  ["OIDC", "OpenID Connect. Usado por GitHub Actions para autenticarse con AWS sin Access Keys."],
  ["Snapshot", "Registro consolidado de métricas de un estudiante en un curso en un momento dado."],
  ["Gemelo Digital", "Representación virtual del progreso académico de un estudiante. Nombre del proyecto."],
  ["DXA", "Document XML Architecture units. 1440 DXA = 1 pulgada en formato DOCX."],
  ["Taskdef", "Task Definition de ECS. Define qué imagen, qué env vars, qué CPU/memoria usa el container."],
  ["Revision", "Versión del taskdef. Cada vez que cambias algo se crea una revisión nueva."],
  ["IAM Role", "Rol de identidad en AWS. Define qué permisos tiene quien lo asume."],
  ["SHA del commit", "Hash único que identifica un commit en git (ej. be945ab)."],
]));

children.push(H2("18.3 Lista de archivos importantes en el repo"));
children.push(table2col([
  ["docs/PROYECTO-GEMELO-DIGITAL-COMPLETO.md", "Versión Markdown de este documento"],
  ["docs/setup-scheduler.md", "Guía para configurar el scheduler en AWS"],
  ["gemelo-digital-backend/main.py", "Entry point del backend FastAPI"],
  ["gemelo-digital-backend/Dockerfile", "Definición de la imagen Docker"],
  ["gemelo-digital-backend/start.sh", "Script que corre migraciones antes de uvicorn"],
  ["gemelo-digital-backend/requirements.txt", "Dependencias Python"],
  ["gemelo-digital-backend/alembic.ini", "Configuración de Alembic"],
  ["gemelo-digital-backend/alembic/versions/", "Migraciones de la base de datos"],
  ["gemelo-digital-backend/app/db/models.py", "Schema de tablas (SQLAlchemy)"],
  ["gemelo-digital-backend/app/services/", "Lógica de negocio modular"],
  ["gemelo-digital-frontend/gemelo-frontend/package.json", "Dependencias y scripts del frontend"],
  ["gemelo-digital-frontend/gemelo-frontend/vite.config.js", "Configuración del bundler Vite"],
  ["gemelo-digital-frontend/gemelo-frontend/src/App.jsx", "Componente raíz del SPA"],
  ["gemelo-digital-frontend/gemelo-frontend/src/components/", "Componentes React reutilizables"],
  ["gemelo-digital-frontend/gemelo-frontend/src/context/", "Contextos React globales"],
  ["gemelo-digital-frontend/gemelo-frontend/src/pages/", "Pantallas principales"],
  ["gemelo-digital-frontend/gemelo-frontend/src/hooks/", "Hooks personalizados"],
  [".github/workflows/deploy-backend.yml", "Workflow CI/CD del backend"],
  [".github/workflows/deploy-frontend.yml", "Workflow CI/CD del frontend"],
  [".gitignore", "Archivos a ignorar por git"],
]));

children.push(divider());
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 400 },
  children: [new TextRun({ text: "Fin del documento", italics: true })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 200 },
  children: [new TextRun({ text: "Última actualización: junio 2026", italics: true, size: 18 })],
}));

// ─────────────────────────────────────────────────────────
// Configuración del documento y export
// ─────────────────────────────────────────────────────────

const doc = new Document({
  creator: "Claude (asistente del proyecto Gemelo Digital)",
  title: "Documentación maestra de Gemelo Digital CESA",
  description: "Documento consolidado del estado, infraestructura y operación del proyecto Gemelo Digital",
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 22 } },
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Calibri", color: "1F4E79" },
        paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0 },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Calibri", color: "2E75B6" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 },
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Calibri", color: "2E75B6" },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 },
      },
      {
        id: "Heading4", name: "Heading 4", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, font: "Calibri", color: "404040" },
        paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 3 },
      },
    ],
  },
  numbering: {
    config: [{
      reference: "bullets",
      levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "○", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
        { level: 2, format: LevelFormat.BULLET, text: "▪", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 2160, hanging: 360 } } } },
      ],
    }],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({
            text: "Gemelo Digital CESA — Documentación maestra",
            size: 18, color: "808080", italics: true,
          })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Página ", size: 18, color: "808080" }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080" }),
            new TextRun({ text: " de ", size: 18, color: "808080" }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: "808080" }),
          ],
        })],
      }),
    },
    children: children,
  }],
});

// Guardar
const outputPath = path.join(__dirname, "..", "Gemelo-Digital-Documentacion-Completa.docx");

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outputPath, buffer);
  console.log("OK - Generado:", outputPath);
  console.log("Tamaño:", (buffer.length / 1024).toFixed(1), "KB");
}).catch(err => {
  console.error("ERROR:", err);
  process.exit(1);
});
