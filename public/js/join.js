import { api, esc, $, $$, toast, poll, distBars, confTag, phaseChips, alt } from './ui.js';

const code = location.pathname.split('/').pop();
const preCompany = (new URLSearchParams(location.search).get('c') || '').toUpperCase();
const KEY = `aito_p_${code}`;
const app = $('#app');
let tok = null; try { tok = localStorage.getItem(KEY); } catch { /* storage non disponibile */ }
let state = null;
let step = 0;
let lastPhase = null;
let lastComparisonKey = '';
let closedNotice = false; // la fase individuale si è chiusa mentre il telefono era aperto

function saveTok(t) { tok = t; try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* */ } }
const focusTitle = () => { const h = $('#app h2, #app h1'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } };

async function start() {
  if (tok) {
    try { state = await api(`/api/p/${tok}`); return renderPhase(); }
    catch (e) {
      if (e.status === 403) { saveTok(null); app.innerHTML = `<div class="card"><p>${esc(e.message)}</p><button onclick="location.reload()">Registrati di nuovo</button></div>`; return; }
      if (e.status === 404) { saveTok(null); return renderJoin(); }
      // rete assente o server in riavvio: la registrazione resta valida, si riprova
      app.innerHTML = `<div class="card" role="alert"><h2>Connessione non disponibile</h2><p>La tua registrazione è salvata su questo telefono. Controlla la rete e riprova.</p><button class="big" id="retry">Riprova</button></div>`;
      $('#retry').onclick = () => start();
      return;
    }
  }
  renderJoin();
}

