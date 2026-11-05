// Pomeriggio · plenaria proiettata (/plenaria-pomeriggio/:sid): una mappa per tavolo, tavoli in ordine 1–9.
// Solo conteggi per need, nessuna azienda né persona (MAP-06); need sempre in ordine di codice, nessuna classifica (R3);
// la mappa di un tavolo compare solo a voto chiuso (R4). Pagina distinta dalla plenaria della Map (R1).
import { api, esc, $, $$, demoBar } from './ui.js';
import { quadrantMap } from './charts.js';

const sid = location.pathname.split('/').pop();
const app = $('#app');
let P = null, idx = 0, grid = false;
const pct = (v) => `${Math.round(v * 100)}%`;

function mapOf(T, { compact = false } = {}) {
  const C = P.config.map;
  const pts = T.needs.filter((n) => n.votes > 0).map((n) => ({ x: n.x, y: n.y, letter: n.code, tone: n.few ? 'muted' : 'main',
    title: `${n.code} ${n.title}: ${n.votes} ${n.votes === 1 ? 'voto' : 'voti'}${n.few ? ' (pochi voti)' : ''}` }));
  return quadrantMap({ points: pts, compact, w: compact ? 420 : 620, h: compact ? 320 : 460,
    // un po' di spazio sopra il 100%: un need al massimo non finisce sotto il nome del quadrante
    x: { min: 0, max: 1, t: T.xThreshold ?? 0.4, label: C.x, fmt: pct }, y: { min: 0, max: 1.18, t: T.yThreshold, label: C.y, fmt: (v) => (v > 1 ? '' : pct(v)) },
    quads: { TR: C.quadrants.HH, BR: C.quadrants.HL, TL: C.quadrants.LH, BL: C.quadrants.LL } });
}
// distribuzioni con le etichette verbali, senza medie né punteggi (MAP-03)
const dist = (list, counts) => list.filter((x) => counts[x.value]).map((x) => `<span>${esc(x.label)} <b>${counts[x.value]}</b></span>`).join(' · ') || '—';
function tableOf(T) {
  return `<div class="tablewrap"><table><thead><tr><th>Need</th><th class="num">Voti</th><th>Priorità</th><th>Orizzonte</th></tr></thead><tbody>
    ${T.needs.map((n) => `<tr><td><span class="pm-code">${esc(n.code)}</span> <b>${esc(n.title)}</b>${n.descr ? `<div class="small muted">${esc(n.descr)}</div>` : ''}${n.few ? '<div class="small"><span class="tag">pochi voti</span></div>' : ''}</td>
      <td class="num">${n.votes ? n.votes : '<span class="muted">nessun voto</span>'}</td>
      <td class="pm-dist">${n.votes ? dist(P.config.priority, n.priority) : '—'}</td><td class="pm-dist">${n.votes ? dist(P.config.horizon, n.horizon) : '—'}</td></tr>`).join('')}
  </tbody></table></div>`;
}
const head = (T) => `<h2 style="margin:0">Tavolo ${esc(T.table.label)} · ${esc(T.table.title)}</h2>${T.table.theme ? `<p class="small muted" style="margin:2px 0 0">Tema del mattino: ${esc(T.table.theme)}</p>` : ''}`;
function slide(T) {
  if (T.pending) return `<div class="card">${head(T)}<div class="banner info" style="margin-top:14px">Voto in corso: la mappa del tavolo compare quando il voto si chiude.</div></div>`;
  const zero = T.needs.filter((n) => !n.votes);
  return `<div class="card">${head(T)}
    <p class="small ink2" style="margin:8px 0 14px">${T.voters} ${T.voters === 1 ? 'persona ha votato' : 'persone hanno votato'}${T.none ? `, di cui ${T.none} senza scegliere nessun need` : ''}. Soglia orizzontale: ${pct(T.xThreshold ?? 0)}, la quota media attesa (2 voti diviso ${T.needs.length} need); soglia verticale: ${pct(T.yThreshold)}.</p>
    <div class="pm-slide"><div>${mapOf(T)}
      ${zero.length ? `<p class="small muted">Senza voti, quindi non sulla mappa: ${zero.map((n) => `${esc(n.code)} ${esc(n.title)}`).join(' · ')}.</p>` : ''}
      ${T.needs.some((n) => n.few) ? '<p class="small muted">Cerchio vuoto: pochi voti (1 o 2), la posizione verticale dipende da una o due persone.</p>' : ''}</div>
      <div>${tableOf(T)}</div></div></div>`;
}
function draw() {
  const T = P.tables;
  if (!T.length) { app.innerHTML = `<div class="card"><h1>${esc(P.session.title)} · pomeriggio</h1><p>Nessun tavolo creato.</p></div>`; return; }
  idx = Math.max(0, Math.min(idx, T.length - 1));
  app.innerHTML = `<div class="plhead"><h1>Dai tavoli · ${esc(P.session.title.split(' · ')[0])}</h1>
      <p>I need emersi ai tavoli: quanto sono condivisi e quanto sono prioritari per chi li ha scelti. Solo conteggi, nessun nome; i need sono in ordine di codice.</p></div>
    <div class="row between noprint" style="margin-bottom:14px"><div class="row" role="group" aria-label="Vista">
      <button type="button" class="sm ${grid ? 'ghost' : ''}" id="v1" aria-pressed="${!grid}">Un tavolo alla volta</button><button type="button" class="sm ${grid ? '' : 'ghost'}" id="vg" aria-pressed="${grid}">Tutti i tavoli</button></div>
      ${grid ? '' : `<div class="row"><button type="button" class="sm ghost" id="prev" ${idx ? '' : 'disabled'}>← Tavolo precedente</button><span class="small">${idx + 1} di ${T.length}</span><button type="button" class="sm ghost" id="next" ${idx < T.length - 1 ? '' : 'disabled'}>Tavolo successivo →</button></div>`}</div>
    ${grid ? `<div class="pm-grid">${T.map((t, i) => `<button type="button" class="card pm-cell" data-go="${i}">${head(t)}${t.pending ? '<p class="small muted">Voto in corso</p>' : mapOf(t, { compact: true })}</button>`).join('')}</div>` : slide(T[idx])}`;
  if ($('#v1')) $('#v1').onclick = () => { grid = false; draw(); };
  if ($('#vg')) $('#vg').onclick = () => { grid = true; draw(); };
  if ($('#prev')) $('#prev').onclick = () => { idx--; draw(); };
  if ($('#next')) $('#next').onclick = () => { idx++; draw(); };
  $$('[data-go]').forEach((b) => b.onclick = () => { idx = Number(b.dataset.go); grid = false; draw(); });
}
addEventListener('keydown', (e) => {
  if (grid || !P || e.target.closest('input, textarea')) return;
  if (e.key === 'ArrowRight' && idx < P.tables.length - 1) { idx++; draw(); }
  if (e.key === 'ArrowLeft' && idx > 0) { idx--; draw(); }
});
try { P = await api(`/api/admin/sessions/${sid}/pm/plenary`); }
catch (e) { app.innerHTML = `<div class="card"><p>${esc(e.message)} · accedi prima da <a href="/admin">/admin</a>.</p></div>`; throw e; }
if (P.session.demo) demoBar();
const sub = document.querySelector('.topbar .sub'); if (sub) sub.textContent = `${P.session.title} · pomeriggio · solo conteggi anonimi`;
draw();
// i tavoli che chiudono il voto compaiono senza ricaricare la pagina
setInterval(async () => { try { const x = await api(`/api/admin/sessions/${sid}/pm/plenary`); if (JSON.stringify(x.tables.map((t) => [t.table.status, t.voters])) !== JSON.stringify(P.tables.map((t) => [t.table.status, t.voters]))) { P = x; draw(); } } catch { /* rete: si riprova */ } }, 6000);
