import { api, esc, $, $$, toast, poll, phaseChips, PHASES, qrImg, qrLabeled, downloadQrPng, fmtDate, fmtScore, levelLabel } from './ui.js';

const app = $('#app');
let INST, SC, NET;
let stopPoll = null;

// ---------- Ambiente: Produzione o Prova (cookie del browser, letto anche dal server) ----------
const PROVA = /(?:^|;\s*)aito_mode=prova/.test(document.cookie);
function setEnv(env) {
  document.cookie = `aito_mode=${env === 'prova' ? 'prova' : 'prod'}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`;
  location.hash = '#/programma'; location.reload();
}

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const shortDate = (d) => (d ? `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}` : '');
const longDate = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const isoDay = (d) => d.toISOString().slice(0, 10);
const PHASE_LABEL = { preparazione: 'In preparazione', individuale: 'In sala: risposte individuali', confronto: 'In sala: confronto', consolidamento: 'In sala: consolidamento', chiusa: 'Chiusa' };
let SESSIONS = [];

async function boot() {
  const me = await api('/api/admin/me');
  if (!me.admin) return login();
  const i = await api('/api/instrument'); INST = i.instrument; SC = i.scoring;
  NET = await api('/api/admin/network');
  $('#logout').onclick = async () => { await api('/api/admin/logout', { method: 'POST' }); location.reload(); };
  $$('[data-env]').forEach((b) => { const on = (b.dataset.env === 'prova') === PROVA; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); b.onclick = () => { if (!on) setEnv(b.dataset.env); }; });
  $('#envswitch').classList.remove('hidden');
  if (PROVA) { document.body.classList.add('prova'); $('#provabar').classList.remove('hidden'); }
  addEventListener('hashchange', route);
  route();
}

function login() {
  $('#nav').classList.add('hidden'); $('#logout').classList.add('hidden');
  $('.layout').classList.add('solo');
  app.innerHTML = `<div class="card lift login"><h1>Console ELIS</h1><p class="ink2">Sessioni, aziende, benchmark e report del pilot AITO 3.</p>
    <label class="f" for="pw">Password</label><input type="password" id="pw" autocomplete="current-password" autofocus>
    <p class="small muted" style="margin-top:8px">La password iniziale è stampata nella finestra del terminale al primo avvio.</p>
    <button id="go" class="big">Entra</button></div>`;
  const go = async () => { try { await api('/api/admin/login', { method: 'POST', body: { password: $('#pw').value } }); location.reload(); } catch (e) { toast(e.message, true); } };
  $('#go').onclick = go; $('#pw').onkeydown = (e) => e.key === 'Enter' && go();
}

// ---------- Menu: segue il flusso della metodologia ----------
const calendar = () => SESSIONS.filter((s) => s.mode === 'workshop');
const adhoc = () => SESSIONS.filter((s) => s.mode === 'adhoc');
async function buildNav(view, arg) {
  SESSIONS = await api('/api/admin/sessions');
  const link = (href, label, active, extra = '') => `<a href="${href}" class="${active ? 'active' : ''} ${extra}" ${active ? 'aria-current="page"' : ''}>${label}</a>`;
  const sid = view === 'sessione' ? Number(String(arg || '').split('/')[0]) : null;
  const cur = SESSIONS.find((s) => s.id === sid);
  $('#nav').innerHTML = `
    ${link('#/programma', 'Programma', view === 'programma')}
    <div class="navgroup">Sessioni</div>
    ${calendar().map((s, i) => link(`#/sessione/${s.id}`, `<span class="navnum ph-${s.phase}" aria-hidden="true">${s.phase === 'chiusa' ? '✓' : i + 1}</span><span class="navtxt">${esc(INST.sessions.find((x) => x.id === s.base).name)}<small>${esc(shortDate(s.date))}${['individuale', 'confronto', 'consolidamento'].includes(s.phase) ? ' · in corso' : ''}</small></span>`, sid === s.id, 'navsess')).join('')}
    ${link('#/adhoc', `Sessioni ad hoc${adhoc().length ? ` <span class="navcount">${adhoc().length}</span>` : ''}`, view === 'adhoc' || (cur && cur.mode === 'adhoc'))}
    <div class="navgroup">Dopo le sessioni</div>
    ${link('#/report', 'Report e call con i leader', view === 'report')}
    ${link('#/commitment', 'Commitment e verifica', view === 'commitment')}
    <div class="navgroup">Anagrafiche</div>
    ${link('#/aziende', 'Aziende e referenti', view === 'aziende' || view === 'azienda')}
    <div class="navsep"></div>
    ${link('#/audit', 'Registro modifiche', view === 'audit', 'navsmall')}
    ${link('#/impostazioni', 'Impostazioni', view === 'impostazioni', 'navsmall')}`;
}

async function route() {
  if (stopPoll) { stopPoll(); stopPoll = null; }
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  let [view = 'programma', ...rest] = parts;
  view = (view || '').split('?')[0];
  if (!view || view === 'sessioni') view = 'programma';
  const arg = rest.join('/');
  await buildNav(view, arg);
  ({ programma: viewProgram, sessione: viewControl, adhoc: viewAdhoc, report: viewReports, commitment: viewCommitments, aziende: viewCompanies, azienda: viewCompany,
    benchmark: viewBenchmark, audit: viewAudit, impostazioni: viewSettings, qr: viewQr, tavolo: viewTableCard, tavoli: viewTables, mappe: viewMaps }[view] || viewProgram)(arg);
}

// Azioni condivise tra control room e pagina "Report e call"
async function releaseReport(sid, cid) {
  if (!confirm('Rilasciare il report? Viene salvata una copia che l\'azienda vede da ora in poi e che non cambierà più.')) return false;
  const url = `/api/admin/sessions/${sid}/companies/${cid}/release`;
  try { await api(url, { method: 'POST', body: {} }); toast('Report rilasciato'); return true; }
  catch (e) {
    if (e.status === 409 && confirm(`${e.message}\n\nRilasciare comunque, senza confronto con il benchmark?`)) {
      try { await api(url, { method: 'POST', body: { withoutBenchmark: true } }); toast('Report rilasciato'); return true; } catch (e2) { toast(e2.message, true); }
    } else if (e.status !== 409) toast(e.message, true);
  }
  return false;
}
async function noteCall(sid, c) {
  const note = prompt(`Esito della call con il leader: ${c.name}`, c.leader_call_note || '');
  if (note == null) return false;
  await api(`/api/admin/sessions/${sid}/companies/${c.id}/note`, { method: 'PUT', body: { note } }); toast('Esito annotato'); return true;
}
const benchUpToDate = (C) => {
  const lastCons = C.companies.filter((c) => c.consolidated_at).map((c) => c.consolidated_at).sort().pop() || null;
  const frozen = C.benchmark[0] || null;
  return !!frozen && (!lastCons || frozen.created_at >= lastCons);
};

// ---------- Programma: calendario e cose da fare ----------
async function viewProgram() {
  const cal = calendar();
  const ctrl = await Promise.all(SESSIONS.map((s) => api(`/api/admin/sessions/${s.id}/control`)));
  const byId = Object.fromEntries(ctrl.map((C) => [C.session.id, C]));
  const commits = await api('/api/admin/commitments');
  const today = isoDay(new Date());
  const next = cal.find((s) => s.phase !== 'chiusa');
  const live = SESSIONS.find((s) => ['individuale', 'confronto', 'consolidamento'].includes(s.phase));

  // ---- linea del tempo: le sessioni del calendario e l'allineamento finale (§14.1)
  const points = [...cal.map((s) => ({ date: s.date, s })), { date: '2027-09-30', final: true }].filter((p) => p.date);
  const t0 = new Date(points[0]?.date || today).getTime() - 20 * 864e5, t1 = new Date(points[points.length - 1]?.date || today).getTime() + 10 * 864e5;
  const pos = (d) => Math.max(0, Math.min(100, ((new Date(d).getTime() - t0) / (t1 - t0)) * 100));
  const timeline = `<div class="timeline" aria-label="Calendario del programma">
    <div class="tl-track"><i style="width:${pos(today)}%"></i></div>
    ${points.map((p, i) => p.final
      ? `<div class="tl-node final" style="left:${pos(p.date)}%"><span class="tl-dot"></span><div class="tl-lbl"><b>Allineamento finale</b><small>settembre 2027</small></div></div>`
      : `<a class="tl-node ph-${p.s.phase} ${next && p.s.id === next.id ? 'next' : ''}" style="left:${pos(p.date)}%" href="#/sessione/${p.s.id}"><span class="tl-dot">${p.s.phase === 'chiusa' ? '✓' : i + 1}</span>
          <div class="tl-lbl"><b>${esc(INST.sessions.find((x) => x.id === p.s.base).name)}</b><small>${esc(longDate(p.s.date))}</small><small class="tl-st">${esc(PHASE_LABEL[p.s.phase])}</small></div></a>`).join('')}
    <div class="tl-today" style="left:${pos(today)}%"><span>oggi</span></div></div>`;

  // ---- cose da fare, calcolate dai dati
  const todo = [];
  const add = (kind, html, href, label) => todo.push({ kind, html, href, label });
  if (live) add('now', `<b>${esc(live.title)}</b> è in corso: ${esc(PHASE_LABEL[live.phase].toLowerCase())}.`, `#/sessione/${live.id}/sala`, 'Gestisci la sessione');
  if (next && next.phase === 'preparazione') {
    const C = byId[next.id];
    const days = Math.round((new Date(`${next.date}T09:00:00`) - new Date()) / 864e5);
    const deadline = next.date ? new Date(new Date(`${next.date}T12:00:00`).getTime() - 7 * 864e5) : null;
    const noRef = C.companies.filter((c) => !c.referents.length), withRef = C.companies.filter((c) => c.referents.length), noPre = withRef.filter((c) => !c.presession);
    if (noRef.length) add('warn', `<b>${esc(INST.sessions.find((x) => x.id === next.base).name)}</b>: ${noRef.length} ${noRef.length === 1 ? 'azienda senza referente' : 'aziende senza referente'}.`, '#/aziende', 'Aggiungi i referenti');
    if (noPre.length) add(deadline && isoDay(deadline) < today ? 'warn' : 'info', `Schede pre-sessione compilate: <b>${withRef.length - noPre.length} di ${withRef.length}</b>${deadline ? `, da chiudere entro il ${esc(longDate(isoDay(deadline)))} (una settimana prima)` : ''}.`, `#/sessione/${next.id}/prima`, 'Vedi chi manca');
    if (days >= 0 && days <= 10) add('info', `Mancano ${days} giorni a ${esc(next.title)}: stampa i QR delle aziende e provali sulla rete della sala.`, `#/tavoli/${next.id}`, 'QR delle aziende');
  }
  for (const s of SESSIONS.filter((x) => ['consolidamento', 'chiusa'].includes(x.phase))) {
    const C = byId[s.id];
    const cons = C.companies.filter((c) => c.consolidated_at), rel = cons.filter((c) => c.report_released_at), call = rel.filter((c) => !c.leader_call_note);
    if (!PROVA && cons.length && !benchUpToDate(C)) add('warn', `<b>${esc(s.title)}</b>: benchmark ${C.benchmark.length ? 'da aggiornare' : 'da congelare'} prima di rilasciare i report.`, `#/sessione/${s.id}/dopo`, 'Congela');
    if (cons.length > rel.length) add('warn', `<b>${esc(s.title)}</b>: ${cons.length - rel.length} ${cons.length - rel.length === 1 ? 'report da rilasciare' : 'report da rilasciare'}.`, '#/report', 'Rilascia');
    if (call.length) add('info', `<b>${esc(s.title)}</b>: ${call.length} ${call.length === 1 ? 'call con il leader da annotare' : 'call con i leader da annotare'}.`, '#/report', 'Annota');
  }
  const overdue = commits.filter((m) => ['aperto', 'avviato'].includes(m.status) && m.due_date && m.due_date < today);
  if (overdue.length) add('warn', `${overdue.length} ${overdue.length === 1 ? 'commitment scaduto' : 'commitment scaduti'} da verificare con l'azienda.`, '#/commitment', 'Verifica');

  app.innerHTML = `<div class="pagehead"><div><h1>${PROVA ? 'Programma · ambiente di prova' : 'Programma AITO 3'}</h1>
      <p>${PROVA ? 'Qui si prova la piattaforma con dati dimostrativi: nulla di quello che fai entra nei dati reali o nel benchmark ufficiale.' : 'Le quattro sessioni del pilot e quello che resta da fare.'}</p></div></div>
    ${NET.baseUrl.includes('localhost') ? '<div class="banner risk">Non è stato trovato un indirizzo di rete: i telefoni non potranno collegarsi. Verifica in Impostazioni.</div>' : ''}
    ${cal.length ? `<div class="card">${timeline}</div>` : ''}
    ${PROVA ? '<div class="card" id="demo"><p class="muted small">…</p></div>' : ''}
    <div class="card"><h2>Da fare</h2>
      ${todo.length ? `<ul class="todolist">${todo.map((t) => `<li class="${t.kind}"><span class="tk" aria-hidden="true">${t.kind === 'now' ? '●' : t.kind === 'warn' ? '!' : 'i'}</span><div>${t.html}</div><a class="btn sm ${t.kind === 'info' ? 'ghost' : ''}" href="${t.href}">${esc(t.label)}</a></li>`).join('')}</ul>`
        : `<p class="muted" style="margin:0">Nessuna attività in sospeso.${next ? ` Prossima sessione: ${esc(next.title)}.` : ''}</p>`}</div>`;
  if (PROVA) {
    const D = await api('/api/admin/demo');
    $('#demo').innerHTML = `<h2>Dati di prova</h2>
      <p class="ink2">${D.present ? 'Sono caricate 14 aziende dimostrative e un\'azienda vetrina (TEST) con tutto il flusso, distribuite sulle quattro sessioni di prova. Le aziende e le sessioni che crei in questo ambiente sono anch\'esse di prova.' : 'Non ci sono dati di prova. Caricali per vedere dashboard, plenaria, mappe e report pieni.'}</p>
      <div class="row">${D.present ? `${D.vetrina ? `<a class="btn sm ghost" href="/report/${D.vetrina}" target="_blank">Report della vetrina</a>` : ''}<button class="sm danger" id="demo_rm">Cancella tutti i dati di prova</button>` : '<button class="sm" id="demo_add">Carica i dati di prova</button>'}</div>`;
    if ($('#demo_add')) $('#demo_add').onclick = async () => { try { await api('/api/admin/demo', { method: 'POST' }); toast('Dati di prova caricati'); route(); } catch (e) { toast(e.message, true); } };
    if ($('#demo_rm')) $('#demo_rm').onclick = async () => { if (!confirm('Cancellare tutti i dati di prova (aziende, sessioni, risposte e report di prova)? I dati reali non vengono toccati.')) return; await api('/api/admin/demo', { method: 'DELETE' }); toast('Dati di prova cancellati'); route(); };
  }
}

