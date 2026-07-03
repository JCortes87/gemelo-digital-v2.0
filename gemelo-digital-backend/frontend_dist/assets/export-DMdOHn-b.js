import{s as e,t}from"./colors-hkeZPKU9.js";function n(n){let r=e(n);return r===`alto`?t.critical:r===`medio`?t.watch:r===`bajo`?t.ok:t.pending}function r(e){if(e==null)return``;let t=String(e);return/[",\n\r]/.test(t)?`"${t.replace(/"/g,`""`)}"`:t}function i(e,t){let n=URL.createObjectURL(e),r=document.createElement(`a`);r.href=n,r.download=t,document.body.appendChild(r),r.click(),document.body.removeChild(r),setTimeout(()=>URL.revokeObjectURL(n),100)}function a(e,t,n){let a=`﻿`+[(t||[]).map(r).join(`,`),...(n||[]).map(e=>(e||[]).map(r).join(`,`))].join(`\r
`);i(new Blob([a],{type:`text/csv;charset=utf-8`}),e)}const o=[{key:`userId`,label:`ID`,value:e=>e.userId},{key:`displayName`,label:`Nombre`,value:e=>e.displayName},{key:`email`,label:`Email`,value:e=>e.email||``},{key:`grade10`,label:`Nota (0-10)`,value:e=>e.currentPerformancePct==null?``:(e.currentPerformancePct/10).toFixed(1)},{key:`coveragePct`,label:`Cobertura %`,value:e=>e.coveragePct==null?``:e.coveragePct.toFixed(1)},{key:`risk`,label:`Riesgo`,value:e=>e.risk||``},{key:`route`,label:`Ruta`,value:e=>e.route?.title||``},{key:`criticalMacro`,label:`RA crítico`,value:e=>e.mostCriticalMacro?.code||``},{key:`pendingPct`,label:`Pendientes %`,value:e=>e.pendingSubmittedWeightPct==null?``:e.pendingSubmittedWeightPct.toFixed(1)},{key:`overduePct`,label:`Vencidos %`,value:e=>e.notSubmittedWeightPct==null?e.overdueWeightPct==null?``:e.overdueWeightPct.toFixed(1):e.notSubmittedWeightPct.toFixed(1)}];function s(e,t,n={}){let a=Array.isArray(e)?e:[],{columns:s,filterDescription:c}=n||{},l=Array.isArray(s)&&s.length?s.map(e=>o.find(t=>t.key===e)).filter(Boolean):o,u=[l.map(e=>e.label).map(r).join(`,`)];for(let e of a)u.push(l.map(t=>t.value(e)).map(r).join(`,`));let d=`﻿`+u.join(`\r
`),f=new Blob([d],{type:`text/csv;charset=utf-8`}),p=new Date().toISOString().slice(0,10);i(f,`gemelo_${String(t?.Name||`curso`).replace(/[^\w]+/g,`_`).slice(0,40)}${c?`_${String(c).replace(/[^\w]+/g,`_`).slice(0,30)}`:``}_${p}.csv`)}function c(t,r,i){let a=Array.isArray(t)?t:[],o=new Date().toLocaleString(`es-CO`),s=r?.Name||`Curso`,c=a.length,l=i?.courseGradebook?.avgCurrentPerformancePct,u=i?.courseGradebook?.avgCoveragePct,f={alto:0,medio:0,bajo:0,pending:0};for(let t of a)f[e(t.currentPerformancePct)]++;let p=a.map(e=>{let t=e.currentPerformancePct==null?`—`:(e.currentPerformancePct/10).toFixed(1),r=e.coveragePct==null?`—`:e.coveragePct.toFixed(1)+`%`,i=e.risk||`—`,a=n(e.currentPerformancePct);return`<tr>
      <td style="font-family:monospace;color:#5A6580">${e.userId}</td>
      <td>${d(e.displayName||``)}</td>
      <td style="text-align:right;font-weight:900;color:${a}">${t}</td>
      <td style="text-align:right">${r}</td>
      <td style="text-align:center;text-transform:uppercase;font-size:10px;font-weight:800">${i}</td>
      <td style="font-size:11px;color:#5A6580">${d(e.route?.title||``)}</td>
    </tr>`}).join(``),m=`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Reporte ${d(s)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Manrope, sans-serif; padding: 30px 40px; color: #0F1827; max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.02em; }
  .sub { font-size: 12px; color: #5A6580; margin-bottom: 24px; }
  .stats { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
  .stat { flex: 1; min-width: 140px; padding: 14px; border: 1px solid #E4E8EF; border-radius: 10px; }
  .stat-label { font-size: 10px; color: #5A6580; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
  .stat-value { font-size: 28px; font-weight: 900; margin-top: 4px; letter-spacing: -0.02em; }
  .risk-grid { display: flex; gap: 8px; margin-bottom: 24px; }
  .risk-item { flex: 1; padding: 10px; border-radius: 8px; text-align: center; }
  .risk-alto { background: #FEF3F2; color: #B42318; }
  .risk-medio { background: #FFF8ED; color: #9A3412; }
  .risk-bajo { background: #ECFDF3; color: #1B5E20; }
  .risk-pending { background: #F1F3F7; color: #5A6580; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; background: #F2F4F8; padding: 8px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #5A6580; border-bottom: 2px solid #E4E8EF; }
  td { padding: 6px 10px; border-bottom: 1px solid #E4E8EF; }
  tr:nth-child(even) { background: #FAFBFD; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #E4E8EF; font-size: 10px; color: #5A6580; text-align: center; }
  @media print {
    body { padding: 20px; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <h1>G.D · Reporte de Curso</h1>
  <div class="sub">${d(s)} · Generado ${d(o)}</div>

  <div class="stats">
    <div class="stat">
      <div class="stat-label">Estudiantes</div>
      <div class="stat-value">${c}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Nota promedio</div>
      <div class="stat-value">${l==null?`—`:(l/10).toFixed(1)}<span style="font-size:14px;color:#5A6580">/10</span></div>
    </div>
    <div class="stat">
      <div class="stat-label">Cobertura</div>
      <div class="stat-value">${u==null?`—`:u.toFixed(1)+`%`}</div>
    </div>
  </div>

  <div class="risk-grid">
    <div class="risk-item risk-alto">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase">Alto</div>
      <div style="font-size:22px;font-weight:900">${f.alto}</div>
    </div>
    <div class="risk-item risk-medio">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase">Medio</div>
      <div style="font-size:22px;font-weight:900">${f.medio}</div>
    </div>
    <div class="risk-item risk-bajo">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase">Bajo</div>
      <div style="font-size:22px;font-weight:900">${f.bajo}</div>
    </div>
    <div class="risk-item risk-pending">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase">Sin datos</div>
      <div style="font-size:22px;font-weight:900">${f.pending}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>ID</th><th>Nombre</th><th style="text-align:right">Nota</th><th style="text-align:right">Cobertura</th><th style="text-align:center">Riesgo</th><th>Ruta</th>
      </tr>
    </thead>
    <tbody>${p}</tbody>
  </table>

  <div class="footer">
    CESA · G.D 2026.7.3 · Reporte generado automáticamente
  </div>

  <script>
    // Auto-open print dialog after load (user can cancel)
    setTimeout(() => { window.print(); }, 400);
  <\/script>
</body>
</html>`,h=window.open(``,`_blank`);if(!h){console.warn(`No se pudo abrir la ventana de reporte. Revisa tu bloqueador de pop-ups.`);return}h.document.write(m),h.document.close()}function l(e){if(!e)return`#5A6580`;let t=String(e).toLowerCase().normalize(`NFD`).replace(/[\u0300-\u036f]/g,``);return t.includes(`avanz`)||t.includes(`excelent`)||t.includes(`superior`)||t.includes(`logrado`)?`#16a34a`:t.includes(`interm`)||t.includes(`satisf`)||t.includes(`aceptable`)||t.includes(`proficien`)?`#0B5FFF`:t.includes(`basi`)||t.includes(`elemental`)||t.includes(`suficiente`)||t.includes(`developing`)?`#d97706`:t.includes(`inicial`)||t.includes(`no cumple`)||t.includes(`deficiente`)||t.includes(`insuficiente`)||t.includes(`beginning`)?`#B42318`:`#5A6580`}function u({feedback:e={},evidenceName:t=``,studentName:n=``,studentId:r=``,courseInfo:i=null,downloadUrl:a=``}){let o=new Date().toLocaleDateString(`es-CO`,{year:`numeric`,month:`long`,day:`numeric`}),s=e.submittedAt?new Date(e.submittedAt).toLocaleDateString(`es-CO`,{year:`numeric`,month:`long`,day:`numeric`}):null,c=i?.Name||`Curso`,u=i?.Code||``,f=Array.isArray(e.rubrics)?e.rubrics:[],p=e.score,m=e.outOf;if((p==null||m==null||!(m>0))&&f.length)for(let e of f){let t=e?.score,n=e?.outOf;if(t!=null&&n!=null&&n>0){p=t,m=n;break}}let h=p!=null&&m!=null&&m>0?(p/m*10).toFixed(1):null,g=p!=null&&m!=null&&m>0?Math.min(100,p/m*100):null,_=`#5A6580`;g!=null&&(_=g>=80?`#16a34a`:g>=60?`#0B5FFF`:g>=40?`#d97706`:`#B42318`);let v=e.feedbackText||``,y=e.assignmentInstructions||``,b=e.submissionComment||``,x=Array.isArray(e.files)?e.files:[],S=f,C=`${window.location.origin}/cesa-logo-white.png`,w=S.map(e=>{let t=e.score!=null&&e.outOf!=null&&e.outOf>0?Math.min(100,e.score/e.outOf*100):null;l(e.level);let n=(Array.isArray(e.criteria)?e.criteria:[]).map(e=>{let t=l(e.level);return`
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #E4E8EF;font-size:11px;font-weight:700;color:#0F1827;width:35%;border-left:3px solid ${t}">${d(e.name||``)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #E4E8EF;text-align:center;width:18%">
            ${e.level?`<span style="font-size:9px;font-weight:800;padding:2px 8px;border-radius:99px;background:${t}22;color:${t};border:1px solid ${t}55;text-transform:uppercase">${d(e.level)}</span>`:`—`}
          </td>
          <td style="padding:8px 10px;border-bottom:1px solid #E4E8EF;text-align:right;font-family:ui-monospace,monospace;font-size:13px;font-weight:900;color:${t};width:8%">${e.points==null?`—`:e.points}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #E4E8EF;font-size:10px;color:#5A6580;line-height:1.4">${e.levelDescription||e.comment?`${e.levelDescription?`<div style="color:#0F1827">${e.levelDescription}</div>`:``}${e.comment?`<div style="margin-top:${e.levelDescription?`4px`:`0`};color:#5A6580">${e.comment}</div>`:``}`:`<span style="color:#B0B7C3;font-style:italic">Sin comentario</span>`}</td>
        </tr>
      `}).join(``);return`
      <div class="rubric-block" style="margin-top:18px;border:1px solid #D6DCE5;border-radius:8px;overflow:hidden;page-break-inside:avoid">
        <div style="padding:10px 14px;background:linear-gradient(135deg, #0B2D5C 0%, #0B5FFF 100%);color:#fff;display:flex;align-items:center;gap:12px">
          <div style="flex:1">
            <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;opacity:0.85">📋 Rúbrica utilizada</div>
            <div style="font-size:14px;font-weight:800;margin-top:2px">${d(e.name||`Sin nombre`)}</div>
          </div>
          ${e.score==null?``:`
            <div style="text-align:right">
              <div style="font-family:ui-monospace,monospace;font-size:18px;font-weight:900">${e.score}${e.outOf==null?``:`<span style="font-size:11px;opacity:0.75;font-weight:600"> / ${e.outOf}</span>`}</div>
              ${e.level?`<div style="font-size:9px;font-weight:800;margin-top:3px;padding:2px 8px;border-radius:99px;background:rgba(255,255,255,0.18);display:inline-block;text-transform:uppercase">${d(e.level)}</div>`:``}
              ${t==null?``:`<div style="height:3px;background:rgba(255,255,255,0.25);border-radius:99px;overflow:hidden;margin-top:5px;width:80px;margin-left:auto"><div style="height:100%;width:${t}%;background:#fff;border-radius:99px"></div></div>`}
            </div>`}
        </div>
        ${Array.isArray(e.criteria)&&e.criteria.length>0?`
          <table style="width:100%;border-collapse:collapse;background:#fff">
            <thead>
              <tr style="background:#F2F4F8">
                <th style="text-align:left;padding:6px 10px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:#5A6580;border-bottom:2px solid #E4E8EF">Criterio</th>
                <th style="text-align:center;padding:6px 10px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:#5A6580;border-bottom:2px solid #E4E8EF">Nivel</th>
                <th style="text-align:right;padding:6px 10px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:#5A6580;border-bottom:2px solid #E4E8EF">Pts</th>
                <th style="text-align:left;padding:6px 10px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:#5A6580;border-bottom:2px solid #E4E8EF">Comentario</th>
              </tr>
            </thead>
            <tbody>${n}</tbody>
          </table>`:`<div style="padding:14px;font-size:11px;color:#5A6580;font-style:italic;text-align:center">Rúbrica sin criterios evaluados.</div>`}
      </div>
    `}).join(``),T=x.length>0?`
    <div class="section" style="margin-top:18px">
      <div class="section-title">📎 Archivos adjuntos del docente (${x.length})</div>
      <ul style="margin:6px 0 0;padding-left:18px;font-size:11px;color:#0F1827;line-height:1.6">
        ${x.map(e=>`<li>${d(e.FileName||e.Name||`Archivo`)}</li>`).join(``)}
      </ul>
    </div>
  `:``,E=`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Retroalimentación · ${d(n)} · ${d(t)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Manrope, sans-serif;
    color: #0F1827;
    margin: 0;
    padding: 0;
    background: #fff;
  }
  .page { max-width: 800px; margin: 0 auto; padding: 0 32px 32px; }
  .institutional-header {
    background: linear-gradient(135deg, #0B2D5C 0%, #0B5FFF 100%);
    color: #fff;
    padding: 22px 32px;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .institutional-header img { height: 52px; width: auto; }
  .institutional-header .h-text { flex: 1; }
  .institutional-header .h-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; opacity: 0.85; }
  .institutional-header .h-sub { font-size: 18px; font-weight: 800; margin-top: 4px; letter-spacing: -0.01em; }
  .institutional-header .h-meta { font-size: 10px; opacity: 0.85; margin-top: 4px; }

  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 18px;
  }
  .info-card {
    border: 1px solid #E4E8EF;
    border-radius: 8px;
    padding: 12px 14px;
    background: #FAFBFD;
  }
  .info-label { font-size: 9px; font-weight: 800; color: #5A6580; text-transform: uppercase; letter-spacing: 0.08em; }
  .info-value { font-size: 13px; font-weight: 700; color: #0F1827; margin-top: 3px; line-height: 1.3; }

  .grade-card {
    border: 2px solid #0B5FFF;
    border-radius: 10px;
    padding: 16px 20px;
    margin-bottom: 18px;
    background: linear-gradient(135deg, #EAF2FF 0%, #fff 100%);
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .grade-card .gc-label { font-size: 10px; font-weight: 800; color: #0B5FFF; text-transform: uppercase; letter-spacing: 0.08em; }
  .grade-card .gc-bar { height: 6px; background: rgba(11,95,255,0.18); border-radius: 99px; overflow: hidden; margin-top: 8px; }
  .grade-card .gc-bar-inner { height: 100%; background: #0B5FFF; border-radius: 99px; }
  .grade-card .gc-value { font-family: ui-monospace, monospace; font-size: 38px; font-weight: 900; color: #0B5FFF; line-height: 1; }
  .grade-card .gc-outof { font-size: 14px; color: #5A6580; font-weight: 600; }
  .grade-card .gc-grade10 { font-size: 11px; color: #5A6580; margin-top: 4px; font-weight: 700; }

  .section { margin-top: 18px; page-break-inside: avoid; }
  .section-title {
    font-size: 10px;
    font-weight: 800;
    color: #0B2D5C;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border-bottom: 2px solid #0B5FFF;
    padding-bottom: 4px;
    margin-bottom: 8px;
  }
  .section-body {
    font-size: 12px;
    line-height: 1.6;
    color: #0F1827;
    padding: 10px 14px;
    background: #FAFBFD;
    border: 1px solid #E4E8EF;
    border-radius: 8px;
    border-left: 3px solid #0B5FFF;
  }
  .section-body img { max-width: 100%; height: auto; }
  .section-body p { margin: 0 0 8px; }
  .section-body p:last-child { margin-bottom: 0; }

  .download-link {
    display: inline-block;
    padding: 10px 16px;
    background: #0B5FFF;
    color: #fff !important;
    text-decoration: none;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 700;
    word-break: break-all;
  }
  .download-note { font-size: 10px; color: #5A6580; margin-top: 6px; line-height: 1.4; }

  .footer {
    margin-top: 32px;
    padding: 12px 32px;
    border-top: 1px solid #E4E8EF;
    font-size: 9px;
    color: #5A6580;
    text-align: center;
    line-height: 1.5;
  }

  @media print {
    @page { margin: 1.2cm; size: A4; }
    .institutional-header { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .grade-card, .rubric-block, .download-link, .section-body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .no-print { display: none !important; }
    body { padding: 0; }
  }
</style>
</head>
<body>
  <div class="institutional-header">
    <img src="${C}" alt="CESA" onerror="this.style.display='none'" />
    <div class="h-text">
      <div class="h-title">Colegio de Estudios Superiores de Administración</div>
      <div class="h-sub">G.D · Reporte de Retroalimentación</div>
      <div class="h-meta">Generado el ${d(o)}</div>
    </div>
  </div>

  <div class="page">

    <div class="info-grid">
      <div class="info-card">
        <div class="info-label">Estudiante</div>
        <div class="info-value">${d(n||`—`)}</div>
        ${r?`<div style="font-size:10px;color:#5A6580;margin-top:2px;font-family:ui-monospace,monospace">ID ${d(String(r))}</div>`:``}
      </div>
      <div class="info-card">
        <div class="info-label">Curso</div>
        <div class="info-value">${d(c)}</div>
        ${u?`<div style="font-size:10px;color:#5A6580;margin-top:2px">${d(u)}</div>`:``}
      </div>
      <div class="info-card" style="grid-column:1/-1;display:flex;align-items:center;gap:12px">
        <div style="flex:1;min-width:0">
          <div class="info-label">Entrega</div>
          <div class="info-value">${d(t||`—`)}</div>
          ${s?`<div style="font-size:10px;color:#5A6580;margin-top:2px">Fecha de entrega: ${d(s)}</div>`:``}
        </div>
        ${h==null?``:`
          <div style="flex-shrink:0;text-align:center;padding:8px 14px;border-radius:12px;background:${_};color:#fff;min-width:74px;-webkit-print-color-adjust:exact;print-color-adjust:exact">
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;opacity:0.9">Nota</div>
            <div style="font-size:22px;font-weight:900;line-height:1.1">${h}</div>
            <div style="font-size:9px;font-weight:700;opacity:0.9">/ 10</div>
          </div>
        `}
      </div>
    </div>

    ${y?`
      <div class="section">
        <div class="section-title">📌 Instrucciones de la tarea</div>
        <div class="section-body">${y}</div>
      </div>
    `:``}

    ${a?`
      <div class="section">
        <div class="section-title">📄 Documento entregado por el estudiante</div>
        <div style="padding:10px 14px;background:#FAFBFD;border:1px solid #E4E8EF;border-radius:8px">
          <a href="${d(a)}" class="download-link" target="_blank" rel="noopener">⬇ Descargar entrega</a>
          <div class="download-note">El documento se abrirá/descargará desde el sistema. Conserve este enlace para acceder al archivo original del estudiante.</div>
        </div>
      </div>
    `:``}

    ${b?`
      <div class="section">
        <div class="section-title">📝 Comentario del estudiante (entrega)</div>
        <div class="section-body" style="border-left-color:#16a34a">${b}</div>
      </div>
    `:``}

    <div class="section">
      <div class="section-title">💬 Comentario general del docente</div>
      ${v?`<div class="section-body">${v}</div>`:`<div class="section-body" style="border-left-color:#B0B7C3;color:#5A6580;font-style:italic">No se realizó un comentario general del docente para esta entrega.</div>`}
    </div>

    ${S.length>0?`
      <div class="section">
        <div class="section-title">🎯 Evaluación detallada por rúbrica</div>
        ${w}
      </div>
    `:``}

    ${T}

    ${p==null&&S.length===0&&!y&&!b&&x.length===0&&!v?`
      <div style="padding:32px;text-align:center;color:#5A6580;font-size:12px;font-style:italic;background:#FAFBFD;border-radius:8px;border:1px dashed #E4E8EF">
        Esta entrega no tiene retroalimentación registrada en el sistema.
      </div>
    `:``}

  </div>

  <div class="footer">
    CESA · G.D · Reporte de retroalimentación generado automáticamente<br/>
    Este documento es de uso académico interno y contiene información confidencial del estudiante.
  </div>

  <script>
    // Esperar a que carguen imágenes (logo) antes de imprimir
    function startPrint() { setTimeout(function() { window.print(); }, 250); }
    if (document.readyState === "complete") { startPrint(); }
    else { window.addEventListener("load", startPrint); }
  <\/script>
</body>
</html>`,D=window.open(``,`_blank`);if(!D){alert(`No se pudo abrir la ventana del reporte. Revisa tu bloqueador de pop-ups.`);return}D.document.write(E),D.document.close()}function d(e){return String(e||``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`)}export{s as a,u as i,a as n,c as r,o as t};