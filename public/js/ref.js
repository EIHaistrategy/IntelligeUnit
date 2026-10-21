import { api, esc, $, $$, toast, poll, distBars, confTag, phaseChips, qrImg, fmtScore, fmtDate, bandTag, levelLabel, alt, icon } from './ui.js';

const T = location.pathname.split('/').pop();
// La stessa pagina serve al facilitatore ELIS (/tavolo-elis/:azienda, dalla console): conduce confronto e consolidamento
// e gestisce i partecipanti; il referente può comunque registrare e correggere dal suo link.
const FAC = location.pathname.startsWith('/tavolo-elis/');
const API = FAC ? `/api/f/${T}` : `/api/r/${T}`;
const reportHref = (snap) => (FAC ? `/report/${me.referent.companyId}?snap=${snap}` : `/report/${me.referent.companyId}?t=${T}&snap=${snap}`);
const pdfHref = (snap) => (FAC ? `/api/admin/pdf/${me.referent.companyId}?snap=${snap}` : `/api/report/${me.referent.companyId}/pdf?t=${T}&snap=${snap}`);
const app = $('#app');
let INST, SC, me;
let stopPoll = null;

const itemScore = (itemId, level, sub) => {
  if (level == null) return null;
  const subs = INST.items[itemId].levels.find((l) => l.level === level)?.sub || [];
  const base = (level - 1) * 25;
  if (!subs.length) return base;
  const k = Math.max(1, subs.findIndex((s) => s.key === sub) + 1);
  return base + ((k - 1) / subs.length) * 25;
};

async function boot() {
  const i = await api('/api/instrument'); INST = i.instrument; SC = i.scoring;
  try { me = await api(`${API}`); } catch (e) {
    app.innerHTML = e.network ? `<div class="card" role="alert"><h2>Connessione non disponibile</h2><p>${esc(e.message)}</p><button onclick="location.reload()">Riprova</button></div>`
      : `<div class="card"><h2>Link non valido</h2><p>${esc(e.message)}</p></div>`;
    return;
  }
  $('#who').textContent = `${me.referent.company} · ${me.referent.name}`;
  if (FAC) document.title = `AI Transformation & Adoption Map · Tavolo ${me.referent.company}`;
  addEventListener('hashchange', route);
  route();
}

function route() {
  if (stopPoll) { stopPoll(); stopPoll = null; }
  const [, view, arg] = location.hash.split('/');
  const go = view === 'scheda' ? renderScheda(arg) : view === 'sessione' ? renderSession(Number(arg)) : renderHome();
  // un link vecchio o di un altro ambiente non lascia la pagina bianca
  return Promise.resolve(go).catch((e) => { app.innerHTML = `<div class="card" role="alert"><h2>Pagina non disponibile</h2><p>${esc(e.message)}</p><a class="btn" href="#/">Torna alle sessioni</a></div>`; });
}

async function renderHome() {
  me = await api(`${API}`);
  const { active, done, later } = splitSessions(me.sessions);
  // Prima della sessione il referente vede solo le domande, in sola lettura, e le inoltra ai colleghi:
  // la compilazione è in presenza, il giorno della sessione.
  const prep = active.find((s) => s.mode === 'workshop' && s.phase === 'preparazione');
  if (!FAC && prep && active.every((s) => s.phase === 'preparazione')) return renderQuestions(prep.base);
  const finished = !active.length && done.length;
  const activeTitle = finished ? 'Programma' : !active.length || active.every((s) => s.phase === 'preparazione') ? 'Prossima sessione' : 'Sessione in corso';
  const activeNote = finished ? 'Le sessioni del programma sono concluse. ELIS vi contatterà per l\'allineamento finale di settembre 2027.'
    : !active.length ? 'Nessuna sessione in programma in questo momento.' : later ? 'Le sessioni successive del programma compariranno qui quando saranno le prossime.' : '';
  // al telefono la sessione attiva viene subito dopo l'intestazione; report e sessioni concluse sotto
  app.innerHTML = `${FAC ? `<a class="back" href="/admin">${icon('back')} Console ELIS</a>` : ''}
    <div class="pagehead"><div><h1>${esc(me.referent.company)}</h1>
      <p>Perimetro valutato: <b>${esc(me.referent.perimeter || 'non indicato')}</b></p></div></div>
    ${sessionsCard(activeTitle, active, activeNote, true)}
    ${reportsCard()}
    ${done.length ? sessionsCard('Sessioni concluse', done, '', false) : ''}`;
}

// report rilasciati: restano raggiungibili anche quando la pagina mostra solo le domande della sessione successiva
const reportsCard = () => (me.reports.length ? `<div class="card"><h2>Report riservati</h2><div class="sesslist">${me.reports.map((v) => `<div class="sessrow">
      <div class="sr-main"><h3 class="sr-title">${esc(v.session_title)}</h3>${v.version > 1 ? ` <span class="tag">versione ${v.version}</span>` : ''}</div>
      <div class="small muted sr-sub">rilasciato il ${dOnly(v.created_at)}</div>
      <div class="sr-act row"><a class="btn sm ghost" href="${reportHref(v.id)}" target="_blank">Apri il report<span class="sr-only"> di ${esc(v.session_title)} (si apre in una nuova scheda)</span></a>
        <a class="btn sm ghost" href="${pdfHref(v.id)}">Scarica PDF<span class="sr-only"> di ${esc(v.session_title)}</span></a></div></div>`).join('')}</div></div>` : '');