// ---------- Sessioni ad hoc ----------
async function viewAdhoc() {
  const ss = adhoc();
  app.innerHTML = `<div class="pagehead"><div><h1>Sessioni ad hoc</h1><p>Per un'azienda assente: stesso flusso, stessi descrittori e stessa versione dello strumento. La modalità viene registrata e i dati entrano nella versione successiva del benchmark (§6.3).</p></div></div>
    ${ss.length ? `<div class="grid c2">${ss.map((s) => `<div class="card sesscard"><div class="row between" style="align-items:flex-start"><h2 style="margin:0">${esc(s.title)}</h2><span class="tag gold">${esc(s.channel)}</span></div>
      <div style="margin:16px 0">${phaseChips(s.phase)}</div><a class="btn sm" href="#/sessione/${s.id}">Gestisci la sessione</a></div>`).join('')}</div>` : '<p class="muted">Nessuna sessione ad hoc.</p>'}
    <div class="card"><h2>Nuova sessione ad hoc</h2>
      <div class="grid c3"><div><label class="f" for="ah_base">Sessione di riferimento</label><select id="ah_base">${INST.sessions.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
      <div><label class="f" for="ah_date">Data</label><input type="date" id="ah_date"></div>
      <div><label class="f" for="ah_ch">Canale</label><select id="ah_ch"><option value="presenza">In presenza</option><option value="remoto">Da remoto</option></select></div></div>
      <div style="margin-top:14px"><button id="ah_go">Crea la sessione</button></div></div>`;
  $('#ah_go').onclick = async () => {
    try { const r = await api('/api/admin/sessions', { method: 'POST', body: { base: $('#ah_base').value, date: $('#ah_date').value, channel: $('#ah_ch').value } }); location.hash = `#/sessione/${r.id}`; }
    catch (e) { toast(e.message, true); }
  };
}

// ---------- Dopo le sessioni: report e call con i leader ----------
async function viewReports() {
  const ss = SESSIONS.filter((s) => ['consolidamento', 'chiusa'].includes(s.phase));
  const ctrl = await Promise.all(ss.map((s) => api(`/api/admin/sessions/${s.id}/control`)));
  const blocks = ctrl.map((C) => {
    const cons = C.companies.filter((c) => c.consolidated_at);
    if (!cons.length) return '';
    const upd = benchUpToDate(C);
    return `<div class="card"><div class="row between"><h2 style="margin:0">${esc(C.session.title)}</h2>
        <span class="small muted">${cons.filter((c) => c.report_released_at).length} di ${cons.length} rilasciati · ${cons.filter((c) => c.leader_call_note).length} call annotate</span></div>
      ${!PROVA && !upd ? `<p class="note" style="margin-top:12px">Benchmark ${C.benchmark.length ? 'da aggiornare' : 'non ancora congelato'}: <a href="#/sessione/${C.session.id}/dopo">congelalo prima di rilasciare</a>, così il report contiene il confronto.</p>` : ''}
      <div class="tablewrap" style="margin-top:12px"><table><thead><tr><th>Azienda</th><th>Report</th><th>Call con il leader</th></tr></thead><tbody>
      ${cons.map((c) => `<tr><td><a href="#/azienda/${c.id}"><b>${esc(c.name)}</b></a> ${c.kind !== 'REALE' ? `<span class="tag warn">${esc(c.kind)}</span>` : ''}<div class="small muted">consolidato ${fmtDate(c.consolidated_at)}</div></td>
        <td><div class="row">${c.report_released_at ? `<span class="tag ok">Rilasciato ${fmtDate(c.report_released_at)}</span>` : '<span class="tag">Bozza</span>'}
          <a class="small" href="/report/${c.id}" target="_blank">apri</a><a class="small" href="/api/admin/pdf/${c.id}">PDF</a>
          <button class="sm ${c.report_released_at ? 'ghost' : ''}" data-rel="${C.session.id}:${c.id}">${c.report_released_at ? 'Nuova versione' : 'Rilascia'}</button></div></td>
        <td>${c.report_released_at ? `<div class="row"><span class="small ${c.leader_call_note ? 'ink2' : 'muted'}" style="max-width:360px">${c.leader_call_note ? esc(c.leader_call_note) : 'Esito non annotato'}</span><button class="sm ghost" data-call="${C.session.id}:${c.id}">${c.leader_call_note ? 'Modifica' : 'Annota esito'}</button></div>` : '<span class="small muted">dopo il rilascio del report</span>'}</td></tr>`).join('')}
      </tbody></table></div></div>`;
  }).join('');
  app.innerHTML = `<div class="pagehead"><div><h1>Report e call con i leader</h1><p>Rilasciare salva una copia del report che l'azienda vede dal link del referente e che non cambia più. Dopo il rilascio, la call con il leader discute il report: annota l'esito qui.</p></div></div>
    ${blocks || '<div class="card"><p class="muted" style="margin:0">Nessuna azienda ha ancora consolidato: i report compaiono qui dopo il consolidamento in sala.</p></div>'}`;
  const find = (v) => { const [sid, cid] = v.split(':').map(Number); return { sid, c: ctrl.find((C) => C.session.id === sid).companies.find((x) => x.id === cid) }; };
  $$('[data-rel]').forEach((b) => b.onclick = async () => { const { sid, c } = find(b.dataset.rel); b.disabled = true; if (await releaseReport(sid, c.id)) route(); else b.disabled = false; });
  $$('[data-call]').forEach((b) => b.onclick = async () => { const { sid, c } = find(b.dataset.call); if (await noteCall(sid, c)) route(); });
}

