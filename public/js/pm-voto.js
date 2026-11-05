// Pomeriggio · telefono del partecipante dal QR del tavolo (/t/:code).
// Riconosce il telefono del mattino; altrimenti codice azienda e nome. Fino a 2 need, con priorità e orizzonte.
// Dopo l'invio nessun risultato del tavolo (R4). Nessun dato della Map (R1).
import { api, esc, $, $$, toast, ask, demoBar, icon } from './ui.js';

const code = location.pathname.split('/').pop();
const app = $('#app');
const showErr = (el, msg) => { el.textContent = ''; el.classList.remove('hidden'); setTimeout(() => { el.textContent = msg; }, 30); };
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage non disponibile */ } } };
let V = null;            // vista dal server: tavolo, need, persona riconosciuta
let pick = [];           // need scelti, nell'ordine dei tocchi
const ans = {};          // risposte per need: { priority, horizon }
let stopPoll = null;
const pmKey = () => `aito_pm_s${V.session.id}`;
// codici salvati sul telefono dalle pagine del mattino (uno per sessione): il server tiene quello di questa sessione
const morningTokens = () => { const out = []; try { for (let i = 0; i < localStorage.length && out.length < 10; i++) { const k = localStorage.key(i); if (/^aito_p_/.test(k)) out.push(localStorage.getItem(k)); } } catch { /* storage non disponibile */ } return out; };
const focusTitle = () => { const h = $('#app h1, #app h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } };

async function start() {
  try { V = await api(`/api/pm/t/${code}`); }
  catch (e) {
    app.innerHTML = `<div class="card" role="alert"><h2>${e.status === 404 ? 'Tavolo non trovato' : 'Connessione non disponibile'}</h2><p>${esc(e.status === 404 ? 'Il QR non corrisponde a nessun tavolo. Chiedi al facilitatore il QR corretto.' : e.message)}</p>${e.status === 404 ? '' : '<button class="big" id="retry">Riprova</button>'}</div>`;
    if ($('#retry')) $('#retry').onclick = start;
    return;
  }
  if (V.session.demo) demoBar();
  $('#sesstitle').textContent = `${V.session.title} · pomeriggio`;
  // il codice del partecipante salvato al mattino (o al pomeriggio) basta: nessun dato da inserire
  const skipMorning = store.get(`${pmKey()}_altro`) === '1';
  V = await api(`/api/pm/t/${code}/identify`, { method: 'POST', body: { pmToken: store.get(pmKey()), morningTokens: skipMorning ? [] : morningTokens() } });
  if (V.me) { store.set(pmKey(), V.me.token); render(); } else renderWho();
}

const tableLine = () => `Tavolo <b>${esc(V.table.label)} · ${esc(V.table.title)}</b>`;
function header() {
  return V.me ? `<div class="pm-who"><span class="small muted">Sei</span> <b>${esc(V.me.name)}</b>, ${esc(V.me.company)}${/\.$/.test(V.me.company) ? '' : '.'}${V.me.votedAt ? '' : ' <button type="button" class="link small" id="notme">Non sei tu?</button>'}<br>${tableLine()}</div>` : `<div class="pm-who">${tableLine()}</div>`;
}
// telefono prestato o nome toccato per sbaglio: si torna a «Chi sei?» prima di votare
function bindNotMe() {
  const b = $('#notme'); if (!b) return;
  b.onclick = () => { store.set(pmKey(), ''); store.set(`${pmKey()}_altro`, '1'); V.me = null; pick = []; if (stopPoll) { stopPoll(); stopPoll = null; } renderWho(); };
}

// ---------- Chi sei? (telefono non riconosciuto) ----------
function renderWho(cc = '', notice = '') {
  app.innerHTML = `<div class="card">${header()}
    <h1 style="margin-top:12px">Chi sei?</h1>
    <p class="ink2">Non ti abbiamo riconosciuto. Inserisci il codice della tua azienda e scegli il tuo nome.</p>
    <label class="f" for="ccode">Codice azienda</label><input type="text" id="ccode" autocomplete="off" autocapitalize="characters" maxlength="10" style="text-transform:uppercase;letter-spacing:.15em" value="${esc(cc)}" aria-describedby="ccode-help">
    <p class="small muted" id="ccode-help">È lo stesso del mattino: lo trovi sul cartoncino del tavolo dell'azienda o lo chiedi al referente.</p>
    <p id="err" class="banner risk ${notice ? '' : 'hidden'}" role="alert">${esc(notice)}</p>
    <button class="big" id="next">Continua</button></div>`;
  const go = async () => {
    const v = $('#ccode').value.trim().toUpperCase();
    if (!v) return showErr($('#err'), 'Inserisci il codice azienda');
    try { renderPeople(v, await api(`/api/pm/t/${code}/people?c=${encodeURIComponent(v)}`)); } catch (e) { showErr($('#err'), e.message); }
  };
  $('#next').onclick = go; $('#ccode').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  focusTitle();
}
function renderPeople(cc, P) {
  const initials = (n) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const fn = (id) => P.functions.find((f) => f.id === id)?.label || id || '';
  let chosen = null;
  app.innerHTML = `<div class="card">${header()}
    <div class="picked" style="margin-top:12px"><span class="small muted">Azienda</span><b>${esc(P.company.name)}</b> <button type="button" class="link small" id="notmine">Non è la tua azienda?</button></div>
    <h1 class="f" id="who-t" style="margin-top:14px">Chi sei?</h1>
    <div class="levels" role="group" aria-labelledby="who-t">${P.people.map((p) => `<button type="button" class="level person" data-k="${esc(p.key)}" data-n="${esc(p.name)}" aria-pressed="false" ${p.taken ? 'disabled' : ''}>
      <span class="ava" aria-hidden="true">${esc(initials(p.name))}</span><span><b>${esc(p.name)}</b><span class="small muted fn">${esc(fn(p.func))}${p.taken ? ' · già entrato da un altro telefono' : ''}</span></span></button>`).join('')}
      <button type="button" class="level nd" data-k="new" aria-pressed="false">Non sono nell'elenco</button></div>
    <div id="newp" class="hidden">
      <label class="f" for="name">Nome e cognome</label><input type="text" id="name" autocomplete="name" maxlength="120">
      <label class="f" for="func">Funzione</label><select id="func"><option value="">— Seleziona —</option>${P.functions.map((f) => `<option value="${esc(f.id)}">${esc(f.label)}</option>`).join('')}</select></div>
      <div id="ackbox" class="hidden"><div class="card flat" style="margin:16px 0 0"><p class="small ink2" style="margin:0">Di te restano solo nome e funzione, perché tu possa votare una volta sola. Il voto è anonimo: il referente della tua azienda, il report e la plenaria vedono solo quante persone hanno scelto ogni need.${P.privacyUrl ? ` <a href="${esc(P.privacyUrl)}" target="_blank" rel="noopener">Informativa privacy ELIS</a>.` : ''}</p>
        <label class="check" style="margin-top:8px"><input type="checkbox" id="ack"> <span>Ho letto come viene usato il mio voto</span></label></div></div>
    <p id="err" class="banner risk hidden" role="alert"></p>
    <button class="big" id="go" style="margin-top:14px">Entra</button></div>`;
  $('#notmine').onclick = () => renderWho('');
  $$('[data-k]').forEach((b) => b.onclick = () => {
    chosen = b.dataset.k;
    $$('[data-k]').forEach((x) => { x.classList.toggle('sel', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    $('#newp').classList.toggle('hidden', chosen !== 'new');
    $('#ackbox').classList.toggle('hidden', /^p\d/.test(chosen)); // chi era al mattino ha già letto l'informativa
    $('#go').textContent = chosen === 'new' ? 'Entra' : `Entra come ${b.dataset.n}`;
    if (chosen === 'new') $('#name').focus();
  });
  $('#go').onclick = async () => {
    if (!chosen) return showErr($('#err'), 'Scegli il tuo nome, oppure «Non sono nell\'elenco»');
    const body = { companyCode: cc, privacyAck: $('#ack').checked, ...(chosen === 'new' ? { name: $('#name').value, func: $('#func').value } : { key: chosen }) };
    try { V = await api(`/api/pm/t/${code}/join`, { method: 'POST', body }); store.set(pmKey(), V.me.token); store.set(`${pmKey()}_altro`, ''); render(); }
    catch (e) { showErr($('#err'), e.message); }
  };
  focusTitle();
}

// ---------- Voto ----------
function render() {
  if (stopPoll) { stopPoll(); stopPoll = null; }
  if (V.me.votedAt) {
    const at = V.me.votedAt ? new Date(V.me.votedAt.replace(' ', 'T') + 'Z').toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
    app.innerHTML = `<div class="card waitcard">${header()}${V.me.votedHere ? `<div class="pm-ok" aria-hidden="true">${icon('check')}</div>` : ''}<h1 style="margin-top:12px">${V.me.votedHere ? 'Voto registrato' : `Hai già votato al tavolo ${esc(V.me.votedTable.split(' · ')[0])}`}</h1>
      <p class="ink2">${V.me.votedHere ? `Grazie: il tuo voto è stato registrato alle ${esc(at)}. Puoi chiudere la pagina. I risultati del tavolo si vedranno in plenaria, dopo la chiusura del voto.` : `Ogni persona vota una sola volta, a un solo tavolo (${esc(V.me.votedTable)}). Se devi spostarti di tavolo, chiedi alla regia ELIS.`}</p></div>`;
    return focusTitle();
  }
  if (V.table.status !== 'voto' || V.session.pmPhase !== 'tavoli') {
    const msg = V.table.status === 'chiuso' || ['plenaria', 'scelta', 'chiuso_def'].includes(V.session.pmPhase) ? ['Voto chiuso', 'Il voto di questo tavolo è chiuso.'] : ['Voto non ancora aperto', 'Il facilitatore sta scrivendo i need emersi dal tavolo. Tieni aperta questa pagina: il voto compare da solo.'];
    app.innerHTML = `<div class="card waitcard">${header()}<h1 style="margin-top:12px">${msg[0]}</h1><p class="ink2">${msg[1]}</p></div>`;
    bindNotMe();
    if (V.table.status === 'bozza') stopPoll = pollTable();
    return focusTitle();
  }
  drawVote();
  // durante il voto si controlla se il tavolo si chiude, prima che la persona invii
  stopPoll = pollTable(10000, true);
}
function pollTable(ms = 4000, voting = false) {
  let alive = true;
  const tick = async () => {
    if (!alive || !V.me) return;
    try {
      const x = await api(`/api/pm/t/${code}/identify`, { method: 'POST', body: { pmToken: V.me.token } });
      if (x.table.status !== V.table.status || x.session.pmPhase !== V.session.pmPhase) {
        alive = false;
        // chi sta votando non perde la pagina all'improvviso: vede l'avviso, le scelte restano visibili
        if (voting) { V.table.status = x.table.status; V.session.pmPhase = x.session.pmPhase; const e = $('#closed'); if (e) { e.classList.remove('hidden'); e.textContent = 'Il voto di questo tavolo è stato chiuso: non è più possibile inviare. Se non avevi ancora inviato, avvisa il facilitatore.'; } $('#send')?.setAttribute('disabled', ''); $('#none')?.setAttribute('disabled', ''); return; }
        V = x; return render();
      }
    } catch { /* rete: si riprova */ }
    setTimeout(tick, ms);
  };
  setTimeout(tick, ms);
  return () => { alive = false; };
}
const opt = (attr, id, val, label, on) => `<button type="button" class="pm-opt ${on ? 'sel' : ''}" data-${attr}="${id}:${val}" aria-pressed="${on}">${esc(label)}</button>`;
let showMiss = false;   // dopo un invio incompleto si segnalano le domande senza risposta
let limitMsg = '';
function drawVote() {
  const N = V.needs, max = V.maxChoices;
  const full = pick.length >= max;
  app.innerHTML = `<div class="card">${header()}
    <h1 style="margin-top:12px" id="q-t">${esc(V.texts.choose)}</h1>
    <p class="small muted" style="margin:-4px 0 6px">Need: un bisogno o un problema emerso al tavolo.</p>
    <p id="closed" class="banner warn hidden" role="alert"></p>
    <p class="small ${limitMsg ? 'pm-limit' : 'muted'}" aria-live="polite" id="cnt">${pick.length} di ${max} scelti${limitMsg ? ` · ${esc(limitMsg)}` : ''}</p>
    <div class="pm-needs" role="group" aria-labelledby="q-t">${N.map((n) => {
      const on = pick.includes(n.id), a = ans[n.id] || {};
      const mp = showMiss && on && !a.priority, mh = showMiss && on && !a.horizon;
      return `<div class="pm-need ${on ? 'on' : ''} ${full && !on ? 'dim' : ''}"><button type="button" class="level ${on ? 'sel' : ''}" data-need="${n.id}" aria-pressed="${on}"><span class="n">${esc(n.code)}</span><span><b>${esc(n.title)}</b>${n.descr ? `<br><span class="small">${esc(n.descr)}</span>` : ''}</span></button>
        ${on ? `<div class="pm-q"><p class="pm-ql" id="pr-${n.id}">${esc(V.texts.priority)}</p>${mp ? '<p class="field-err">Manca la priorità</p>' : ''}<div class="pm-opts ${mp ? 'miss' : ''}" role="group" aria-labelledby="pr-${n.id}">${V.priority.map((p) => opt('pr', n.id, p.value, `${p.value} · ${p.label}`, a.priority === p.value)).join('')}</div>
          <p class="pm-ql" id="ho-${n.id}">${esc(V.texts.horizon)}</p>${mh ? '<p class="field-err">Manca l\'orizzonte</p>' : ''}<div class="pm-opts ${mh ? 'miss' : ''}" role="group" aria-labelledby="ho-${n.id}">${V.horizon.map((h) => opt('ho', n.id, h.value, h.label, a.horizon === h.value)).join('')}</div></div>` : ''}</div>`;
    }).join('')}</div>
    <p class="small ink2" style="margin-top:14px">Il tuo voto è anonimo: il referente della tua azienda, il report e la plenaria vedono solo quante persone hanno scelto ogni need.</p>
    <p id="err" class="banner risk hidden" role="alert"></p>
    <div class="pm-send"><button class="big" id="send" ${pick.length ? '' : 'disabled'}>Rivedi e invia il voto</button>
      ${pick.length ? '<button class="ghost" id="clear">Togli le scelte</button>' : '<button class="ghost" id="none">Non scelgo nessuno</button>'}</div></div>`;
  bindNotMe();
  $$('[data-need]').forEach((b) => b.onclick = () => {
    const id = Number(b.dataset.need), i = pick.indexOf(id);
    limitMsg = '';
    if (i >= 0) pick.splice(i, 1);
    else if (pick.length >= max) limitMsg = `al massimo ${max}: togline prima uno`;
    else pick.push(id);
    drawVote(); $(`[data-need="${id}"]`).focus();
  });
  const setAns = (attr, key) => $$(`[data-${attr}]`).forEach((b) => b.onclick = () => {
    const [id, v] = b.dataset[attr].split(':'); (ans[id] ||= {})[key] = key === 'priority' ? Number(v) : v; drawVote(); $(`[data-${attr}="${id}:${v}"]`).focus();
  });
  setAns('pr', 'priority'); setAns('ho', 'horizon');
  $('#send').onclick = async () => {
    const miss = pick.find((id) => !ans[id]?.priority || !ans[id]?.horizon);
    if (miss) {
      // si segna accanto a ogni need che cosa manca e si porta la persona alla prima domanda senza risposta
      showMiss = true; drawVote();
      const g = $('.pm-opts.miss'); if (g) { g.scrollIntoView({ block: 'center' }); g.querySelector('button')?.focus({ preventScroll: true }); }
      return;
    }
    const lab = (arr, v) => arr.find((x) => x.value === v)?.label;
    const sum = pick.map((id) => { const n = N.find((x) => x.id === id); return `${n.code} ${n.title}: ${lab(V.priority, ans[id].priority)}, ${lab(V.horizon, ans[id].horizon).toLowerCase()}`; }).join('\n');
    if (!await ask(`${sum}\n\nDopo l'invio il voto non si modifica dal telefono.`, { title: 'Inviare il voto?', ok: 'Invia il voto' })) return;
    submit({ items: pick.map((id) => ({ needId: id, priority: ans[id].priority, horizon: ans[id].horizon })) });
  };
  if ($('#clear')) $('#clear').onclick = () => { pick = []; limitMsg = ''; showMiss = false; drawVote(); $('#none')?.focus(); };
  if ($('#none')) $('#none').onclick = async () => {
    if (!await ask('Non scegliere nessun need non è una valutazione negativa. Dopo l\'invio il voto non si modifica dal telefono.', { title: 'Non scegli nessun need?', ok: 'Invia senza scelte' })) return;
    submit({ none: true });
  };
}
async function submit(body) {
  if (stopPoll) { stopPoll(); stopPoll = null; }
  try { V = await api(`/api/pm/t/${code}/vote`, { method: 'POST', body: { ...body, pmToken: V.me.token } }); render(); }
  catch (e) {
    if (e.status === 409 || /chiuso|non è ancora aperto/.test(e.message)) { V = await api(`/api/pm/t/${code}/identify`, { method: 'POST', body: { pmToken: V.me.token } }); render(); toast(e.message, true); }
    else showErr($('#err'), e.message);
  }
}
start();