const dOnly = (d) => fmtDate(d).split(',')[0]; // al referente basta il giorno

// Si mostra solo la sessione in corso o la prossima del calendario (più eventuali sessioni ad hoc aperte):
// le successive compaiono quando arriva il loro turno; sotto, le sessioni concluse a cui l'azienda ha partecipato.
// Sessioni in sala (individuale, confronto, consolidamento) sempre visibili, anche se una precedente non è stata chiusa;
// in più la prima in preparazione, per compilare la scheda in anticipo.
function splitSessions(list) {
  const open = list.filter((s) => s.phase !== 'chiusa');
  const inRoom = open.some((s) => ['individuale', 'confronto'].includes(s.phase)); // mentre si è in sala, solo quella
  const nextPrep = inRoom ? null : open.find((s) => s.mode === 'workshop' && s.phase === 'preparazione');
  const active = open.filter((s) => s.phase !== 'preparazione' || s === nextPrep || s.mode !== 'workshop');
  const later = open.some((s) => !active.includes(s));
  const done = list.filter((s) => s.phase === 'chiusa' && (s.participants > 0 || s.consolidated_at));
  return { active, done, later };
}

// Le sei fasi che si ripetono in ogni sessione: le prime quattro sono dell'azienda, le ultime due di ELIS.
// "Tocca a voi" segna il passo che il referente può fare adesso; il pulsante principale dice quell'azione.
function phases(s) {
  const closed = s.phase === 'chiusa';
  const report = me.reports.find((v) => v.session_id === s.id); // l'ultima versione rilasciata (elenco dal più recente)
  const az = [
    { label: 'Partecipanti', done: s.participants > 0, detail: s.participants ? `${s.participants} ${s.participants === 1 ? 'partecipante' : 'partecipanti'}` : '' },
    { label: 'Consolidamento', done: !!s.consolidated_at, todo: s.phase === 'consolidamento' && !s.consolidated_at, detail: s.consolidated_at ? dOnly(s.consolidated_at) : '' },
    { label: 'Commitment', done: !!s.commitment, todo: ['consolidamento', 'chiusa'].includes(s.phase) && !!s.consolidated_at && !s.commitment },
  ];
  const elisWait = closed ? 'in attesa di ELIS' : 'dopo la sessione';
  const elis = [
    { label: 'Report rilasciato', done: !!s.report_released_at, detail: s.report_released_at ? dOnly(s.report_released_at) : elisWait,
      href: report ? reportHref(report.id) : null },
    { label: 'Call con il leader', done: !!s.leader_call, detail: s.leader_call ? '' : elisWait },
  ];
  return { az, elis, all: [...az, ...elis] };
}

function steps(s) {
  const { az, elis } = phases(s);
  const li = (x) => {
    const state = x.done ? 'fatto' : x.todo ? 'tocca a voi' : 'non ancora';
    const body = `${x.label}<span class="sr-only">: ${state}${x.detail ? ',' : ''}</span>${x.detail ? `<small>${esc(x.detail)}</small>` : ''}${!x.done && x.todo ? '<small class="todo-t" aria-hidden="true">tocca a voi</small>' : ''}`;
    return `<li class="${x.done ? 'ok' : x.todo ? 'todo' : ''}"><span class="si" aria-hidden="true">${x.done ? icon('check') : x.todo ? icon('dot') : ''}</span>
      <span>${x.href ? `<a href="${x.href}" target="_blank">${body}<span class="sr-only"> (apri il report in una nuova scheda)</span></a>` : body}</span></li>`;
  };
  return `<div class="steps6"><div class="sg"><span class="sgl" id="sga-${s.id}">La vostra azienda</span><ol role="list" aria-labelledby="sga-${s.id}">${az.map(li).join('')}</ol></div>
    <div class="sg elis"><span class="sgl" id="sge-${s.id}">ELIS</span><ol role="list" aria-labelledby="sge-${s.id}">${elis.map(li).join('')}</ol></div></div>`;
}

// Pulsante principale = l'azione del passo "tocca a voi"; altrimenti un link secondario alla sessione.
function actions(s) {
  const todo = phases(s).az.find((x) => x.todo && !x.done);
  const see = (main) => `<a class="btn sm ${main ? '' : 'ghost'}" href="#/sessione/${s.id}">Vedi la sessione<span class="sr-only"> ${esc(s.title)}</span></a>`;
  const scheda = () => `<a class="btn sm ghost" href="#/scheda/${s.base}">Le domande<span class="sr-only"> di ${esc(s.title)}</span></a>`;
  if (!todo) return `${see(false)}${scheda()}`;
  const verb = todo.label === 'Consolidamento' ? 'Registra il consolidamento' : 'Scrivi il commitment';
  return `<a class="btn sm" href="#/sessione/${s.id}">${verb}<span class="sr-only"> di ${esc(s.title)}</span></a>${scheda()}`;
}