// ---------- Dopo le sessioni: commitment e verifica ----------
async function viewCommitments() {
  const all = await api('/api/admin/commitments');
  const today = isoDay(new Date());
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const only = params.get('tutti') !== '1';
  const due = (m) => ['aperto', 'avviato'].includes(m.status) && m.due_date && m.due_date < today;
  const list = only ? all.filter((m) => !['completato'].includes(m.status)) : all;
  app.innerHTML = `<div class="pagehead"><div><h1>Commitment e verifica</h1><p>Le priorità scelte dalle aziende in sala, con azione, owner e scadenza. Lo stato si aggiorna nella call con il leader e con l'item pulse della sessione successiva (§11, §12).</p></div>
      <div class="row"><a class="btn sm ${only ? '' : 'ghost'}" href="#/commitment">Da seguire</a><a class="btn sm ${only ? 'ghost' : ''}" href="#/commitment?tutti=1">Tutti</a></div></div>
    <div class="card">${list.length ? `<div class="tablewrap"><table><thead><tr><th>Azienda</th><th>Priorità e azione</th><th>Owner e scadenza</th><th>Stato</th></tr></thead><tbody>
      ${list.map((m) => `<tr><td><a href="#/azienda/${m.company_id}"><b>${esc(m.company_name)}</b></a><div class="small muted">${esc(m.session_title)}</div></td>
        <td class="small"><b>${esc(m.priority_item)}</b> ${esc(INST.items[m.priority_item]?.title || '')}<br>${esc(m.action || '—')}<br><span class="muted">KPI: ${esc(m.kpi || '—')}</span></td>
        <td class="small">${esc(m.owner || '—')}<br><span class="${due(m) ? 'tag risk' : ''}">${m.due_date ? esc(new Date(`${m.due_date}T12:00:00`).toLocaleDateString('it-IT')) : '—'}${due(m) ? ' · scaduto' : ''}</span></td>
        <td style="min-width:220px"><select data-cstat="${m.id}">${['aperto', 'avviato', 'completato', 'non avviato', 'sospeso'].map((x) => `<option ${m.status === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
          <input type="text" data-cnote="${m.id}" placeholder="evidenza o nota" value="${esc(m.status_note || '')}" style="margin-top:6px"><button class="sm ghost" data-csave="${m.id}" style="margin-top:6px">Salva</button></td></tr>`).join('')}
      </tbody></table></div>` : `<p class="muted" style="margin:0">${only ? 'Nessun commitment da seguire.' : 'Nessun commitment registrato.'}</p>`}</div>`;
  $$('[data-csave]').forEach((b) => b.onclick = async () => {
    const id = b.dataset.csave;
    try { await api(`/api/admin/commitments/${id}/status`, { method: 'PUT', body: { status: $(`[data-cstat="${id}"]`).value, note: $(`[data-cnote="${id}"]`).value } }); toast('Stato aggiornato'); } catch (e) { toast(e.message, true); }
  });
}

// ---------- Control room: il percorso della sessione ----------
// Sette passi in tre momenti. Le prime quattro corrispondono alle fasi della sessione (si aprono una alla volta),
// le ultime tre sono le attività dopo la sessione.
const FLOW = [
  { id: 'preparazione', group: 'Prima della sessione', title: 'Preparazione', phase: 'preparazione' },
  { id: 'individuale', group: 'In sala', title: 'Risposte individuali', phase: 'individuale', minutes: 10 },
  { id: 'confronto', group: 'In sala', title: 'Confronto al tavolo', phase: 'confronto', minutes: 10 },
  { id: 'consolidamento', group: 'In sala', title: 'Consolidamento', phase: 'consolidamento', minutes: 10 },
  { id: 'benchmark', group: 'Dopo la sessione', title: 'Congelare il benchmark' },
  { id: 'report', group: 'Dopo la sessione', title: 'Rilasciare i report' },
  { id: 'call', group: 'Dopo la sessione', title: 'Call con i leader' },
];
const NEXT = {
  preparazione: { to: 'individuale', label: 'Apri le risposte individuali', what: 'I partecipanti registrati vedono le domande della sessione e i confronti a coppie. Chi arriva dopo può ancora registrarsi.' },
  individuale: { to: 'confronto', label: 'Chiudi le risposte e apri il confronto', what: 'Le risposte individuali si bloccano e non si potranno riaprire (§2). Ogni tavolo vede la distribuzione anonima delle proprie risposte, il referente la vista di confronto.' },
  confronto: { to: 'consolidamento', label: 'Apri il consolidamento', what: 'Il referente di ogni azienda registra livello e sotto-opzione ufficiali, poi priorità e commitment.' },
  consolidamento: { to: 'chiusa', label: 'Chiudi la sessione', what: 'I referenti non possono più modificare il consolidamento; il commitment resta modificabile. Da qui in poi le correzioni le fa ELIS, con motivazione nel registro.' },
};
const nextStepText = (phase) => ({ preparazione: 'Prossimo passo: aprire le risposte individuali', individuale: 'In corso: risposte individuali', confronto: 'In corso: confronto al tavolo',
  consolidamento: 'In corso: consolidamento', chiusa: 'Sessione chiusa: benchmark, report e call con i leader' }[phase]);

const TABS = [
  { id: 'prima', label: 'Prima', steps: ['preparazione'] },
  { id: 'sala', label: 'In sala', steps: ['individuale', 'confronto', 'consolidamento'] },
  { id: 'dopo', label: 'Dopo', steps: ['benchmark', 'report', 'call'] },
  { id: 'risultati', label: 'Risultati', steps: [] },
];
async function viewControl(arg) {
  const [id, tabArg] = String(arg).split('/');
  let C = await api(`/api/admin/sessions/${id}/control`);
  let tab = TABS.some((t) => t.id === tabArg) ? tabArg : null;
  let sel = null;          // passo mostrato nel pannello
  let confirming = false;  // conferma del passaggio di fase aperta
  const mailed = new Set(); // aziende per cui si è appena aperta la bozza dell'email: si chiede se è stata inviata
  const names = (list, max = 4) => list.slice(0, max).map((c) => esc(c.name)).join(', ') + (list.length > max ? ` e altre ${list.length - max}` : '');
  const meter = (a, b, label) => `<div class="meter"><div class="meter-top"><b>${a}</b><span> di ${b} ${label}</span></div><div class="meter-bar"><i style="width:${b ? Math.round((a / b) * 100) : 0}%"></i></div></div>`;
  const ck = (kind, html) => `<li class="ck ${kind}"><span aria-hidden="true">${kind === 'ok' ? '✓' : kind === 'warn' ? '!' : 'i'}</span><div>${html}</div></li>`;

  // Preparazione: una riga per azienda con i passi 2–5 (referente, email, QR, scheda)
  // Una bozza per ogni referente: ognuno riceve solo il proprio link personale.
  const mailtoFor = (c, r) => {
    const s = C.session;
    let due = '';
    if (s.date) { const d = new Date(`${s.date}T12:00:00`); d.setDate(d.getDate() - 7); if (isoDay(d) >= isoDay(new Date())) due = longDate(isoDay(d)); }
    const subject = `AITO Map · ${s.title} · scheda pre-sessione di ${c.name}`;
    const body = `Gentile ${r.name},\n\nin vista della sessione ${s.title.split(' · ')[0]}${s.date ? ` del ${longDate(s.date)}` : ''}, Le chiediamo di compilare la scheda pre-sessione di ${c.name} ${due ? `entro il ${due}` : 'appena possibile'}. Sono dati fattuali che in sala servono per il consolidamento.\n\nDal Suo link personale si compila la scheda, si seguono in sala i partecipanti e si registra la posizione ufficiale dell'azienda:\n${C.baseUrl}/r/${r.token}\n\nIl link è personale: La preghiamo di non inoltrarlo.\n\nGrazie,\nTeam AI Strategy ELIS`;
    return `mailto:${encodeURIComponent(r.email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
  // un indirizzo locale (portatile ELIS) non si apre da fuori: lo si dice prima di mandare l'email
  const localBase = /^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(C.baseUrl);
  const prepTable = () => {
    const cos = C.companies, s = C.session;
    const prow = (c) => {
      const has = c.referents.length;
      const drafts = (again) => c.referents.map((r) => `<div style="margin-top:4px"><a class="${again ? 'small' : 'btn sm'}" href="${mailtoFor(c, r)}" data-mail="${c.id}">${again ? 'prepara di nuovo' : 'Prepara l\'email'}${c.referents.length > 1 ? ` a ${esc(r.name)}` : ''}</a>
        ${r.email ? '' : `<div class="small" style="color:var(--warn)">manca l'email di ${esc(r.name)}: <a href="#/azienda/${c.id}">aggiungila</a></div>`}</div>`).join('');
      const invite = !has ? '<span class="muted small">serve il referente</span>'
        : mailed.has(c.id) ? `<div class="small">L'hai inviata?</div><div class="row" style="margin-top:4px"><button class="sm" data-invited="${c.id}">Sì, segna come inviata</button><button class="sm ghost" data-unmail="${c.id}">Non ancora</button></div>`
        : c.invited_at ? `<span class="tag ok">inviata</span> <span class="small muted">${fmtDate(c.invited_at)}</span>${drafts(true)}`
        : drafts(false);
      const qr = !has ? '<span class="muted small">serve il referente</span>'
        : c.qr_generated_at ? `<span class="tag ok">generato</span> <span class="small muted">${fmtDate(c.qr_generated_at)}</span><div><a class="small" href="#/tavolo/${s.id}:${c.id}">QR azienda</a> · <span class="small muted">referente bloccato</span></div>`
        : `<button class="sm ghost" data-genqr="${c.id}">Genera il QR</button>`;
      return `<tr><td><b>${esc(c.name)}</b> ${c.kind !== 'REALE' ? `<span class="tag warn">${esc(c.kind)}</span>` : ''} <span class="small mono muted" title="Codice azienda">${esc(c.joinCode)}</span></td>
        <td class="small">${has ? c.referents.map((r) => `<div><a href="/r/${r.token}" target="_blank">${esc(r.name)}</a>${r.email ? ` · <span class="muted">${esc(r.email)}</span>` : ''}</div>`).join('') : `<a href="#/azienda/${c.id}">Indica il referente</a>`}</td>
        <td>${invite}</td><td>${qr}</td>
        <td>${c.presession ? `<span class="tag ok">compilata</span> <span class="small muted">${fmtDate(c.presession)}</span>` : '<span class="small muted">—</span>'}</td></tr>`;
    };
    return `<div class="card"><h2>Aziende del programma</h2>
      ${localBase ? `<div class="banner warn">I link nelle email usano un indirizzo della rete locale (${esc(C.baseUrl)}): fuori dalla rete ELIS non si aprono. Usa la piattaforma online o imposta l'indirizzo pubblico in <a href="#/impostazioni">Impostazioni</a>.</div>` : ''}
      <div class="tablewrap"><table>
      <thead><tr><th>1 · Azienda</th><th>2 · Referente</th><th>3 · Email</th><th>4 · QR</th><th>5 · Scheda</th></tr></thead>
      <tbody>${cos.map(prow).join('') || '<tr><td colspan="5" class="muted">Nessuna azienda: aggiungile da <a href="#/aziende">Aziende e referenti</a>.</td></tr>'}</tbody></table></div></div>`;
  };

  const draw = () => {
    const s = C.session;
    const idx = PHASES.findIndex((p) => p.id === s.phase);
    const cos = C.companies;
    const withRef = cos.filter((c) => c.referents.length);
    const inRoom = cos.filter((c) => c.participants);
    const totP = cos.reduce((a, c) => a + c.participants, 0), totS = cos.reduce((a, c) => a + c.submitted, 0);
    const answered = cos.reduce((a, c) => a + c.answered, 0), expected = cos.reduce((a, c) => a + c.expected, 0);
    const consolidated = cos.filter((c) => c.consolidated_at);
    const released = consolidated.filter((c) => c.report_released_at);
    const called = released.filter((c) => c.leader_call_note);
    const lastCons = consolidated.map((c) => c.consolidated_at).sort().pop() || null;
    const frozen = C.benchmark[0] || null;
    const benchDone = !!frozen && (!lastCons || frozen.created_at >= lastCons);
    const state = (f) => {
      if (f.phase) { const i = PHASES.findIndex((p) => p.id === f.phase); return i < idx ? 'done' : i === idx ? 'now' : 'todo'; }
      if (f.id === 'benchmark') return (PROVA ? idx >= 3 : benchDone) ? 'done' : idx >= 3 ? 'now' : 'todo';
      if (f.id === 'report') return consolidated.length && released.length === consolidated.length ? 'done' : idx >= 3 && consolidated.length ? 'now' : 'todo';
      return released.length && called.length === released.length ? 'done' : released.length ? 'now' : 'todo';
    };
    const summary = {
      preparazione: `${withRef.length} di ${cos.length} aziende con referente · ${withRef.filter((c) => c.presession).length} schede`,
      individuale: totP ? `${totS} di ${totP} hanno inviato` : 'nessun partecipante ancora',
      confronto: `${inRoom.length} ${inRoom.length === 1 ? 'azienda' : 'aziende'} al tavolo`,
      consolidamento: `${consolidated.length} di ${inRoom.length || consolidated.length} consolidate`,
      benchmark: PROVA ? 'calcolato sui dati di prova' : frozen ? `${frozen.label} · N=${frozen.n_companies}${benchDone ? '' : ' · da aggiornare'}` : 'non ancora congelato',
      report: `${released.length} di ${consolidated.length} rilasciati`,
      call: `${called.length} di ${released.length} annotate`,
    };
    if (!sel && !tab) sel = idx < 4 ? FLOW[idx].id : (FLOW.slice(4).find((f) => state(f) !== 'done') || FLOW[6]).id;
    if (!tab) tab = TABS.find((t) => t.steps.includes(sel)).id;
    const T = TABS.find((t) => t.id === tab);
    if (T.steps.length && !T.steps.includes(sel)) sel = (T.steps.find((x) => state(FLOW.find((f) => f.id === x)) === 'now') || T.steps.find((x) => state(FLOW.find((f) => f.id === x)) !== 'done') || T.steps[0]);
    if (!T.steps.length) sel = sel || 'benchmark';
    const f = FLOW.find((x) => x.id === sel);
    const st = state(f);
    const mins = C.phaseSince ? Math.max(0, Math.round((Date.now() - new Date(C.phaseSince.replace(' ', 'T') + 'Z')) / 60000)) : null;
    const chip = st === 'done' ? '<span class="tag ok">Completato</span>'
      : st === 'now' ? `<span class="tag gold">${f.phase ? `In corso${mins != null ? ` da ${mins} min` : ''}${f.minutes ? ` · previsti ${f.minutes}` : ''}` : 'Da fare ora'}</span>`
      : '<span class="tag">Più avanti</span>';

    // ---- contenuto del pannello
    let what = '', checks = [], extra = '';
    if (f.id === 'preparazione') {
      // i cinque passi della preparazione, nell'ordine del flusso, con lo stato reale (niente spunte verdi a programma vuoto)
      const due = s.date ? (() => { const d = new Date(`${s.date}T12:00:00`); d.setDate(d.getDate() - 7); return longDate(isoDay(d)); })() : '';
      what = `Cosa preparare prima della sessione${s.date ? ` del ${esc(longDate(s.date))}` : ''}, nell'ordine. Nella tabella sotto trovi, azienda per azienda, i pulsanti per l'email e il QR.`;
      const noRef = cos.filter((c) => !c.referents.length), noPre = withRef.filter((c) => !c.presession);
      const invited = withRef.filter((c) => c.invited_at), withQr = withRef.filter((c) => c.qr_generated_at);
      const adhoc = s.mode !== 'workshop';
      checks.push(cos.length ? ck('ok', `<b>1 · Aziende:</b> ${cos.length} ${cos.length === 1 ? 'azienda' : 'aziende'} ${PROVA ? 'di prova' : 'nel programma'}. <a href="#/aziende">Aggiungine altre</a>`)
        : ck('warn', `<b>1 · Aziende:</b> nessuna azienda ${PROVA ? 'di prova' : 'in Produzione'}. <a href="#/aziende">Aggiungi le aziende</a>`));
      checks.push(!cos.length ? ck('info', '<b>2 · Referenti:</b> dopo le aziende, indica per ognuna il referente (nome ed email).')
        : noRef.length ? ck('warn', `<b>2 · Referenti:</b> ${noRef.length} di ${cos.length} ${cos.length === 1 ? 'azienda' : 'aziende'} senza referente: ${names(noRef)}. <a href="#/aziende">Indica il referente</a>`)
        : ck('ok', `<b>2 · Referenti:</b> ${cos.length === 1 ? 'l\'azienda ha' : `tutte le ${cos.length} aziende hanno`} un referente`));
      checks.push(!withRef.length ? ck('info', `<b>3 · Email al referente:</b> con il link personale e la scadenza della scheda${due ? ` (${esc(due)})` : ''}. Si prepara dalla tabella sotto quando c'è il referente.`)
        : invited.length < withRef.length ? ck('warn', `<b>3 · Email al referente:</b> inviata a ${invited.length} di ${withRef.length}. Usa <i>Prepara l'email</i> nella tabella sotto: si apre il programma di posta con il testo pronto.`)
        : ck('ok', `<b>3 · Email al referente:</b> inviata a tutti (${withRef.length})`));
      checks.push(ck(withRef.length && withQr.length === withRef.length ? 'ok' : withRef.length ? 'warn' : 'info', `<b>4 · QR della sessione:</b> ${withQr.length ? `generati per ${withQr.length} di ${withRef.length} ${withRef.length === 1 ? 'azienda' : 'aziende'}. <a href="#/tavoli/${s.id}">Apri i QR delle aziende</a> per stamparli o scaricarli.` : 'non ancora generati.'}
        Dal momento in cui generi il QR di un'azienda, il suo referente <b>non si può più cambiare</b> fino alla chiusura della sessione.
        ${!adhoc && withRef.length > withQr.length ? `<div style="margin-top:8px"><button class="sm" id="genqr">${withQr.length ? 'Genera i QR mancanti' : 'Genera i QR della sessione'}</button></div>` : ''}
        ${adhoc && withRef.length > withQr.length ? '<div class="small muted" style="margin-top:4px">Sessione ad hoc: genera il QR solo per le aziende che partecipano, dalla tabella sotto.</div>' : ''}
        <div class="small muted" style="margin-top:6px">Riserva: il QR di sala (<a href="#/qr/${s.id}">a schermo intero</a>) chiede il codice azienda · <span class="mono" style="word-break:break-all">${esc(C.joinUrl)}</span></div>`));
      checks.push(!withRef.length ? ck('info', `<b>5 · Schede pre-sessione:</b> le compilano i referenti dal loro link${due ? `, entro il ${esc(due)}` : ''}.`)
        : noPre.length ? ck('warn', `<b>5 · Schede pre-sessione:</b> compilate ${withRef.length - noPre.length} di ${withRef.length}${due ? `, da chiudere entro il ${esc(due)}` : ''}. Mancano: ${names(noPre)}`)
        : ck('ok', `<b>5 · Schede pre-sessione:</b> tutte compilate (${withRef.length})`));
      if (totP) checks.push(ck('info', `<b>Partecipanti già registrati:</b> ${totP}`));
    } else if (f.id === 'individuale') {
      what = 'Ognuno risponde da solo, senza vedere le risposte dei colleghi. Chi non ha visibilità su un punto sceglie N.D.';
      extra = st === 'todo' ? '' : `<div class="grid c2">${meter(totS, totP, 'partecipanti hanno inviato')}${meter(answered, expected, 'risposte date')}</div>`;
      const few = inRoom.filter((c) => c.participants < 3), oneFn = inRoom.filter((c) => c.functions.length < 2), absent = withRef.filter((c) => c.presession && !c.participants);
      if (st !== 'todo') {
        checks.push(few.length ? ck('warn', `La confidence sarà più bassa dove ci sono meno di 3 partecipanti: ${names(few)}`) : inRoom.length ? ck('ok', 'Tutte le aziende in sala hanno almeno 3 partecipanti') : ck('info', 'Nessuna azienda ancora in sala'));
        if (oneFn.length) checks.push(ck('warn', `Una sola funzione presente: ${names(oneFn)}`));
        if (absent.length) checks.push(ck('warn', `Scheda compilata ma nessuno registrato: ${names(absent)}`));
      }
    } else if (f.id === 'confronto') {
      what = 'Ogni tavolo guarda dove le risposte divergono e su quali evidenze si basano. Le risposte individuali sono bloccate. Dove la divergenza è di due livelli o più, la discussione è obbligatoria prima del consolidamento.';
      if (st !== 'todo') checks.push(ck('info', `Aziende al tavolo: <b>${inRoom.length}</b>. I referenti vedono la vista di confronto dal proprio link.`));
      extra = `<div class="row"><a class="btn sm ghost" href="/live/${s.id}" target="_blank">Apri la dashboard live</a></div>`;
    } else if (f.id === 'consolidamento') {
      what = 'Il referente di ogni azienda registra la posizione ufficiale: livello, sotto-opzione e, se si scosta dalla mediana, la motivazione. Poi sceglie la priorità e il commitment.';
      if (st !== 'todo') {
        extra = meter(consolidated.length, inRoom.length || consolidated.length, 'aziende hanno consolidato');
        const missing = inRoom.filter((c) => !c.consolidated_at), noCommit = consolidated.filter((c) => !c.commitment);
        checks.push(missing.length ? ck('warn', `Non hanno ancora consolidato: ${names(missing)}`) : consolidated.length ? ck('ok', 'Tutte le aziende in sala hanno consolidato') : ck('info', 'Nessun consolidamento ancora'));
        if (consolidated.length) checks.push(noCommit.length ? ck('info', `Commitment ancora da registrare: ${names(noCommit)}. Si può completare anche dopo la sessione.`) : ck('ok', 'Tutte le aziende consolidate hanno registrato il commitment'));
      }
    } else if (f.id === 'benchmark' && PROVA) {
      what = 'Nell\'ambiente di prova il benchmark si calcola sempre sui dati di prova e non si congela: dashboard, plenaria, mappe e report lo usano così com\'è. In produzione qui si congela la versione ufficiale.';
      extra = `<div class="row"><a class="btn ghost" href="/plenaria/${s.base}" target="_blank">Apri la plenaria</a><a class="btn ghost" href="/mappe/${s.base}" target="_blank">Mappe a quadranti</a></div>`;
    } else if (f.id === 'benchmark') {
      what = `Congelare salva una versione datata del benchmark: è quella che entra nei report e non cambia più. Entrano solo aziende REALI con consenso; sotto ${SC.benchmark.minN} aziende il confronto non si mostra.`;
      checks.push(frozen ? ck(benchDone ? 'ok' : 'warn', `Ultima versione: <b>${esc(frozen.label)}</b>, ${frozen.n_companies} aziende, ${fmtDate(frozen.created_at)}${benchDone ? '' : '. Ci sono consolidamenti successivi: congela di nuovo per includerli.'}`) : ck('warn', 'Nessuna versione congelata per questa sessione'));
      if (frozen && frozen.n_companies < SC.benchmark.minN) checks.push(ck('info', `Con ${frozen.n_companies} aziende il confronto non compare nei report: servono almeno ${SC.benchmark.minN}.`));
      extra = `<div class="row"><button class="gold" id="freeze">Congela il benchmark ora</button><a class="btn ghost" href="/plenaria/${s.base}" target="_blank">Apri la plenaria</a><a class="btn ghost" href="/mappe/${s.base}" target="_blank">Mappe a quadranti</a><a class="btn ghost" href="/live/${s.id}" target="_blank">Dashboard live</a></div>`;
    } else if (f.id === 'report') {
      what = 'Rilasciare salva una copia del report che l\'azienda vede dal link del referente e che non cambierà più. Conviene congelare prima il benchmark, così il report contiene il confronto.';
      if (!benchDone) checks.push(ck('warn', 'Il benchmark non è aggiornato: <button class="link" data-goto="benchmark">congelalo prima</button>.'));
      extra = consolidated.length ? `<ul class="todo">${consolidated.map((c) => `<li><div><b>${esc(c.name)}</b><div class="small muted"><a href="/report/${c.id}" target="_blank">Bozza</a> · <a href="/api/admin/pdf/${c.id}">PDF</a></div></div>
          ${c.report_released_at ? `<div class="row"><span class="tag ok">Rilasciato ${fmtDate(c.report_released_at)}</span><button class="sm ghost" data-release="${c.id}" title="Crea una nuova versione marcata come tale">Nuova versione</button></div>` : `<button class="sm" data-release="${c.id}">Rilascia</button>`}</li>`).join('')}</ul>
        <div class="row" style="margin-top:12px"><button class="sm ghost" id="zipbtn">Scarica tutti i PDF (zip)</button></div>` : '<p class="muted">Nessuna azienda ha ancora consolidato.</p>';
    } else {
      what = 'Nella call il leader dell\'azienda discute il report, a partire dalle regole di coerenza da esaminare. Annota l\'esito: resta nella scheda dell\'azienda.';
      extra = released.length ? `<ul class="todo">${released.map((c) => `<li><div><b>${esc(c.name)}</b>${c.leader_call_note ? `<div class="small ink2">${esc(c.leader_call_note)}</div>` : '<div class="small muted">Esito non ancora annotato</div>'}</div>
          <button class="sm ${c.leader_call_note ? 'ghost' : ''}" data-note="${c.id}">${c.leader_call_note ? 'Modifica esito' : 'Annota esito'}</button></li>`).join('')}</ul>` : '<p class="muted">Le call si fanno dopo il rilascio dei report.</p>';
    }

    // ---- azione di fase (solo sul passo in corso)
    let action = '';
    const nx = NEXT[s.phase];
    if (f.phase === s.phase && nx && s.phase === 'preparazione' && !cos.length) {
      action = `<div class="fp-action"><h4>Passo successivo</h4><p class="ink2">Per aprire le risposte individuali serve almeno un'azienda: <a href="#/aziende">aggiungila</a>.</p></div>`;
    } else if (f.phase === s.phase && nx) {
      const warnNow = s.phase === 'individuale' && totP > totS ? `<p class="small" style="color:var(--warn)">${totP - totS === 1 ? 'Un partecipante non ha' : `${totP - totS} partecipanti non hanno`} ancora premuto Invia: le risposte già date verranno considerate così come sono.</p>`
        : s.phase === 'consolidamento' && inRoom.some((c) => !c.consolidated_at) ? `<p class="small" style="color:var(--warn)">Alcune aziende non hanno consolidato: dopo la chiusura dovrai riaprire il consolidamento o correggere da ELIS.</p>`
        : s.phase === 'preparazione' && s.date && s.date > isoDay(new Date()) ? `<p class="small" style="color:var(--warn)">La sessione è il ${esc(longDate(s.date))}: apri le risposte individuali solo in sala, quando i partecipanti sono pronti.</p>` : '';
      action = `<div class="fp-action"><h4>Passo successivo</h4>
        <p class="ink2">${nx.what}</p>${warnNow}
        ${confirming ? `<div class="confirmbox" role="alertdialog" aria-label="Conferma"><p><b>Confermi?</b> ${nx.to === 'confronto' ? 'Le risposte individuali non si potranno riaprire.' : 'Puoi tornare indietro indicando un motivo.'}</p>
          <div class="row"><button id="yes">Sì, ${nx.label.charAt(0).toLowerCase() + nx.label.slice(1)}</button><button class="ghost" id="no">Annulla</button></div></div>`
          : `<button class="big" id="nextphase">${nx.label}</button>`}</div>`;
    }
    // ritorno alla fase precedente: sul passo in corso, o sul consolidamento quando la sessione è chiusa
    const backFrom = (f.phase === s.phase) || (s.phase === 'chiusa' && f.id === 'consolidamento');
    const prev = PHASES[idx - 1];
    const backAllowed = backFrom && idx > 0 && !(idx - 1 <= 1 && idx >= 2);
    const back = backAllowed ? `<details class="backphase"><summary>${s.phase === 'chiusa' ? 'Riapri il consolidamento' : `Torna a: ${esc(prev.label)}`}</summary>
      <label class="f" for="backreason">Motivo (resta nel registro modifiche)</label><input type="text" id="backreason" maxlength="1000">
      <button class="sm ghost" id="goback" style="margin-top:8px">Torna indietro</button></details>`
      : (backFrom && idx >= 2 && idx - 1 <= 1 ? '<p class="small muted" style="margin-top:14px">Dopo il confronto non si torna alle risposte individuali (§2). Per un\'azienda che deve rifare la rilevazione usa una sessione ad hoc.</p>' : '');

    const tabState = (t) => { if (!t.steps.length) return ''; const st = t.steps.map((x) => state(FLOW.find((f2) => f2.id === x))); return st.every((x) => x === 'done') ? 'done' : st.includes('now') ? 'now' : ''; };
    const results = `<div class="grid c3">
        <div class="card"><h3>Dashboard live</h3><p class="small ink2">Il benchmark in tempo reale, da proiettare in sala mentre le aziende consolidano.</p><a class="btn sm" href="/live/${s.id}" target="_blank">Apri la dashboard</a></div>
        <div class="card"><h3>Plenaria</h3><p class="small ink2">Come si posiziona la community, con le mappe del bisogno e del peer matching. Solo dati aggregati.</p><a class="btn sm" href="/plenaria/${s.base}" target="_blank">Apri la plenaria</a></div>
        <div class="card"><h3>Mappe a quadranti</h3><p class="small ink2">Le tre mappe della nota, compresa la vista azienda per azienda. Nomi nascosti finché non li mostri.</p><a class="btn sm" href="/mappe/${s.base}" target="_blank">Apri le mappe</a></div></div>
      <div class="card"><h2>Versioni del benchmark</h2>${PROVA ? '<p class="muted" style="margin:0">Nell\'ambiente di prova il benchmark si calcola sui dati di prova e non si congela.</p>'
        : C.benchmark.length ? `<table><thead><tr><th>Versione</th><th class="num">Aziende</th><th>Creata</th></tr></thead><tbody>${C.benchmark.map((v) => `<tr><td>${esc(v.label)}</td><td class="num">${v.n_companies}</td><td>${fmtDate(v.created_at)}</td></tr>`).join('')}</tbody></table>`
        : '<p class="muted" style="margin:0">Nessuna versione congelata: si congela nella scheda Dopo.</p>'}</div>`;
    const T2 = TABS.find((t) => t.id === tab);
    app.innerHTML = `<a class="back" href="#/programma">← Programma</a>
      <div class="pagehead"><div><h1>${esc(s.title)}</h1><p class="small">Domande della sessione: ${esc(C.def.items.map((i) => `${i} ${INST.items[i].title}`).join(' · '))}</p></div>
        <div class="row"><a class="btn sm ghost" href="#/tavoli/${s.id}">QR delle aziende</a><a class="btn sm ghost" href="/live/${s.id}" target="_blank">Dashboard live</a></div></div>
      <div class="tabs" role="tablist" aria-label="Momenti della sessione">${TABS.map((t) => `<button type="button" role="tab" class="tab ${tabState(t)} ${t.id === tab ? 'on' : ''}" aria-selected="${t.id === tab}" data-tab="${t.id}">
        <span class="tdot" aria-hidden="true">${tabState(t) === 'done' ? '✓' : ''}</span>${esc(t.label)}${tabState(t) === 'now' ? '<span class="sr-only"> (in corso)</span>' : ''}</button>`).join('')}</div>
      ${tab === 'risultati' ? results : `
      ${T2.steps.length > 1 ? `<div class="substeps">${T2.steps.map((x) => { const fx = FLOW.find((f2) => f2.id === x); const stx = state(fx); return `<button type="button" class="fstep ${stx} ${x === sel ? 'sel' : ''}" data-step="${x}" ${x === sel ? 'aria-current="step"' : ''}>
          <span class="fnum" aria-hidden="true">${stx === 'done' ? '✓' : FLOW.indexOf(fx) + 1}</span><span class="ftxt"><b>${esc(fx.title)}</b><small>${summary[x]}</small></span></button>`; }).join('')}</div>` : ''}
      <section class="card flowpanel" aria-live="polite">
        <div class="fp-head"><div><div class="small muted">${esc(f.group)}</div><h2>${esc(f.title)}</h2></div>${chip}</div>
        <p class="lede">${what}</p>
        ${checks.length ? `<ul class="checks">${checks.join('')}</ul>` : ''}
        ${extra}
        ${action}${back}
      </section>`}
      ${tab === 'risultati' ? '' : s.phase === 'preparazione' ? prepTable() : `<div class="card"><h2>Aziende in questa sessione</h2><div class="tablewrap"><table>
        <thead><tr><th>Azienda</th><th>Scheda</th><th class="num">Partecipanti</th><th>Risposte</th><th>Funzioni</th><th>Consolidato</th><th>Commitment</th><th>Report</th><th>Tavolo</th></tr></thead>
        <tbody>${cos.filter((c) => c.participants || c.consolidated_at || c.presession).map(row).join('') || `<tr><td colspan="9" class="muted">${cos.length ? 'Nessuna azienda ancora attiva in questa sessione.' : 'Nessuna azienda: aggiungile da <a href="#/aziende">Aziende e referenti</a>.'}</td></tr>`}</tbody></table></div>
        ${cos.some((c) => !(c.participants || c.consolidated_at || c.presession)) ? `<details style="margin-top:10px"><summary class="small">Altre aziende censite (${cos.filter((c) => !(c.participants || c.consolidated_at || c.presession)).length})</summary><table><tbody>${cos.filter((c) => !(c.participants || c.consolidated_at || c.presession)).map(row).join('')}</tbody></table></details>` : ''}</div>`}`;

    const reload = async () => { C = await api(`/api/admin/sessions/${id}/control`); draw(); };
    $$('[data-step]').forEach((b) => b.onclick = () => { sel = b.dataset.step; confirming = false; draw(); });
    // preparazione: email al referente (bozza nel programma di posta) e QR della sessione
    $$('[data-mail]').forEach((a) => a.addEventListener('click', () => { mailed.add(Number(a.dataset.mail)); setTimeout(draw, 300); }));
    $$('[data-unmail]').forEach((b) => b.onclick = () => { mailed.delete(Number(b.dataset.unmail)); draw(); });
    $$('[data-invited]').forEach((b) => b.onclick = async () => {
      try { await api(`/api/admin/sessions/${id}/companies/${b.dataset.invited}/invited`, { method: 'POST', body: {} }); mailed.delete(Number(b.dataset.invited)); toast('Email segnata come inviata'); await reload(); }
      catch (e) { toast(e.message, true); }
    });
    const genQr = async (companyId) => {
      const msg = `${companyId ? 'Generare il QR di questa azienda?' : `Generare i QR di ${C.session.title} per tutte le aziende con referente?`} Da questo momento il referente non si potrà cambiare né il suo link rigenerare fino alla chiusura della sessione, se non come eccezione con un motivo scritto nel registro modifiche.`;
      if (!confirm(msg)) return;
      try { const r = await api(`/api/admin/sessions/${id}/qr`, { method: 'POST', body: companyId ? { companyId } : {} }); toast(r.generated ? `QR generati: ${r.generated}` : 'Nessun QR nuovo da generare'); await reload(); }
      catch (e) { toast(e.message, true); }
    };
    $$('[data-genqr]').forEach((b) => b.onclick = () => genQr(Number(b.dataset.genqr)));
    if ($('#genqr')) $('#genqr').onclick = () => genQr(null);
    $$('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; sel = null; confirming = false; history.replaceState(null, '', `#/sessione/${s.id}/${tab}`); draw(); });
    $$('[data-goto]').forEach((b) => b.onclick = () => { sel = b.dataset.goto; tab = TABS.find((t) => t.steps.includes(sel)).id; draw(); });
    if ($('#nextphase')) $('#nextphase').onclick = () => { confirming = true; draw(); $('#yes')?.focus(); };
    if ($('#no')) $('#no').onclick = () => { confirming = false; draw(); };
    if ($('#yes')) $('#yes').onclick = async () => {
      try { await api(`/api/admin/sessions/${s.id}/phase`, { method: 'PUT', body: { phase: nx.to } }); confirming = false; sel = null; tab = null; toast('Fase aggiornata'); await reload(); buildNav('sessione', String(s.id)); }
      catch (e) { toast(e.message, true); }
    };
    if ($('#goback')) $('#goback').onclick = async () => {
      const reason = $('#backreason').value.trim();
      if (!reason) { toast('Indica il motivo per tornare indietro', true); $('#backreason').focus(); return; }
      try { await api(`/api/admin/sessions/${s.id}/phase`, { method: 'PUT', body: { phase: prev.id, reason } }); sel = null; tab = null; toast(`Tornati a: ${prev.label}`); await reload(); buildNav('sessione', String(s.id)); }
      catch (e) { toast(e.message, true); }
    };
    if ($('#zipbtn')) $('#zipbtn').onclick = async () => {
      const url = `/api/admin/sessions/${s.id}/pdfs.zip`;
      const res = await fetch(url);
      if (res.status === 409) { const e = await res.json(); if (confirm(`${e.error}\n\nScaricare comunque?`)) location.href = `${url}?force=1`; return; }
      if (!res.ok) { const e = await res.json().catch(() => ({})); toast(e.error || 'Errore', true); return; }
      const name = (res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'AITO_Map_report.zip';
      const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = name; a.click();
    };
    if ($('#freeze')) $('#freeze').onclick = async () => {
      if (!confirm('Congelare una nuova versione del benchmark con i dati consolidati attuali? Le versioni già usate nei report non cambiano.')) return;
      try { const r = await api(`/api/admin/benchmark/${s.base}/freeze`, { method: 'POST' }); toast(`Congelata: ${r.label} (N=${r.n})`); await reload(); } catch (e) { toast(e.message, true); }
    };
    $$('[data-release]').forEach((b) => b.onclick = async () => { b.disabled = true; await releaseReport(s.id, Number(b.dataset.release)); await reload(); });
    $$('[data-note]').forEach((b) => b.onclick = async () => { if (await noteCall(s.id, C.companies.find((x) => x.id === Number(b.dataset.note)))) await reload(); });
  };
  const row = (c) => `<tr>
    <td><b>${esc(c.name)}</b> ${c.kind !== 'REALE' ? `<span class="tag warn">${esc(c.kind)}</span>` : ''} <span class="small mono muted" title="Codice azienda">${esc(c.joinCode)}</span><div class="small">${c.referents.map((r) => `<a href="/r/${r.token}" target="_blank">referente: ${esc(r.name)}</a>`).join('<br>') || '<span class="muted">nessun referente</span>'}</div></td>
    <td>${c.presession ? '<span class="tag ok">✓</span>' : '<span class="tag">—</span>'}</td>
    <td class="num">${c.participants}<span class="muted small"> (${c.submitted} inviati)</span></td>
    <td class="small">${c.expected ? `${c.answered}/${c.expected}` : '—'}</td>
    <td class="small">${c.functions.length}${c.participants && c.functions.length < 2 ? ' <span class="tag warn">1 sola</span>' : ''}</td>
    <td>${c.consolidated_at ? `<span class="tag ok">✓</span> <span class="small muted">${fmtDate(c.consolidated_at)}</span>` : '—'}</td>
    <td>${c.commitment ? '<span class="tag ok">✓</span>' : '—'}</td>
    <td class="small">${c.consolidated_at ? `<a href="/report/${c.id}" target="_blank">apri</a> · <a href="/api/admin/pdf/${c.id}">PDF</a>${c.report_released_at ? '<br><span class="tag ok">rilasciato</span>' : ''}` : ''}</td>
    <td class="small"><a href="#/tavolo/${C.session.id}:${c.id}">QR azienda</a>${c.leader_call_note ? '<br><span class="tag ok">call ✓</span>' : ''}</td></tr>`;
  draw();
  stopPoll = poll(async () => {
    const n = await api(`/api/admin/sessions/${id}/control`);
    if (JSON.stringify(n) !== JSON.stringify(C)) { C = n; const a = document.activeElement; if (!confirming && (!a || a === document.body || a.dataset?.step)) draw(); }
  }, 4000);
}