// Registrazione dal QR. Con l'azienda nota (QR del tavolo o codice inserito) si sceglie il proprio nome tra le persone
// iscritte da ELIS; chi non è in elenco si aggiunge con nome e funzione (non come referente: il server lo controlla).
async function renderJoin(cc = preCompany, codeError = false, notice = '') {
  let info;
  try { info = await api(`/api/join/${code}${cc ? `?c=${encodeURIComponent(cc)}` : ''}`); }
  catch (e) {
    const nf = e.status === 404;
    const msg = nf ? 'Il QR o l\'indirizzo non corrisponde a nessuna sessione. Chiedi al facilitatore ELIS il QR corretto.'
      : e.network ? e.message : 'Il servizio non risponde. Riprova tra qualche istante.';
    app.innerHTML = `<div class="card" role="alert"><h2>${nf ? 'Sessione non trovata' : e.network ? 'Connessione non disponibile' : 'Servizio non disponibile'}</h2><p>${esc(msg)}</p>${nf ? '' : '<button class="big" id="retry">Riprova</button>'}</div>`;
    if ($('#retry')) $('#retry').onclick = () => renderJoin(cc);
    return;
  }
  $('#sesstitle').textContent = info.session.title;
  // Dopo la fase individuale non ci si registra più (§2): lo si dice subito, non dopo aver compilato il modulo.
  if (!['preparazione', 'individuale'].includes(info.session.phase)) {
    const next = { confronto: 'Segui il confronto con i colleghi del tuo tavolo.', consolidamento: 'Il referente della tua azienda sta registrando la posizione ufficiale.', chiusa: 'La sessione è conclusa.' }[info.session.phase] || '';
    app.innerHTML = `<div class="card waitcard">${alt(1)}<h2>Registrazioni chiuse</h2><p>La fase delle risposte individuali di questa sessione è terminata, quindi non è più possibile registrarsi. ${next}</p></div>`;
    focusTitle();
    return;
  }
  const pre = info.preselected;
  const intro = `<h1>${esc(info.session.title)}</h1>
      <p class="ink2">Dieci minuti di risposte individuali, poi il confronto con i colleghi. Rispondi solo sui temi che conosci: se non hai visibilità su un punto scegli <b>N.D.</b></p>`;

  // QR di sala: prima il codice azienda, poi l'elenco delle persone di quell'azienda
  if (!pre && info.mode !== 'elenco') {
    app.innerHTML = `<div class="card">${intro}
      <label class="f" for="ccode">Codice azienda</label><input type="text" id="ccode" autocomplete="off" autocapitalize="characters" maxlength="10" aria-describedby="ccode-help" style="text-transform:uppercase;letter-spacing:.15em" value="${esc(cc || '')}">
      <p class="small muted" id="ccode-help">Lo trovi sul cartoncino del tuo tavolo, oppure chiedilo al referente della tua azienda.</p>
      <p id="joinerr" class="banner risk ${codeError ? '' : 'hidden'}" role="alert">${codeError ? 'Codice azienda non riconosciuto: controlla il cartoncino del tavolo o chiedilo al referente' : ''}</p>
      <button class="big" id="next">Continua</button></div>`;
    const go = async () => {
      const err = $('#joinerr'); const v = $('#ccode').value.trim().toUpperCase();
      if (!v) { err.textContent = 'Inserire il codice azienda'; err.classList.remove('hidden'); return; }
      try { const r = await api(`/api/join/${code}?c=${encodeURIComponent(v)}`); renderJoin(v, !r.preselected); }
      catch (e) { err.textContent = e.message; err.classList.remove('hidden'); } // rete assente o troppi tentativi: non è un codice sbagliato
    };
    $('#next').onclick = go; $('#ccode').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    if (codeError) $('#ccode').focus();
    return;
  }

  const fn = (id) => info.functions.find((f) => f.id === id)?.label || id;
  const roster = info.roster || [];
  let chosen = null; // id della persona scelta, oppure 'new'
  const companyField = pre
    ? `<div class="picked"><span class="small muted">Azienda</span><b>${esc(pre.name)}</b>${info.mode !== 'elenco' ? ' <button type="button" class="link small" id="notmine">Non è la tua azienda?</button>' : ''}</div>`
    : `<label class="f" for="company">Azienda</label><select id="company"><option value="">— Seleziona la tua azienda —</option>${info.companies.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>`;
  // con molti nomi quelli già registrati vanno in fondo, così i liberi restano in alto
  const ordered = roster.length > 8 ? [...roster.filter((r) => !r.taken), ...roster.filter((r) => r.taken)] : roster;
  const who = roster.length ? `<h2 class="f" id="who-t" style="margin-top:18px">Chi sei?</h2>
      <p class="small ink2" style="margin:0 0 8px">Tocca il tuo nome. Se non c'è, tocca l'ultima voce.</p>
      <div class="levels" role="group" aria-labelledby="who-t">${ordered.map((r) => `<button type="button" class="level person" data-r="${r.id}" data-n="${esc(r.name)}" aria-pressed="false" ${r.taken ? 'disabled' : ''}>
        <span><b>${esc(r.name)}</b><span class="small muted"> · ${esc(fn(r.func))}</span>${r.taken ? '<span class="small muted"><br>già registrato su un altro telefono. Sei tu? Chiedi al referente di toccare «Rimuovi» accanto al tuo nome, poi ricarica la pagina.</span>' : ''}</span></button>`).join('')}
        <button type="button" class="level nd" data-r="new" aria-pressed="false">Non sono nell'elenco</button></div>` : '';
  const newPerson = `<div id="newp" class="${roster.length ? 'hidden' : ''}">
      <label class="f" for="name">Nome e cognome</label><input type="text" id="name" autocomplete="name" maxlength="120">
      <label class="f" for="func">Funzione</label>
      <select id="func"><option value="">— Seleziona —</option>${info.functions.map((f) => `<option value="${f.id}">${esc(f.label)}</option>`).join('')}</select></div>`;
  app.innerHTML = `
    <div class="card">${intro}
      ${companyField}
      ${who}
      ${newPerson}
      <div class="card flat" style="margin:18px 0 16px">
        <h3 style="margin:0 0 6px">Chi vede le tue risposte</h3>
        <p class="small ink2" style="margin:0">ELIS vede le tue risposte individuali. Il referente della tua azienda vede il tuo nome, la funzione e se hai inviato, ma non le singole risposte. I colleghi vedono solo la distribuzione anonima delle risposte dell'azienda (con meno di 3 risposte solo mediana e range). Nel benchmark entra solo il valore consolidato dell'azienda. Su questo telefono resta un codice tecnico che ti permette di riprendere la compilazione.${roster.length ? ' Il tuo nome e la funzione compaiono nell\'elenco dell\'azienda, visibile a chi inquadra il QR del vostro tavolo.' : ''}
        ${info.privacyUrl ? ` <a href="${esc(info.privacyUrl)}" target="_blank" rel="noopener">Informativa privacy ELIS</a>.` : ''}</p>
        <label class="check" style="margin-top:8px"><input type="checkbox" id="ack"> <span>Ho letto come vengono usate le mie risposte</span></label>
      </div>
      <p id="joinerr" class="banner risk ${notice ? '' : 'hidden'}" role="alert">${esc(notice)}</p>
      <button class="big" id="go">Entra</button>
    </div>`;
  if ($('#notmine')) $('#notmine').onclick = () => renderJoin('');
  // modalità "elenco": scelta l'azienda, si ricarica con il suo codice per mostrare le persone iscritte
  if ($('#company')) $('#company').onchange = () => { const c = info.companies.find((x) => x.id === Number($('#company').value)); if (c) renderJoin(c.code); };
  $$('[data-r]').forEach((b) => b.onclick = () => {
    chosen = b.dataset.r === 'new' ? 'new' : Number(b.dataset.r);
    $$('[data-r]').forEach((x) => { x.classList.toggle('sel', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    $('#newp').classList.toggle('hidden', chosen !== 'new');
    $('#go').textContent = chosen === 'new' ? 'Entra' : `Entra come ${b.dataset.n}`; // il pulsante dice chi sta entrando
    if (chosen === 'new') $('#name').focus();
  });
  $('#go').onclick = async () => {
    const err = $('#joinerr'); err.classList.add('hidden');
    try {
      if (roster.length && chosen == null) throw new Error('Scegli il tuo nome dall\'elenco, oppure "Non sono nell\'elenco"');
      const body = { privacyAck: $('#ack').checked };
      if (typeof chosen === 'number') body.rosterId = chosen; else { body.name = $('#name').value; body.func = $('#func').value; }
      if ($('#company')) body.companyId = Number($('#company').value); else body.companyCode = pre.code;
      const r = await api(`/api/join/${code}`, { method: 'POST', body });
      saveTok(r.token); state = await api(`/api/p/${tok}`); renderPhase();
    } catch (e) {
      err.textContent = e.message; err.classList.remove('hidden'); err.scrollIntoView({ block: 'center' });
      if (e.status === 409) renderJoin(pre?.code || cc, false, e.message); // nome appena preso: elenco aggiornato, messaggio che resta
    }
  };
}

function header() {
  // finché non ha risposto, chi ha scelto il nome sbagliato (o ha in mano il telefono di un altro) può cambiarlo
  const canLeave = ['preparazione', 'individuale'].includes(state.session.phase) && !state.answered.length && !(state.pairAnswers || []).length;
  return `<div class="who"><b>${esc(state.company)}</b><span>${esc(state.participant.name)}${canLeave ? ` · <button type="button" class="link small" id="leave">Non sei ${esc(state.participant.name)}? Cambia nome</button>` : ''}</span></div>${phaseChips(state.session.phase)}<div style="height:18px"></div>`;
}
async function leave() {
  if (!confirm(`Annullare la registrazione come ${state.participant.name}? Il nome torna libero e potrai sceglierne un altro.`)) return;
  try { await api(`/api/p/${tok}/leave`, { method: 'POST' }); saveTok(null); state = null; step = 0; renderJoin(); }
  catch (e) { toast(e.message, true); }
}

function renderPhase() {
  $('#sesstitle').textContent = state.session.title;
  lastPhase = state.session.phase;
  lastComparisonKey = '';
  const ph = state.session.phase;
  if (ph === 'preparazione') {
    app.innerHTML = `${header()}<div class="card waitcard" role="status">${alt(1)}<h2>Sei registrato</h2><p>Attendi che il facilitatore apra la fase individuale. La pagina si aggiorna da sola: puoi tenere il telefono in tasca.</p></div>`;
  } else if (ph === 'individuale') {
    renderIndividual();
  } else {
    renderComparison();
  }
  focusTitle();
}

// ---------- Fase individuale ----------
const totalSteps = () => state.items.length + 2; // item + confronti + riepilogo

function renderIndividual() {
  const n = state.items.length;
  if (state.participant.submitted_at && step === 0 && !renderIndividual.reopened) step = totalSteps() - 1;
  const bar = `<p class="sr-only">Passo ${step + 1} di ${totalSteps()}</p>`;
  if (step < n) {
    const it = state.items[step];
    const cur = state.answered.includes(it.id) ? state.answers[it.id] : undefined;
    app.innerHTML = `${header()}${bar}
      <div class="card">
        <div class="qmeta"><span>Domanda ${step + 1} di ${n}</span><span class="tag navy">${esc(it.id)}</span></div>
        <h2 id="qt">${esc(it.title)}</h2>
        <p class="statement">${esc(it.statement)}</p>
        ${it.help ? `<p class="small muted">${esc(it.help)}</p>` : ''}
        <p class="small ink2">Scegli il livello che descrive la situazione <b>praticata oggi</b>. Ciò che è solo pianificato non conta. Ogni risposta si salva da sola.</p>
        <div class="levels" role="group" aria-labelledby="qt">
          ${it.levels.map((l) => `<div class="levelwrap">
            <button type="button" class="level ${cur === l.level ? 'sel' : ''}" data-l="${l.level}" aria-pressed="${cur === l.level}"><span class="n" aria-hidden="true">${l.level}${alt(l.level)}</span><span><span class="sr-only">Livello ${l.level}: </span>${esc(l.descriptor)}</span></button>
            ${l.sub ? `<details class="subs"><summary>Varianti del livello ${l.level} · si scelgono nel consolidamento</summary>${l.sub.map((s) => `<div><b>${l.level}${s.key}</b> — ${esc(s.text)}</div>`).join('')}</details>` : ''}</div>`).join('')}
          <button type="button" class="level nd ${cur === null ? 'sel' : ''}" data-l="nd" aria-pressed="${cur === null}">N.D. — non ho sufficiente visibilità</button>
        </div>
      </div>
      <div class="sticky-foot"><button class="ghost" id="prev" ${step === 0 ? 'disabled' : ''}>Indietro</button><button id="next" ${cur === undefined ? 'disabled' : ''}>Avanti</button></div>`;
    $$('button.level').forEach((b) => b.onclick = async () => {
      const level = b.dataset.l === 'nd' ? null : Number(b.dataset.l);
      try {
        await api(`/api/p/${tok}/answer`, { method: 'PUT', body: { itemId: it.id, level } });
        state.answers[it.id] = level; if (!state.answered.includes(it.id)) state.answered.push(it.id);
        $$('button.level').forEach((x) => { x.classList.toggle('sel', x === b); x.setAttribute('aria-pressed', String(x === b)); });
        $('#next').disabled = false;
      } catch (e) { toast(e.message, true); refresh().catch(() => {}); }
    });
  } else if (step === n) {
    app.innerHTML = `${header()}${bar}<div class="card"><div class="qmeta"><span>Ultimo passo prima del riepilogo</span></div><h2>Confronti a coppie</h2>
      <p class="small ink2">Tra due capacità della stessa sessione, quale è più avanti nella tua azienda?</p>
      ${state.pairs.map(([a, b], i) => {
        const A = state.items.find((x) => x.id === a), B = state.items.find((x) => x.id === b);
        const cur = state.pairAnswers.find((x) => x.item_a === a && x.item_b === b)?.answer;
        const qtext = state.pairQuestion.replace('{a}', `<b>${esc(A.title.toLowerCase())}</b>`).replace('{b}', `<b>${esc(B.title.toLowerCase())}</b>`);
        return `<div class="card flat"><p id="pq${i}">${qtext}</p><div class="levels" role="group" aria-labelledby="pq${i}" data-pair="${a}|${b}">
          <button type="button" class="level ${cur === 'A' ? 'sel' : ''}" data-v="A" aria-pressed="${cur === 'A'}"><span class="n" aria-hidden="true">${esc(a)}</span><span>${esc(A.title)}</span></button>
          <button type="button" class="level ${cur === 'B' ? 'sel' : ''}" data-v="B" aria-pressed="${cur === 'B'}"><span class="n" aria-hidden="true">${esc(b)}</span><span>${esc(B.title)}</span></button>
          <button type="button" class="level nd ${cur === 'ND' ? 'sel' : ''}" data-v="ND" aria-pressed="${cur === 'ND'}">N.D. — non ho sufficiente visibilità</button></div></div>`;
      }).join('')}</div>
      <div class="sticky-foot"><button class="ghost" id="prev">Indietro</button><button id="next">Avanti</button></div>`;
    $$('[data-pair]').forEach((g) => $$('.level', g).forEach((b) => b.onclick = async () => {
      const [a, bb] = g.dataset.pair.split('|');
      try {
        await api(`/api/p/${tok}/pair`, { method: 'PUT', body: { a, b: bb, answer: b.dataset.v } });
        const ex = state.pairAnswers.find((x) => x.item_a === a && x.item_b === bb);
        if (ex) ex.answer = b.dataset.v; else state.pairAnswers.push({ item_a: a, item_b: bb, answer: b.dataset.v });
        $$('.level', g).forEach((x) => { x.classList.toggle('sel', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      } catch (e) { toast(e.message, true); refresh().catch(() => {}); }
    }));
  } else {
    const missingItems = state.items.map((it, i) => ({ it, i })).filter(({ it }) => !state.answered.includes(it.id));
    const missingPairs = state.pairs.filter(([a, b]) => !state.pairAnswers.some((x) => x.item_a === a && x.item_b === b)).length;
    const missing = missingItems.length + missingPairs;
    app.innerHTML = `${header()}${bar}<div class="card"><h2>Riepilogo</h2>
      <table><tbody>${state.items.map((i) => `<tr><td>${esc(i.id)} ${esc(i.title)}</td><td class="num"><b>${state.answered.includes(i.id) ? (state.answers[i.id] ?? 'N.D.') : '—'}</b></td></tr>`).join('')}
      ${state.pairs.map(([a, b]) => { const v = state.pairAnswers.find((x) => x.item_a === a && x.item_b === b)?.answer; return `<tr><td>Più avanti: ${esc(a)} o ${esc(b)}?</td><td class="num"><b>${v === 'A' ? a : v === 'B' ? b : v === 'ND' ? 'N.D.' : '—'}</b></td></tr>`; }).join('')}</tbody></table>
      ${state.participant.submitted_at ? '<div class="banner ok" role="status" style="margin-top:12px">Risposte inviate. Finché la fase individuale è aperta puoi ancora modificarle: ogni modifica si salva da sola.</div>' : '<p class="small muted" style="margin-top:12px">Le risposte sono già salvate: con <b>Invia</b> confermi di aver finito.</p>'}
      ${missing ? `<div class="banner warn" style="margin-top:12px">Mancano ${missing} risposte: ${missingItems.map(({ it, i }) => `<button class="link" data-goto="${i}">${esc(it.id)}</button>`).join(', ')}${missingPairs ? `${missingItems.length ? ', ' : ''}<button class="link" data-goto="${state.items.length}">confronti a coppie</button>` : ''}</div>` : ''}</div>
      <div class="sticky-foot"><button class="ghost" id="prev">Modifica</button>${state.participant.submitted_at ? '' : `<button id="submit" ${missing ? 'disabled' : ''}>Invia le risposte</button>`}</div>`;
    $$('[data-goto]').forEach((b) => b.onclick = () => { renderIndividual.reopened = true; step = Number(b.dataset.goto); renderIndividual(); scrollTo(0, 0); focusTitle(); });
    const s = $('#submit');
    if (s) s.onclick = async () => {
      try { await api(`/api/p/${tok}/submit`, { method: 'POST' }); state.participant.submitted_at = new Date().toISOString(); toast('Risposte inviate'); renderIndividual(); focusTitle(); }
      catch (e) { toast(e.message, true); }
    };
  }
  const prev = $('#prev'), next = $('#next');
  if (prev) prev.onclick = () => { renderIndividual.reopened = true; step = step === totalSteps() - 1 && state.participant.submitted_at ? 0 : Math.max(0, step - 1); renderIndividual(); scrollTo(0, 0); focusTitle(); };
  if (next) next.onclick = () => { step = Math.min(totalSteps() - 1, step + 1); renderIndividual(); scrollTo(0, 0); focusTitle(); };
}

// ---------- Confronto (vista anonima) ----------
function renderComparison() {
  const c = state.comparison;
  const key = JSON.stringify([state.session.phase, c]);
  if (key === lastComparisonKey) return; // nessun cambiamento: non ridisegnare (scorrimento e focus restano)
  lastComparisonKey = key;
  const msg = { confronto: 'Confronto in corso: guardate dove le risposte divergono e quali evidenze le sostengono.',
    consolidamento: 'Il referente sta registrando la posizione ufficiale dell\'azienda.', chiusa: 'Sessione chiusa. Grazie per la partecipazione.' }[state.session.phase];
  const mine = (id) => (state.answered.includes(id) ? (state.answers[id] ?? 'N.D.') : 'nessuna');
  app.innerHTML = `${header()}${closedNotice ? '<div class="banner ok">Il facilitatore ha chiuso le risposte individuali: quelle che hai dato sono registrate.</div>' : ''}<div class="banner info" role="status">${msg}</div>
    <div class="card"><h2>Le risposte della vostra azienda</h2><p class="small muted" style="margin:0">Vista anonima: ${c.participants} partecipanti, ${c.submitted} ${c.submitted === 1 ? 'ha' : 'hanno'} inviato, ${c.functions.length} ${c.functions.length === 1 ? 'funzione presente' : 'funzioni presenti'}.</p></div>
    ${c.items.map((it) => `<div class="card"><div class="cardhead"><h3>${esc(it.itemId)} · ${esc(it.title)}</h3>${confTag(it.confidence)}</div>
      ${it.summary.hidden ? '<p class="small muted">Meno di 3 risposte valide: per proteggere l\'anonimato si mostrano solo mediana e range.</p>' : distBars(it.summary)}
      <p class="small" style="margin-top:8px">La tua risposta: <b>${mine(it.itemId)}</b> · Mediana: <b>${it.summary.median ?? '—'}</b> · Range: <b>${it.summary.range ?? '—'}</b> · N.D.: <b>${it.summary.nd}</b></p>
      ${it.summary.divergent ? '<div class="banner warn">Divergenza di due o più livelli: discussione necessaria.</div>' : ''}</div>`).join('')}
    <div class="card"><h3>Confronti a coppie</h3>${c.pairs.map((p) => p.hidden ? `<p><b>${esc(p.a)}</b> vs <b>${esc(p.b)}</b>: meno di 3 risposte valide, per proteggere l'anonimato non si mostra.</p>` : `<p><b>${esc(p.a)}</b> ${p.counts.A} · <b>${esc(p.b)}</b> ${p.counts.B} · N.D. ${p.counts.ND}
      </p>${p.discordant ? `<p class="note risk">${p.discordant} ${p.discordant === 1 ? 'risposta' : 'risposte'} in contrasto con i livelli scelti dalla stessa persona</p>` : ''}`).join('')}</div>`;
}

let tick = 0;
async function refresh() {
  if (!tok) return;
  // fuori dalla fase individuale basta accorgersi del cambio di fase: un'interrogazione ogni 8 secondi
  if (!['preparazione', 'individuale'].includes(state.session.phase) && (tick++ % 2)) return;
  const s = await api(`/api/p/${tok}?lite=1`);
  s.items = state.items; s.pairs = state.pairs; s.pairQuestion = state.pairQuestion;
  const changed = s.session.phase !== lastPhase;
  state = s;
  if (changed) { closedNotice = lastPhase === 'individuale'; step = 0; renderIndividual.reopened = false; renderPhase(); }
  else if (s.session.phase !== 'individuale' && s.session.phase !== 'preparazione') renderComparison();
}

app.addEventListener('click', (e) => { if (e.target.id === 'leave') leave(); }); // il link è ridisegnato a ogni passo
start().then(() => poll(async () => { if (tok && state) await refresh(); }, 4000));