function sessionsCard(title, list, note, open) {
  // righe a blocchi invece di una tabella: sul telefono del referente tutto resta visibile senza scorrere di lato.
  // Le sessioni concluse sono compatte (riepilogo), la striscia completa si apre con un clic.
  const row = (s) => {
    const head = `<h3 class="sr-title">${esc(s.title)}</h3>${s.mode === 'adhoc' ? ' <span class="tag gold">ad hoc</span>' : ''}
      <span class="tag ${['chiusa', 'preparazione'].includes(s.phase) ? '' : 'navy'}">${s.phase === 'preparazione' ? 'In preparazione' : esc(s.phase.charAt(0).toUpperCase() + s.phase.slice(1))}</span>`;
    if (open) return `<section class="sessrow" aria-label="${esc(s.title)}"><div class="sr-main">${head}</div>${steps(s)}<div class="sr-act row">${actions(s)}</div></section>`;
    const all = phases(s).all, n = all.filter((x) => x.done).length, miss = all.filter((x) => !x.done).map((x) => x.label.replace('&#8209;', '-').toLowerCase());
    return `<section class="sessrow" aria-label="${esc(s.title)}"><div class="sr-main">${head}</div>
      <details class="sr-more"><summary class="small">${n} di ${all.length} fasi fatte${miss.length ? ` · manca: ${esc(miss.join(', '))}` : ''}</summary>${steps(s)}</details>
      <div class="sr-act row">${actions(s)}</div></section>`;
  };
  return `<div class="card"><h2>${title}</h2>${list.length ? `<div class="sesslist">${list.map(row).join('')}</div>` : ''}
    ${note ? `<p class="small muted" style="margin:${list.length ? '12px' : '0'} 0 0">${note}</p>` : ''}</div>`;
}

// ---------- Domande della sessione (sola lettura) ----------
// Le domande dei temi con i livelli e le domande della scheda pre-sessione: si consultano e si inoltrano, non si compilano.
async function renderScheda(base) { return renderQuestions(base); }