// Un QR per azienda: chi lo inquadra è già abbinato alla sua azienda. Il nome è scritto sotto il QR.
const qrFile = (C, c) => {
  const n = c.name.normalize('NFD').replace(/[^\w-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return `QR_${C.session.base}_${n || c.joinCode}.png`;
};
const tableCard = (C, c, size) => {
  const url = `${C.joinUrl}?c=${c.joinCode}`;
  return `<div class="tablecard"><div class="small muted">AITO Map · ${esc(C.session.title)}</div>${qrLabeled(url, c.name, size)}
    <p>Inquadra il QR con la fotocamera: entri già nella tua azienda.</p>
    <p class="small tcode">Codice azienda: <b class="mono">${esc(c.joinCode)}</b></p>
    <p class="small tfallback">Se il QR non si apre: vai su <span class="mono">${esc(C.joinUrl.replace(/^https?:\/\//, ''))}</span> e inserisci il codice.</p>
    <p class="noprint"><button class="sm ghost" data-png="${c.id}">Scarica il QR (immagine PNG)</button></p></div>`;
};
const bindPng = (C, cs) => $$('[data-png]').forEach((b) => b.onclick = async () => {
  const c = cs.find((x) => x.id === Number(b.dataset.png));
  b.disabled = true;
  try { await downloadQrPng(`${C.joinUrl}?c=${c.joinCode}`, c.name, `AITO Map · ${C.session.title} · codice ${c.joinCode}`, qrFile(C, c)); }
  catch { toast('Immagine non generata: riprova', true); }
  finally { b.disabled = false; }
});

// Tutti i QR delle aziende di una sessione, da stampare in una volta o scaricare uno per uno
async function viewTables(sid) {
  const C = await api(`/api/admin/sessions/${sid}/control`);
  const all = C.companies.filter((c) => c.kind !== 'DEMO' || C.session.seeded);
  const cs = all.filter((c) => c.qr_generated_at), missing = all.filter((c) => !c.qr_generated_at);
  app.innerHTML = `<p class="noprint"><a class="back" href="#/sessione/${sid}">← Control room</a></p>
    <div class="pagehead noprint"><div><h1>QR delle aziende</h1><p>Un QR per azienda, con il nome scritto sotto: chi lo inquadra è già abbinato alla sua azienda e non deve scegliere né digitare nulla. Mettilo sul tavolo o mandalo al referente come immagine.</p></div></div>
    ${missing.length ? `<div class="banner warn noprint">QR non ancora generati per: ${missing.map((c) => esc(c.name)).join(', ')}. Si generano dalla <a href="#/sessione/${sid}/prima">control room</a> (passo 4), dopo aver indicato il referente.</div>` : ''}
    ${cs.length ? `<div class="row noprint" style="margin-bottom:16px"><button onclick="print()">Stampa ${cs.length} ${cs.length === 1 ? 'cartoncino' : 'cartoncini'}</button></div>
      <div class="tablecards">${cs.map((c) => tableCard(C, c, 220)).join('')}</div>` : '<div class="card"><p class="muted" style="margin:0">Nessun QR generato per questa sessione.</p></div>'}`;
  bindPng(C, cs);
}

async function viewQr(id) {
  const C = await api(`/api/admin/sessions/${id}/control`);
  app.innerHTML = `<div class="qrfull"><div><h1>${esc(C.session.title)}</h1>
    <p style="font-size:1.2rem">Se sul tavolo c'è il QR della tua azienda, usa quello.<br>Altrimenti inquadra questo e inserisci il codice della tua azienda.</p>
    <div style="margin:18px auto">${qrImg(C.joinUrl, 420)}</div><div class="url">${esc(C.joinUrl)}</div>
    <p><a href="#/sessione/${id}">chiudi</a></p></div></div>`;
}

async function viewTableCard(arg) {
  const [sid, cid] = arg.split(':').map(Number);
  const C = await api(`/api/admin/sessions/${sid}/control`);
  const c = C.companies.find((x) => x.id === cid);
  if (!c || !c.qr_generated_at) { app.innerHTML = `<p><a href="#/tavoli/${sid}">← QR delle aziende</a></p><div class="card"><p>${c ? 'Il QR di questa azienda non è ancora stato generato: si genera dalla control room (passo 4).' : 'Azienda non trovata in questa sessione.'}</p></div>`; return; }
  app.innerHTML = `<p class="noprint"><a href="#/tavoli/${sid}">← QR delle aziende</a> · <button class="sm" onclick="print()">Stampa</button></p>
    <div class="single">${tableCard(C, c, 280)}</div>`;
  bindPng(C, [c]);
}

// ---------- Aziende ----------
// Elenchi per perimetro e settore; "Altro" apre un campo libero. I nomi dei settori sono quelli dei dati di prova.
const PERIMETERS = ['Gruppo', 'Società', 'Business unit / divisione'];
const SECTORS = ['Assicurazioni', 'Banche', 'Consulenza', 'Difesa', 'Energia', 'Farmaceutico', 'ICT e digitale', 'Infrastrutture', 'Logistica',
  'Manifattura', 'Media', 'Pubblica amministrazione', 'Retail', 'Sanità', 'Servizi', 'Telecomunicazioni', 'Trasporti', 'Utility'];
const pick = (id, label, list, value = '') => {
  const other = value && !list.includes(value);
  return `<div><label class="f" for="${id}">${label}</label><select id="${id}" data-pick>
      <option value="">— Seleziona —</option>${list.map((x) => `<option ${x === value ? 'selected' : ''}>${esc(x)}</option>`).join('')}<option value="__altro" ${other ? 'selected' : ''}>Altro…</option></select>
    <input type="text" id="${id}_altro" class="${other ? '' : 'hidden'}" style="margin-top:6px" maxlength="100" placeholder="Scrivi ${label.toLowerCase()}" aria-label="${label}: altro" value="${other ? esc(value) : ''}"></div>`;
};
const pickValue = (id) => ($(`#${id}`).value === '__altro' ? $(`#${id}_altro`).value.trim() : $(`#${id}`).value);
const bindPick = () => $$('[data-pick]').forEach((sel) => sel.onchange = () => {
  const t = $(`#${sel.id}_altro`); t.classList.toggle('hidden', sel.value !== '__altro'); if (sel.value === '__altro') t.focus();
});

async function viewCompanies() {
  const cs = await api('/api/admin/companies');
  app.innerHTML = `<div class="pagehead"><div><h1>Aziende e referenti</h1><p>${PROVA ? 'Aziende dell\'ambiente di prova: le nuove aziende create qui sono di tipo TEST e si cancellano con i dati di prova.' : 'Le aziende del programma. Le aziende TEST seguono il flusso vero ma restano sempre fuori dal benchmark.'}</p></div></div>
    <div class="card"><h2>Nuova azienda</h2><div class="grid c4">
      <div><label class="f" for="n_name">Nome *</label><input type="text" id="n_name"></div>
      ${pick('n_per', 'Perimetro valutato', PERIMETERS)}
      ${pick('n_sec', 'Settore', SECTORS)}
      <div><label class="f">Tipo</label><select id="n_kind" ${PROVA ? 'disabled' : ''}>${PROVA ? '<option value="TEST">TEST (ambiente di prova)</option>' : '<option value="REALE">REALE</option><option value="TEST">TEST (prova del flusso, fuori benchmark)</option>'}</select></div></div>
      <div style="margin-top:12px"><button id="n_go">Aggiungi</button></div></div>
    <div class="card"><div class="tablewrap"><table><thead><tr><th>Azienda</th><th>Tipo</th><th>Perimetro</th><th>Consensi</th><th>Referenti</th><th></th></tr></thead><tbody>
      ${cs.map((c) => `<tr><td><a href="#/azienda/${c.id}"><b>${esc(c.name)}</b></a></td><td><span class="tag ${c.kind === 'REALE' ? 'ok' : 'warn'}">${esc(c.kind)}</span></td><td class="small">${esc(c.perimeter)}</td>
        <td class="small"><div class="consents">${['benchmark', 'peer', 'testimonianza', 'followup'].map((k) => `<span class="${c.consents[k]?.granted ? 'yes' : ''}">${c.consents[k]?.granted ? '✓' : '–'} ${k}</span>`).join('')}</div></td>
        <td class="small">${c.referents.map((r) => esc(r.name)).join('<br>') || '—'}</td><td><a class="btn sm" href="#/azienda/${c.id}">Apri</a></td></tr>`).join('')}
    </tbody></table></div></div>`;
  bindPick();
  $('#n_go').onclick = async () => {
    try { const r = await api('/api/admin/companies', { method: 'POST', body: { name: $('#n_name').value, perimeter: pickValue('n_per'), sector: pickValue('n_sec'), kind: $('#n_kind').value } }); location.hash = `#/azienda/${r.id}`; }
    catch (e) { toast(e.message, true); }
  };
}

async function viewCompany(id) {
  const cs = await api('/api/admin/companies');
  const c = cs.find((x) => x.id === Number(id));
  const R = await api(`/api/admin/report/${id}`);
  const J = await api(`/api/admin/companies/${id}/journey`);
  const lock = J.find((x) => x.qr_generated_at && x.phase !== 'chiusa'); // referente bloccato dai QR della sessione
  const stp = (ok, label, title = '') => `<li class="${ok ? 'ok' : ''}" title="${esc(title)}"><span aria-hidden="true">${ok ? '✓' : '·'}</span>${label}</li>`;
  const journey = `<div class="card"><h2>Percorso nelle sessioni</h2><div class="journey">${J.filter((x) => x.mode === 'workshop' || x.consolidated_at || x.participants).map((x) => `<div class="jcol ph-${x.phase}">
      <a href="#/sessione/${x.id}"><b>${esc(INST.sessions.find((k) => k.id === x.base).name)}</b></a><small>${esc(x.mode === 'adhoc' ? 'ad hoc · ' : '')}${esc(shortDate(x.date))}</small>
      <ul>${stp(x.presession, 'Scheda pre-sessione')}${stp(x.participants, `Partecipanti${x.participants ? `: ${x.participants}` : ''}`)}${stp(x.consolidated_at, 'Consolidamento')}${stp(x.commitment, `Commitment${x.commitment ? `: ${esc(x.commitment.priority_item)} · ${esc(x.commitment.status)}` : ''}`)}${stp(x.report_released_at, 'Report rilasciato')}${stp(x.leader_call_note, 'Call con il leader', x.leader_call_note)}</ul></div>`).join('')}</div></div>`;
  app.innerHTML = `<a class="back" href="#/aziende">← Aziende e referenti</a>
    <div class="pagehead"><div><h1>${esc(c.name)}</h1><p>${esc(c.perimeter || 'Perimetro non indicato')} · ${esc(c.sector || 'settore non indicato')} · <span class="tag ${c.kind === 'REALE' ? 'ok' : 'warn'}">${esc(c.kind)}</span> · codice <span class="mono">${esc(c.join_code)}</span></p></div>
      <a class="btn sm ghost" href="/report/${c.id}" target="_blank">Report</a></div>
    ${journey}
    <details class="card"><summary>Dati dell'azienda</summary><div class="grid c4" style="margin-top:8px">
      <div><label class="f">Nome</label><input type="text" id="e_name" value="${esc(c.name)}"></div>
      ${pick('e_per', 'Perimetro', PERIMETERS, c.perimeter || '')}
      ${pick('e_sec', 'Settore', SECTORS, c.sector || '')}
      <div><label class="f">Tipo</label><select id="e_kind" ${PROVA ? 'disabled' : ''}>${(c.kind === 'DEMO' ? ['DEMO'] : PROVA ? [c.kind] : ['REALE', 'TEST']).map((k) => `<option ${c.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div></div>
      <div style="margin-top:12px"><button id="e_save">Salva</button></div></details>
    <div class="grid c2">
      <div class="card"><h2>Consensi</h2><p class="small muted">Distinti e revocabili (§16). Senza consenso al benchmark l'azienda riceve comunque il proprio report ma non entra nelle distribuzioni.</p>
        ${['benchmark', 'peer', 'testimonianza', 'followup'].map((k) => `<label class="check"><input type="checkbox" data-consent="${k}" ${c.consents[k]?.granted ? 'checked' : ''}> ${{ benchmark: 'Benchmark anonimo', peer: 'Peer matching', testimonianza: 'Testimonianza', followup: 'Follow-up' }[k]} <span class="small muted">${c.consents[k] ? fmtDate(c.consents[k].at) : ''}</span></label>`).join('')}</div>
      <div class="card"><h2>Referenti</h2>
        ${lock ? `<div class="banner info">Referente bloccato: i QR di <b>${esc(lock.title)}</b> sono stati generati il ${fmtDate(lock.qr_generated_at)}. Fino alla chiusura della sessione il referente si cambia, o il link si revoca, solo come eccezione con un motivo scritto nel registro modifiche. L'email si può sempre correggere.
          <div style="margin-top:8px"><button class="sm ghost" id="undoqr">QR generato per errore? Annullalo</button></div></div>` : ''}
        ${c.referents.map((r) => `<div class="card flat"><div class="row between"><b>${esc(r.name)}</b><div class="row"><button class="sm ghost" data-email="${r.id}" data-cur="${esc(r.email || '')}">${r.email ? 'Correggi email' : 'Aggiungi email'}</button><button class="sm ghost" data-regen="${r.id}" title="Disattiva il link attuale e ne crea uno nuovo">Rigenera link</button><button class="sm danger" data-delref="${r.id}">Elimina</button></div></div>
          <div class="small muted">${esc(r.role || '')} ${esc(r.email || '')}</div>
          <div class="row" style="margin-top:6px"><input type="text" readonly value="${esc(NET.baseUrl)}/r/${esc(r.token)}" class="mono small"><button class="sm ghost" data-copy="${esc(NET.baseUrl)}/r/${esc(r.token)}">Copia link</button></div>
          <details><summary class="small">QR del link referente</summary>${qrImg(`${NET.baseUrl}/r/${r.token}`, 160)}</details></div>`).join('') || '<p class="muted">Nessun referente.</p>'}
        <div class="grid c3"><input type="text" id="r_name" placeholder="Nome e cognome" aria-label="Nome e cognome del referente"><input type="text" id="r_role" placeholder="Ruolo" aria-label="Ruolo del referente"><input type="email" id="r_email" placeholder="Email" aria-label="Email del referente"></div>
        <div style="margin-top:8px"><button class="sm" id="r_add">Aggiungi referente</button></div>
        <p class="small muted">Il link è personale: chi lo possiede compila la scheda e consolida per l'azienda.</p></div>
    </div>
    <div class="card"><h2>Commitment e verifica</h2><p class="small muted">Lo stato si aggiorna nella call con il leader e con l'item pulse della sessione successiva (§11, §12).</p><div id="commits"><p class="muted small">Caricamento…</p></div></div>
    <div class="card"><h2>Report rilasciati</h2><div id="snaps"><p class="muted small">Caricamento…</p></div></div>
    <div class="card"><h2>Valori consolidati correnti</h2>
      ${R.items.length ? `<table><thead><tr><th>Item</th><th>Livello</th><th class="num">Score</th><th>Confidence</th><th></th></tr></thead><tbody>
        ${R.items.map((it) => `<tr><td>${esc(it.itemId)} ${esc(it.title)}</td><td><b>${levelLabel(it.level, it.sub)}</b>${it.override ? ` <span class="tag warn" title="${esc(it.overrideReason || '')}">override</span>` : ''}</td><td class="num">${fmtScore(it.score)}</td><td class="small">${esc(it.confidence)}</td>
          <td><button class="sm ghost" data-fix="${it.itemId}">Correggi</button></td></tr>`).join('')}</tbody></table>
        <p class="small muted">Una correzione crea una nuova versione del valore e lascia traccia (autore, data, prima/dopo, motivo). I benchmark già congelati non cambiano.</p>
        <a class="btn sm ghost" href="/report/${c.id}" target="_blank">Report</a>` : '<p class="muted">Nessun valore consolidato.</p>'}</div>`;
  const [cm, sn] = await Promise.all([api(`/api/admin/companies/${id}/commitments`), api(`/api/admin/companies/${id}/reports`)]);
  $('#commits').innerHTML = cm.length ? `<table><thead><tr><th>Sessione</th><th>Priorità e azione</th><th>Owner · scadenza</th><th>Stato</th></tr></thead><tbody>${cm.map((m) => `<tr>
    <td class="small">${esc(m.session_title)}</td><td class="small"><b>${esc(m.priority_item)}</b> ${esc(INST.items[m.priority_item]?.title || '')}<br>${esc(m.action)}<br><span class="muted">KPI: ${esc(m.kpi)}</span></td>
    <td class="small">${esc(m.owner)}<br>${esc(m.due_date)}</td>
    <td><select data-cstat="${m.id}">${['aperto', 'avviato', 'completato', 'non avviato', 'sospeso'].map((x) => `<option ${m.status === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <input type="text" data-cnote="${m.id}" placeholder="evidenza / nota" value="${esc(m.status_note || '')}" style="margin-top:4px"><button class="sm ghost" data-csave="${m.id}" style="margin-top:4px">Salva</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted small">Nessun commitment.</p>';
  $$('[data-csave]').forEach((b) => b.onclick = async () => {
    const mid = b.dataset.csave;
    try { await api(`/api/admin/commitments/${mid}/status`, { method: 'PUT', body: { status: $(`[data-cstat="${mid}"]`).value, note: $(`[data-cnote="${mid}"]`).value } }); toast('Stato aggiornato'); } catch (e) { toast(e.message, true); }
  });
  $('#snaps').innerHTML = sn.length ? `<table><tbody>${sn.map((v) => `<tr><td>v${v.version}</td><td>${esc(v.session_title)}</td><td class="small">${fmtDate(v.created_at)}</td><td><a href="/report/${id}?snap=${v.id}" target="_blank">apri</a> · <a href="/api/admin/pdf/${id}?snap=${v.id}">PDF</a></td></tr>`).join('')}</tbody></table>` : '<p class="muted small">Nessun report rilasciato. Il rilascio si fa dalla control room della sessione.</p>';
  bindPick();
  $('#e_save').onclick = async () => { try { await api(`/api/admin/companies/${id}`, { method: 'PUT', body: { name: $('#e_name').value, perimeter: pickValue('e_per'), sector: pickValue('e_sec'), kind: $('#e_kind').value } }); toast('Salvato'); } catch (e) { toast(e.message, true); } };
  $$('[data-consent]').forEach((b) => b.onchange = async () => {
    const reason = prompt('Riferimento o motivo del cambio di consenso (es. "modulo firmato il 10/11", "revoca via email del 3/12")');
    if (!reason) { b.checked = !b.checked; return; }
    try { await api(`/api/admin/companies/${id}/consent`, { method: 'PUT', body: { type: b.dataset.consent, granted: b.checked, reason } }); toast('Consenso aggiornato'); }
    catch (e) { b.checked = !b.checked; toast(e.message, true); }
  });
  // durante il blocco ogni cambio del referente è un'eccezione: si chiede il motivo, che resta nel registro modifiche
  const why = () => { if (!lock) return ''; const m = prompt('Il referente è bloccato dai QR della sessione. Motivo dell\'eccezione (resta nel registro modifiche):'); return m && m.trim() ? m.trim() : null; };
  $('#r_add').onclick = async () => { const reason = why(); if (reason === null) return; try { await api(`/api/admin/companies/${id}/referents`, { method: 'POST', body: { name: $('#r_name').value, role: $('#r_role').value, email: $('#r_email').value, reason } }); viewCompany(id); } catch (e) { toast(e.message, true); } };
  $$('[data-email]').forEach((b) => b.onclick = async () => { const v = prompt('Email del referente (un solo indirizzo):', b.dataset.cur); if (v === null) return; try { await api(`/api/admin/referents/${b.dataset.email}/email`, { method: 'PUT', body: { email: v.trim() } }); viewCompany(id); } catch (e) { toast(e.message, true); } });
  if ($('#undoqr')) $('#undoqr').onclick = async () => { const m = prompt(`Annullare il QR di ${lock.title}? Si può solo se nessuno si è ancora registrato. Motivo (resta nel registro modifiche):`); if (!m || !m.trim()) return; try { await api(`/api/admin/sessions/${lock.id}/companies/${id}/qr`, { method: 'DELETE', body: { reason: m.trim() } }); toast('QR annullato: il referente si può di nuovo cambiare'); viewCompany(id); } catch (e) { toast(e.message, true); } };
  $$('[data-regen]').forEach((b) => b.onclick = async () => { if (!confirm('Il link attuale smetterà di funzionare. Creare un nuovo link per questo referente?')) return; const reason = why(); if (reason === null) return; try { await api(`/api/admin/referents/${b.dataset.regen}/regenerate`, { method: 'POST', body: { reason } }); viewCompany(id); } catch (e) { toast(e.message, true); } });
  $$('[data-delref]').forEach((b) => b.onclick = async () => { if (!confirm('Eliminare il referente? Il suo link smetterà di funzionare.')) return; const reason = why(); if (reason === null) return; try { await api(`/api/admin/referents/${b.dataset.delref}`, { method: 'DELETE', body: { reason } }); viewCompany(id); } catch (e) { toast(e.message, true); } });
  $$('[data-copy]').forEach((b) => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Link copiato'); } catch { prompt('Copia il link', b.dataset.copy); } });
  $$('[data-fix]').forEach((b) => b.onclick = async () => {
    const it = b.dataset.fix;
    const lv = prompt(`${it}: nuovo livello (1–5, vuoto = N.D.)`); if (lv === null) return;
    const subs = lv ? INST.items[it].levels.find((l) => l.level === Number(lv))?.sub : null;
    const sub = subs ? prompt(`Sotto-opzione (${subs.map((s) => s.key).join('/')})`, subs[0].key) : null;
    const reason = prompt('Motivo della correzione (obbligatorio)'); if (!reason) return;
    try { await api('/api/admin/correct', { method: 'POST', body: { companyId: Number(id), itemId: it, level: lv || null, sub, reason } }); toast('Valore corretto'); viewCompany(id); } catch (e) { toast(e.message, true); }
  });
}

// ---------- Benchmark ----------
async function viewBenchmark() {
  const vs = await api('/api/admin/benchmark');
  app.innerHTML = `<h1>Benchmark</h1>
    <div class="card"><p class="ink2">Ogni sessione produce una versione datata del benchmark che non cambia più. Un'azienda recuperata con una sessione ad hoc entra nella versione successiva. Mediana come centro, Q1–Q3 come fascia centrale, N sempre visibile: sotto ${SC.benchmark.minN} aziende non si mostra, tra ${SC.benchmark.minN} e ${SC.benchmark.stableN - 1} è "indicativo".</p>
      <div class="row">${INST.sessions.map((s) => `<button class="sm gold" data-freeze="${s.id}">Congela ${esc(s.name)}</button><a class="btn sm ghost" href="/plenaria/${s.id}" target="_blank">Plenaria ${esc(s.name)}</a>`).join('')}</div></div>
    <div class="card"><table><thead><tr><th>Versione</th><th class="num">N aziende</th><th>Strumento</th><th>Scoring</th><th>Creata</th></tr></thead><tbody>
      ${vs.map((v) => `<tr><td>${esc(v.label)}</td><td class="num">${v.n_companies}</td><td>${esc(v.instrument_version)}</td><td>${esc(v.scoring_version)}</td><td>${fmtDate(v.created_at)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nessuna versione.</td></tr>'}
    </tbody></table></div>`;
  $$('[data-freeze]').forEach((b) => b.onclick = async () => { if (!confirm('Congelare una nuova versione?')) return; const r = await api(`/api/admin/benchmark/${b.dataset.freeze}/freeze`, { method: 'POST' }); toast(`${r.label} · N=${r.n}`); viewBenchmark(); });
}

// ---------- Mappe a quadranti ----------
async function viewMaps() {
  const vs = await api('/api/admin/benchmark');
  app.innerHTML = `<h1>Mappe a quadranti</h1>
    <p class="lede" style="margin-bottom:20px">Una pagina per sessione con le tre mappe della nota (§10.2–10.4): dove intervenire, se il bisogno è individuale o condiviso, con chi accelerare. Usano l'ultima versione congelata del benchmark (nell'ambiente di prova, i dati dimostrativi). I nomi delle aziende sono nascosti finché non li mostri.</p>
    <div class="grid c2">${INST.sessions.map((s) => { const v = vs.find((x) => x.base === s.id); const dims = s.dimensions.map((d) => INST.dimensions.find((x) => x.id === d));
      return `<div class="card sesscard"><h2 style="margin:0">${esc(s.name)}</h2>
        <p class="small muted" style="margin:4px 0 12px">${dims.map((d) => `${d.id} ${esc(d.name)}`).join(' · ')}</p>
        <p class="small" style="margin:0 0 14px">${v ? `Benchmark: <b>${esc(v.label)}</b>, ${v.n_companies} aziende` : '<span class="muted">Benchmark non ancora congelato: per ora solo anteprima</span>'}</p>
        <div class="row" style="margin-top:auto">${v ? `<a class="btn sm" href="/mappe/${s.id}" target="_blank">Apri le mappe</a>` : ''}</div></div>`; }).join('')}</div>`;
}

// ---------- Audit ----------
async function viewAudit() {
  const rows = await api('/api/admin/audit');
  app.innerHTML = `<h1>Registro modifiche</h1><div class="card"><div class="tablewrap"><table><thead><tr><th>Quando</th><th>Chi</th><th>Oggetto</th><th>Azione</th><th>Prima</th><th>Dopo</th><th>Motivo</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td class="small">${fmtDate(r.ts)}</td><td class="small">${esc(r.actor)}</td><td class="small">${esc(r.entity)} ${esc(r.entity_id)}</td><td class="small">${esc(r.action)}</td>
      <td class="small mono">${esc((r.before_json || '').slice(0, 120))}</td><td class="small mono">${esc((r.after_json || '').slice(0, 120))}</td><td class="small">${esc(r.reason || '')}</td></tr>`).join('')}
  </tbody></table></div></div>`;
}

// ---------- Impostazioni ----------
async function viewSettings() {
  NET = await api('/api/admin/network');
  app.innerHTML = `<div class="pagehead"><div><h1>Impostazioni</h1></div></div>
    <h2 class="sethead">Per la sala</h2>
    <div class="card"><h3>Rete</h3>
      <p>Indirizzo usato nei QR: <b class="mono">${esc(NET.baseUrl)}</b></p>
      <p class="small ink2">I telefoni devono raggiungere questo indirizzo. In locale devono essere sulla stessa rete Wi-Fi del computer: se il computer ha più indirizzi, scegli quello della rete della sala. Alcune reti aziendali o per ospiti isolano i dispositivi: in quel caso usa l'hotspot del telefono o un router dedicato.</p>
      <table><tbody>${NET.addresses.map((a) => `<tr><td class="mono">http://${esc(a.address)}:${NET.port}</td><td class="small muted">${esc(a.name)}</td><td><button class="sm ghost" data-url="http://${esc(a.address)}:${NET.port}">Usa questo</button></td></tr>`).join('') || '<tr><td class="muted">Nessuna rete trovata</td></tr>'}</tbody></table>
      <div class="row" style="margin-top:10px"><input type="text" id="custom" placeholder="oppure un indirizzo manuale, es. http://192.168.1.20:3000" value="${esc(NET.custom || '')}" style="max-width:420px"><button class="sm" id="savecustom">Salva</button><button class="sm ghost" id="auto">Automatico</button></div></div>
    <div class="card"><h3>Registrazione dei partecipanti</h3>
      <label class="f" for="o_mode">Come il partecipante indica la sua azienda</label>
      <select id="o_mode" style="max-width:560px"><option value="codice">Con il codice azienda (QR del tavolo o codice comunicato), consigliato</option><option value="elenco">Scegliendo dall'elenco delle aziende (chiunque abbia il QR di sala vede l'elenco)</option></select>
      <label class="f" for="o_priv">Indirizzo dell'informativa privacy ELIS (https://…)</label>
      <input type="text" id="o_priv" style="max-width:560px" placeholder="https://www.elis.org/...">
      <p class="small muted">Il link compare nella pagina di registrazione, accanto alla spiegazione di chi vede le risposte.</p>
      <button class="sm" id="o_save">Salva</button></div>
    <h2 class="sethead">Sistema</h2>
    <div class="grid c2">
      <div class="card"><h3>Dati ed export</h3><p class="small">Database: <span class="mono">${esc(NET.db)}</span>. Per un backup basta copiare la cartella dei dati a server fermo. L'export contiene solo i dati di produzione.</p>
        <a class="btn sm" href="/api/admin/export.xlsx">Scarica export Excel</a></div>
      <div class="card"><h3>Ambiente di prova</h3><p class="small ink2">I dati dimostrativi vivono in un ambiente separato. Per vederli, caricarli o cancellarli scegli <b>Prova</b> nel selettore in alto; per tornare ai dati reali scegli <b>Produzione</b>.</p></div>
      <div class="card"><h3>Password admin</h3><div class="row"><input type="password" id="pw1" placeholder="Nuova password (min. 8)" style="max-width:280px"><button class="sm" id="pwgo">Cambia</button></div></div>
      <div class="card"><h3>Versioni</h3><p class="small" style="margin:0">Strumento <b>${esc(INST.version)}</b> (${esc(INST.status)}) · Scoring <b>${esc(SC.version)}</b></p></div></div>`;
  const O = await api('/api/admin/options');
  $('#o_mode').value = O.joinMode; $('#o_priv').value = O.privacyUrl;
  $('#o_save').onclick = async () => { try { await api('/api/admin/options', { method: 'PUT', body: { joinMode: $('#o_mode').value, privacyUrl: $('#o_priv').value } }); toast('Impostazioni salvate'); } catch (e) { toast(e.message, true); } };
  $$('[data-url]').forEach((b) => b.onclick = async () => { await api('/api/admin/network', { method: 'PUT', body: { url: b.dataset.url } }); toast('Indirizzo aggiornato'); viewSettings(); });
  $('#savecustom').onclick = async () => { await api('/api/admin/network', { method: 'PUT', body: { url: $('#custom').value } }); viewSettings(); };
  $('#auto').onclick = async () => { await api('/api/admin/network', { method: 'PUT', body: { url: '' } }); viewSettings(); };
  $('#pwgo').onclick = async () => { try { await api('/api/admin/password', { method: 'PUT', body: { password: $('#pw1').value } }); toast('Password cambiata'); } catch (e) { toast(e.message, true); } };
}

boot();