async function renderQuestions(base) {
  const r = await api(`${API}/presession/${base}`);
  const S = INST.sessions.find((x) => x.id === base);
  const date = S.date ? new Date(`${S.date}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const byItem = {};
  r.fields.facts.forEach((f) => (byItem[f.itemId] ||= []).push(f));
  const opts = (list) => `<ul class="opt-list">${list.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>`;
  const factAnswer = (f) => (f.type === 'choice' || f.type === 'multi') ? opts(f.options.map((o) => o.label))
    : `<p class="small muted" style="margin:4px 0 0">${f.type === 'percent' ? 'Una percentuale' : 'Un numero'}</p>`;
  const subject = `AI Transformation & Adoption Map: le domande di ${S.name}${S.date ? ` del ${S.date.split('-').reverse().join('/')}` : ''}`;
  const body = `Buongiorno,\n${date ? `il ${date} ` : ''}parteciperemo alla sessione ${S.name} di AI Transformation & Adoption Map. Ecco le domande a cui risponderemo in sala, per prepararci (da questa pagina non si risponde):\n${location.origin}/anteprima/${base}\n\nIn sala ognuno risponde dal telefono, per conto suo: inquadrerete il QR sul tavolo dell'azienda e sceglierete il vostro nome dall'elenco. Portate il telefono carico.`;
  app.innerHTML = `
    <div class="pagehead"><div><h1>${esc(S.name)}${date ? ` · ${esc(date)}` : ''}</h1>
      <p>Le domande a cui risponderete in sala. Da questa pagina non si risponde: la compilazione è in presenza, il giorno della sessione.</p></div></div>
    <div class="row" style="margin-bottom:18px"><a class="btn" href="mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}">Inoltra le domande ai colleghi</a>
      <span class="small muted">Si apre il programma di posta con il testo pronto, senza il vostro link personale.</span></div>
    <h2 class="sethead">Le domande della sessione</h2>
    ${S.items.map((id, i) => { const it = INST.items[id]; return `<section class="card" aria-labelledby="q-${id}">
      <div class="qmeta"><span>Domanda ${i + 1} di ${S.items.length}</span><span class="tag navy">${esc(id)}</span></div>
      <h3 id="q-${id}" class="qtitle">${esc(it.title)}</h3><p class="statement">${esc(it.statement)}</p>
      <ol class="preview-levels">${it.levels.map((l) => `<li><span class="n" aria-hidden="true">${l.level}${alt(l.level)}</span><span><span class="sr-only">Livello ${l.level}: </span>${esc(l.descriptor)}</span></li>`).join('')}</ol>
      ${byItem[id] ? `<div class="rq-facts"><h4>In sala vi chiederemo anche</h4>${byItem[id].map((f) => `<div class="rq-fact"><p>${esc(f.q)}</p>${factAnswer(f)}</div>`).join('')}</div>` : ''}</section>`; }).join('')}
    ${(S.pairs || []).length ? `<section class="card"><h3 class="qtitle">Confronti a coppie</h3><p class="small ink2">Dopo le domande: tra due temi della sessione, quale è più avanti nella vostra azienda?</p>
      <ul>${S.pairs.map(([a, b]) => `<li>${INST.pairQuestion.replace('{a}', `<b>${esc(INST.items[a].pairLabel || INST.items[a].title)}</b>`).replace('{b}', `<b>${esc(INST.items[b].pairLabel || INST.items[b].title)}</b>`)}</li>`).join('')}</ul></section>` : ''}
    ${r.fields.profile.length ? `<section class="card"><h3 class="qtitle">Profilo di approccio</h3><p class="small muted">Domande fuori punteggio: descrivono come l'azienda si trasforma, non quanto è avanti.</p>
      ${r.fields.profile.map((p) => `<div class="rq-fact"><p>${esc(p.q)}</p>${p.type === 'percent' ? '<p class="small muted" style="margin:4px 0 0">Una percentuale</p>' : opts(p.options)}</div>`).join('')}</section>` : ''}
    ${me?.reports?.length ? reportsCard() : ''}`;
}

// ---------- Sessione ----------
let sess = null, phaseShown = null;

async function renderSession(sid) {
  sess = await api(`${API}/session/${sid}`);
  phaseShown = sess.session.phase;
  draw();
  stopPoll = poll(async () => applyUpdate(await api(`${API}/session/${sid}`)), 4000);
}

const who = (by) => (String(by || '').startsWith('admin') ? 'dal facilitatore ELIS' : 'dal referente');
// Applica i dati nuovi del server senza cancellare quello che si sta scrivendo (modulo del partecipante, commitment, motivi).
function applyUpdate(s) {
  const phaseChanged = s.session.phase !== phaseShown;
  if (editingP && (phaseChanged || !s.participants.some((p) => p.id === editingP))) editingP = null;
  if (editingP) return; // si aggiorna dopo Salva o Annulla, confrontando con i dati di prima: nessun evento va perso
  const partsChanged = JSON.stringify(s.participants) !== JSON.stringify(sess.participants);
  const cmpChanged = JSON.stringify(s.consolidation?.comparison) !== JSON.stringify(sess.consolidation?.comparison);
  const otherConfirmed = s.consolidation && sess.consolidation && s.consolidation.consolidatedAt !== sess.consolidation.consolidatedAt;
  sess = s;
  if (phaseChanged) { phaseShown = s.session.phase; draw(); return; }
  if (partsChanged) drawParticipants();
  if (s.session.phase === 'confronto') { if (cmpChanged) drawComparison(); return; }
  if (!['consolidamento', 'chiusa'].includes(s.session.phase) || !s.consolidation) return;
  if (otherConfirmed) { toast(`Il consolidamento è stato confermato ${who(s.consolidation.consolidatedBy || s.consolidation.draft?.by)}: valori aggiornati`); drawConsolidation(); return; }
  if (cmpChanged) refreshItems();
  syncDraft();
}

// partecipanti cambiati durante il consolidamento: mediane e confidence ricalcolate, scelte già fatte invariate
function refreshItems() {
  const editable = sess.session.phase === 'consolidamento';
  sess.consolidation.items.forEach((it) => drawItem(it, editable));
  if ($('#cmpview')) $('#cmpview').innerHTML = comparisonHtml(sess.consolidation.comparison);
  if (sess.consolidation.consolidatedAt && editable) toast('I partecipanti sono cambiati dopo la conferma: rivedete i valori e confermate di nuovo il consolidamento', true);
}

// scelte fatte dall'altra persona (facilitatore o referente) sugli item che qui non si stanno modificando
function syncDraft() {
  const d = sess.consolidation.draft || {};
  if (!d.rev || d.rev === draftRev) return;
  draftRev = d.rev;
  const changed = [];
  for (const it of sess.consolidation.items) {
    const x = d.items?.[it.itemId]; const f = form[it.itemId];
    if (!x || !f || dirty.has(it.itemId)) continue;
    if (x.level !== f.level || (x.sub ?? null) !== (f.sub ?? null) || (x.overrideReason || '') !== (f.overrideReason || '')) {
      form[it.itemId] = { level: x.level ?? null, sub: x.sub ?? null, overrideReason: x.overrideReason || '' };
      drawItem(it, sess.session.phase === 'consolidamento'); changed.push(it.itemId);
    }
  }
  if (changed.length) toast(`${changed.join(', ')} ${changed.length === 1 ? 'aggiornato' : 'aggiornati'} ${who(d.by)}`);
}

function draw() {
  const s = sess.session;
  const intro = {
    preparazione: 'I partecipanti possono già registrarsi con il QR. La fase individuale la apre il facilitatore.',
    individuale: 'Fase individuale (10 minuti): ognuno risponde da solo, senza vedere le risposte degli altri.',
    confronto: 'Confronto (10 minuti): guardate insieme dove le risposte divergono e su quali evidenze si basano.',
    consolidamento: FAC ? 'Consolidamento (10 minuti): registra con il tavolo la posizione ufficiale dell\'azienda, poi priorità e commitment. Anche il referente può registrare e correggere dal suo link.'
      : 'Consolidamento (10 minuti): il facilitatore ELIS registra con voi la posizione ufficiale dell\'azienda, poi priorità e commitment. Potete registrarla o correggerla anche da qui.',
    chiusa: 'Sessione chiusa.',
  }[s.phase];
  app.innerHTML = `<a class="back" href="#/">${icon('back')} Sessioni</a>
    <div class="sesshead"><div class="pagehead"><h1>${esc(s.title)}</h1>${phaseChips(s.phase)}</div><p class="phaseintro">${intro}</p></div>
    <div id="parts"></div><div id="body"></div>`;
  drawParticipants();
  if (s.phase === 'confronto') drawComparison();
  if (['consolidamento', 'chiusa'].includes(s.phase)) drawConsolidation();
}

let editingP = null; // partecipante che il facilitatore sta correggendo: l'aggiornamento automatico non lo cancella
function drawParticipants() {
  const el = $('#parts'); if (!el) return;
  const showQr = ['preparazione', 'individuale'].includes(sess.session.phase);
  // il facilitatore interviene in ogni fase finché la sessione è aperta; il referente rimuove solo durante la registrazione
  const canRm = FAC ? sess.session.phase !== 'chiusa' : showQr;
  const fnOpts = (cur) => INST.functions.map((f) => `<option value="${f.id}" ${f.id === cur ? 'selected' : ''}>${esc(f.label)}</option>`).join('');
  const prow = (p) => (editingP === p.id
    ? `<tr><td colspan="4"><div class="grid c2"><input type="text" id="pe_name" maxlength="120" value="${esc(p.name)}" aria-label="Nome e cognome"><select id="pe_func" aria-label="Funzione">${fnOpts(p.func)}</select></div>
        <div class="row" style="margin-top:6px"><button class="sm" id="pe_save">Salva</button><button class="sm ghost" id="pe_cancel">Annulla</button></div></td></tr>`
    : `<tr><td>${esc(p.name)}</td><td class="small muted">${esc(INST.functions.find((f) => f.id === p.func)?.label || p.func)}</td>
        <td>${p.submitted ? '<span class="tag ok">inviato</span>' : '<span class="tag">in corso</span>'}</td>
        <td class="actions">${FAC && canRm ? `<button class="sm ghost" data-edit="${p.id}" aria-label="Correggi nome o funzione di ${esc(p.name)}">Correggi</button>` : ''}${canRm ? `<button class="sm danger" data-rm="${p.id}" title="Rimuovi una registrazione errata">Rimuovi</button>` : ''}</td></tr>`);
  el.innerHTML = `<div class="card"><div class="grid ${showQr ? 'c2' : ''}">
    <div><h2>${FAC ? 'Partecipanti' : 'Partecipanti della vostra azienda'} <span class="muted" style="font-family:var(--font);font-weight:600">${sess.participants.length}</span></h2>
      ${sess.participants.length ? `<table><tbody>${sess.participants.map(prow).join('')}</tbody></table>`
        : '<p class="muted">Nessuno registrato. Fate inquadrare il QR ai partecipanti.</p>'}
      ${FAC ? `<p class="small">Manca una persona nell'elenco «Chi sei?»? <a href="/admin#/azienda/${me.referent.companyId}" target="_blank">Aggiungila tra le persone iscritte</a>.</p>` : ''}
      <p class="small muted">Sono attesi 3–4 partecipanti tra le funzioni protagoniste della sessione. La confidence è alta con almeno 3 risposte valide da almeno 2 funzioni diverse.</p></div>
    ${showQr ? `<div style="text-align:center">${qrImg(sess.joinUrl, 200)}<p style="margin-top:10px">Codice azienda: <b class="mono" style="font-size:1.3rem;letter-spacing:.15em">${esc(new URL(sess.joinUrl).searchParams.get('c') || '')}</b></p><p class="small mono" style="word-break:break-all">${esc(sess.joinUrl)}</p></div>` : ''}
  </div></div>`;
  $$('[data-edit]').forEach((b) => b.onclick = () => { editingP = Number(b.dataset.edit); drawParticipants(); $('#pe_name')?.focus(); });
  if ($('#pe_cancel')) $('#pe_cancel').onclick = async () => { editingP = null; drawParticipants(); applyUpdate(await api(`${API}/session/${sess.session.id}`)); };
  if ($('#pe_save')) $('#pe_save').onclick = async () => {
    try {
      await api(`${API}/session/${sess.session.id}/participant/${editingP}`, { method: 'PUT', body: { name: $('#pe_name').value, func: $('#pe_func').value } });
      editingP = null; toast('Partecipante corretto'); applyUpdate(await api(`${API}/session/${sess.session.id}`));
    } catch (e) { toast(e.message, true); }
  };
  $$('[data-rm]').forEach((b) => b.onclick = async () => {
    const after = sess.consolidation?.consolidatedAt ? ' Il consolidamento è già confermato: dopo la rimozione rivedete i valori e confermatelo di nuovo.' : '';
    if (!confirm(`Rimuovere questa registrazione? Le sue risposte non verranno considerate.${after}`)) return;
    try { await api(`${API}/session/${sess.session.id}/participant/${b.dataset.rm}`, { method: 'DELETE', body: { reason: 'Registrazione errata' } }); applyUpdate(await api(`${API}/session/${sess.session.id}`)); }
    catch (e) { toast(e.message, true); }
  });
}

function comparisonHtml(c) {
  return `<div class="grid c2">${c.items.map((it) => `<div class="card"><div class="cardhead"><h3>${esc(it.itemId)} · ${esc(it.title)}</h3>${confTag(it.confidence)}</div>
    ${distBars(it.summary)}
    <dl class="facts"><div><dt>Mediana</dt><dd>${it.summary.median ?? '—'}</dd></div><div><dt>Range</dt><dd>${it.summary.range ?? '—'}</dd></div><div><dt>Valide</dt><dd>${it.summary.valid}</dd></div><div><dt>N.D.</dt><dd>${it.summary.nd}</dd></div><div><dt>Funzioni</dt><dd>${it.summary.perspectives}</dd></div></dl>
    ${it.summary.divergent ? '<div class="banner warn">Divergenza ≥ 2 livelli: discussione obbligatoria prima del consolidamento.</div>' : ''}</div>`).join('')}</div>
    <div class="card"><h3>Confronti a coppie</h3>${c.pairs.map((p) => `<p><b>${esc(p.a)} ${esc(p.aTitle)}</b>: ${p.counts.A} · <b>${esc(p.b)} ${esc(p.bTitle)}</b>: ${p.counts.B} · N.D.: ${p.counts.ND}
</p>${p.discordant ? `<p class="note risk">${p.discordant} su ${p.evaluable} in contrasto con i livelli scelti dalla stessa persona: punto da chiarire</p>` : ''}`).join('')}</div>`;
}

function drawComparison() {
  $('#body').innerHTML = comparisonHtml(sess.consolidation.comparison);
}

// ---------- Consolidamento ----------
let form = {};
let saveTimer, draftRev = 0;
const dirty = new Set(); // item modificati qui e non ancora salvati: le modifiche dell'altra persona non li toccano
function saveDraftSoon(itemId) {
  dirty.add(itemId);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const ids = [...dirty];
    try {
      const r = await api(`${API}/session/${sess.session.id}/draft`, { method: 'PUT', body: { items: Object.fromEntries(ids.map((id) => [id, form[id]])) } });
      ids.forEach((id) => dirty.delete(id)); if (r?.rev) draftRev = Math.max(draftRev, r.rev);
    } catch { /* riprova alla prossima modifica */ }
  }, 600);
}

function drawConsolidation() {
  const C = sess.consolidation;
  const done = !!C.consolidatedAt;
  const editable = sess.session.phase === 'consolidamento';
  form = {}; dirty.clear(); draftRev = C.draft?.rev || 0;
  for (const it of C.items) {
    const d = it.draft || {};
    const cur = C.current[it.itemId];
    const fromCur = done && cur ? { level: cur.level, sub: cur.sub, overrideReason: cur.override_reason } : null;
    form[it.itemId] = fromCur || { level: d.level ?? it.proposed ?? null, sub: d.sub ?? null, overrideReason: d.overrideReason ?? '' };
  }
  $('#body').innerHTML = `
    ${done ? `<div class="banner ok">Consolidamento confermato il ${fmtDate(C.consolidatedAt)}. ${editable ? 'Finché la fase è aperta potete correggerlo e confermare di nuovo: la versione precedente resta nello storico.' : ''}</div>` : ''}
    ${!editable && !done ? '<div class="banner warn">Il consolidamento non è stato completato. Contattate il facilitatore ELIS.</div>' : ''}
    <details class="card"><summary>Rivedi la vista di confronto</summary><div style="margin-top:12px" id="cmpview">${comparisonHtml(C.comparison)}</div></details>
    <div id="items"></div>
    ${editable ? '<div class="card"><div id="errs" role="alert"></div>' + (done ? '<label class="f" for="chg">Motivo della modifica (il consolidamento era già confermato) *</label><input type="text" id="chg" maxlength="1000" style="margin-bottom:10px">' : '') + '<button class="big" id="confirm">Conferma il consolidamento</button><p class="small muted" style="margin-top:8px">Livello ufficiale e sotto-opzione diventano il dato dell\'azienda per questa sessione.</p></div>' : ''}
    <div id="summary"></div><div id="commit"></div>`;
  C.items.forEach((it) => drawItem(it, editable));
  const btn = $('#confirm');
  if (btn) btn.onclick = async () => {
    btn.disabled = true;
    try {
      await api(`${API}/session/${sess.session.id}/confirm`, { method: 'POST', body: { items: form, changeReason: $('#chg')?.value || '', baseConsolidatedAt: C.consolidatedAt || null } });
      toast('Consolidamento confermato');
      sess = await api(`${API}/session/${sess.session.id}`); drawConsolidation(); $('#summary').scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      if (e.status === 409) { toast(e.message, true); sess = await api(`${API}/session/${sess.session.id}`); drawConsolidation(); return; }
      $('#errs').innerHTML = `<div class="banner risk">${esc(e.message)}</div>`; btn.disabled = false;
      const first = (e.message.match(/\b(Q\d+)\b/) || [])[1];
      const target = first && document.getElementById(`it-${first}`);
      if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); const f = target.querySelector('textarea, button.level'); if (f) setTimeout(() => f.focus({ preventScroll: true }), 400); }
    }
  };
  if (done) { drawSummary(); drawCommitment(editable || sess.session.phase === 'chiusa'); }
}

function drawItem(it, editable) {
  let host = $(`#it-${it.itemId}`);
  if (!host) { host = document.createElement('div'); host.id = `it-${it.itemId}`; host.className = 'card'; $('#items').appendChild(host); }
  const f = form[it.itemId];
  const s = it.summary;
  const lv = it.levels.find((l) => l.level === f.level);
  const subs = lv?.sub || [];
  if (subs.length && !subs.some((x) => x.key === f.sub)) f.sub = lv.suggestion?.maps || subs[0].key;
  if (!subs.length) f.sub = null;
  const override = s.medianIsInteger && f.level != null && f.level !== s.median;
  const score = itemScore(it.itemId, f.level, f.sub);
  const dis = editable ? '' : 'aria-disabled="true" style="pointer-events:none"';
  host.innerHTML = `<div class="row between" style="align-items:flex-start"><div><span class="tag navy">${esc(it.itemId)}</span><h2 style="margin-top:6px">${esc(it.title)}</h2></div><div class="kpi" style="text-align:right">${s.valid === 0 ? 'N.D.' : fmtScore(score)}<small> /100</small></div></div>
    <p class="statement">${esc(it.statement)}</p>
    <div class="row" style="margin-bottom:12px"><span class="small ink2">Mediana <b>${s.median ?? '—'}</b>, range ${s.range ?? '—'}, ${s.valid} risposte valide, ${s.nd} N.D.</span>${confTag(it.confidence)}</div>
    ${s.valid === 0 ? '<div class="banner warn">Nessun partecipante ha visibilità su questo item: il risultato ufficiale resta N.D. e non entra nel benchmark.</div>' : `
    ${s.medianIsInteger ? `<div class="banner info">Mediana proposta: livello ${s.median}. Confermatela o scegliete un altro livello motivando.</div>` : `<div class="banner warn">Mediana ${String(s.median).replace('.', ',')}: scegliete il livello il cui descrittore rappresenta meglio la situazione osservabile.</div>`}
    <h4 class="stepnum"><span>1</span>Livello ufficiale</h4>
    <div class="levels" role="group" aria-label="Livello ufficiale ${esc(it.itemId)}" ${dis}>${it.levels.map((l) => `<button type="button" class="level ${f.level === l.level ? 'sel' : ''}" data-l="${l.level}" aria-pressed="${f.level === l.level}" ${editable ? '' : 'disabled'}><span class="n" aria-hidden="true">${l.level}${alt(l.level)}</span><span><span class="sr-only">Livello ${l.level}: </span>${esc(l.descriptor)} ${l.valoriale ? '<span class="tag gold">valoriale</span>' : ''}</span></button>`).join('')}</div>
    ${override ? `<label class="f" for="reason-${it.itemId}">Motivazione dell'override (il livello differisce dalla mediana) *</label><textarea id="reason-${it.itemId}" data-reason maxlength="1000" ${editable ? '' : 'disabled'}>${esc(f.overrideReason || '')}</textarea>` : ''}
    ${subs.length ? `<h4 class="stepnum" style="margin-top:20px"><span>2</span>Sotto-opzione (scelta forzata)</h4>
      ${lv.suggestion ? (lv.suggestion.value != null && lv.suggestion.value !== '' && !(Array.isArray(lv.suggestion.value) && !lv.suggestion.value.length) ? `<div class="fact">Dalla scheda pre-sessione: «${esc(Array.isArray(lv.suggestion.value) ? lv.suggestion.value.join(', ') : lv.suggestion.value)}» → indica <b>${f.level}${esc(lv.suggestion.maps || '')}</b></div>` : '') : ''}
      <div class="subchoice" role="group" aria-label="Sotto-opzione ${esc(it.itemId)}" ${dis}>${subs.map((x) => `<button type="button" class="level ${f.sub === x.key ? 'sel' : ''}" data-s="${x.key}" aria-pressed="${f.sub === x.key}" ${editable ? '' : 'disabled'}><span class="n" aria-hidden="true">${f.level}${x.key}</span><span><span class="sr-only">Opzione ${f.level}${x.key}: </span>${esc(x.text)}</span></button>`).join('')}</div>
      <p class="small muted">Se non ci sono evidenze sufficienti per un'opzione superiore, vale la prima opzione del livello.</p>` : f.level ? '<p class="small muted">Il livello scelto non ha sotto-opzioni.</p>' : ''}`}`;
  if (!editable) return;
  const refocus = (sel) => { const el = host.querySelector(sel); if (el) el.focus({ preventScroll: true }); };
  $$('[data-l]', host).forEach((b) => b.onclick = () => { f.level = Number(b.dataset.l); f.sub = null; drawItem(it, editable); saveDraftSoon(it.itemId); refocus(`[data-l="${f.level}"]`); });
  $$('[data-s]', host).forEach((b) => b.onclick = () => { f.sub = b.dataset.s; drawItem(it, editable); saveDraftSoon(it.itemId); refocus(`[data-s="${f.sub}"]`); });
  const r = $('[data-reason]', host); if (r) r.oninput = () => { f.overrideReason = r.value; saveDraftSoon(it.itemId); };
}

function drawSummary() {
  const C = sess.consolidation;
  $('#summary').innerHTML = `<div class="card"><h2>Risultato consolidato</h2>
    <div class="tablewrap"><table><thead><tr><th>Item</th><th>Livello</th><th class="num">Score</th><th>Confidence</th></tr></thead><tbody>
    ${C.def.items.map((id) => { const c = C.current[id]; return `<tr><td>${esc(id)} ${esc(INST.items[id].title)}</td><td><b>${levelLabel(c?.level, c?.sub)}</b>${c?.override ? ' <span class="tag warn">override</span>' : ''}</td><td class="num">${fmtScore(c?.score)}</td><td>${esc(c?.confidence_label || '')}</td></tr>`; }).join('')}
    </tbody></table></div>
    <h3 style="margin-top:14px">Dimensioni</h3>
    <div class="dimlist">${C.summary.dims.map((d) => `<div><span class="dim-letter">${d.id}</span><b>${esc(d.name)}</b><span class="kpi" style="font-size:1.3rem">${fmtScore(d.score)}</span>${bandTag(d.score, SC)}</div>`).join('')}</div>
    ${C.summary.coherence.length ? `<h3>Lettura di coerenza</h3>${C.summary.coherence.map((r) => `<p><b>${r.id} · ${esc(r.label)}</b>: ${r.flagged ? `<span class="tag risk">da esaminare</span> ${esc(r.signal)}` : r.comparisons.some((x) => x.status === 'prudenza') ? '<span class="tag teal">prudenza</span> l\'abilitante è più avanti' : '<span class="tag ok">coerente</span>'}</p>`).join('')}
      <p class="small muted">La lettura completa, con il benchmark, arriva nel report riservato e si discute nella call con il leader.</p>` : ''}</div>`;
}

function drawCommitment(editable) {
  const C = sess.consolidation;
  const c = C.commitment || {};
  const sug = C.suggestedPriorities;
  $('#commit').innerHTML = `<div class="card"><h2>Priorità e commitment</h2>
    <p class="small ink2">Una capacità della sessione su cui l'azienda decide di concentrarsi. Se manca il tempo in sala si può completare nel pomeriggio.</p>
    ${sug.length ? `<p class="small">Ordine proposto (non sostituisce il vostro giudizio): ${sug.map((p) => `<b>${p.dimension}</b> ${esc(p.name)} (${p.reasons.join('; ') || 'nessun segnale'})`).join(' · ')}</p>` : ''}
    <label class="f" for="c_item">Priorità *</label><select id="c_item">${C.def.items.map((id) => `<option value="${id}" ${c.priority_item === id ? 'selected' : ''}>${id} · ${esc(INST.items[id].title)}</option>`).join('')}</select>
    <label class="f" for="c_action">Azione: comportamento o processo concreto da introdurre o rafforzare</label><textarea id="c_action" maxlength="2000">${esc(c.action || '')}</textarea>
    <div class="grid c2"><div><label class="f" for="c_owner">Owner</label><input type="text" id="c_owner" maxlength="200" value="${esc(c.owner || '')}"></div>
    <div><label class="f" for="c_due">Scadenza</label><input type="date" id="c_due" value="${esc(c.due_date || '')}"></div></div>
    <label class="f" for="c_kpi">KPI / evidenza: segnale osservabile per verificare il progresso</label><input type="text" id="c_kpi" maxlength="1000" value="${esc(c.kpi || '')}">
    <label class="check"><input type="checkbox" id="c_peer" ${c.peer_interest ? 'checked' : ''}> Vorremmo un confronto con altre aziende della community su questa priorità</label>
    <input type="text" id="c_peernote" aria-label="Nota per il peer matching" maxlength="1000" placeholder="Nota per il peer matching (facoltativa)" value="${esc(c.peer_note || '')}">
    ${editable ? '<div style="margin-top:12px"><button id="c_save">Salva priorità e commitment</button></div>' : ''}</div>`;
  const b = $('#c_save');
  if (b) b.onclick = async () => {
    try {
      await api(`${API}/session/${sess.session.id}/commitment`, { method: 'PUT', body: {
        priority_item: $('#c_item').value, action: $('#c_action').value, owner: $('#c_owner').value, due_date: $('#c_due').value,
        kpi: $('#c_kpi').value, peer_interest: $('#c_peer').checked, peer_note: $('#c_peernote').value } });
      toast('Commitment salvato');
    } catch (e) { toast(e.message, true); }
  };
}

boot();
