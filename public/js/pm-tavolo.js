// Pomeriggio · telefono del facilitatore del tavolo (/ft/:token): fino a 5 need, poi «Conferma e apri il voto».
// Durante il voto vede solo quante persone hanno votato, mai i risultati (R4, NEED-05).
import { api, esc, $, $$, toast, ask, demoBar } from './ui.js';

const tok = location.pathname.split('/').pop();
const app = $('#app');
const API = `/api/pm/f/${tok}`;
let F = null;
let draft = null;      // need in scrittura (bozza): [{ title, descr }]
let dirty = false;
let stopPoll = null;

async function start() {
  try { F = await api(API); }
  catch (e) {
    app.innerHTML = `<div class="card" role="alert"><h2>${e.status === 410 ? 'Pomeriggio concluso' : e.status === 404 ? 'Link non valido' : 'Connessione non disponibile'}</h2><p>${esc(e.message)}</p>${e.status >= 404 ? '' : '<button class="big" id="retry">Riprova</button>'}</div>`;
    if ($('#retry')) $('#retry').onclick = start;
    return;
  }
  if (F.session.demo) demoBar();
  $('#sesstitle').textContent = `${F.session.title} · facilitatore`;
  draft = F.needs.map((n) => ({ title: n.title, descr: n.descr || '' }));
  render();
}

const head = () => `<p class="small muted" style="margin:0">Tavolo</p><h1 style="margin:2px 0 4px">${esc(F.table.label)} · ${esc(F.table.title)}</h1>${F.table.theme ? `<p class="small ink2" style="margin:0">Tema del mattino: ${esc(F.table.theme)}</p>` : ''}`;
function render() {
  if (stopPoll) { stopPoll(); stopPoll = null; }
  if (F.table.status === 'bozza') return drawDraft();
  const N = F.needs.map((n) => `<li class="pm-nrow"><span class="pm-code">${esc(n.code)}</span> <b>${esc(n.title)}</b>${n.descr ? `<div class="small ink2">${esc(n.descr)}</div>` : ''}</li>`).join('');
  const open = F.table.status === 'voto';
  app.innerHTML = `<div class="card">${head()}
    <div class="banner ${open ? 'ok' : 'info'}" style="margin-top:12px">${open ? 'Voto aperto: le persone del tavolo inquadrano il QR e votano.' : 'Voto chiuso. La mappa del tavolo si vede in plenaria.'}</div>
    <div class="row" style="align-items:baseline;gap:10px;margin:14px 0"><span class="pm-count" aria-live="polite" id="vcount">${F.voters}</span><span>${F.voters === 1 ? 'persona ha votato' : 'persone hanno votato'}</span></div>
    <p class="small muted">Qui vedi solo quante persone hanno votato: i risultati compaiono in plenaria dopo la chiusura del voto.</p>
    <h2 style="margin-top:18px">I need del tavolo</h2><ul style="list-style:none;padding:0">${N}</ul>
    <p class="small muted">I need sono confermati: non si aggiungono né si tolgono. Per un errore di battitura chiedi alla regia ELIS.</p>
    ${open ? '<button class="big" id="close" style="margin-top:8px">Chiudi il voto del tavolo</button>' : ''}</div>`;
  if (open) {
    $('#close').onclick = async () => {
      if (!await ask(`Hanno votato ${F.voters} ${F.voters === 1 ? 'persona' : 'persone'}. Dopo la chiusura nessuno del tavolo può più votare.`, { title: 'Chiudere il voto del tavolo?', ok: 'Chiudi il voto' })) return;
      try { F = await api(`${API}/close`, { method: 'POST', body: {} }); toast('Voto chiuso'); render(); } catch (e) { toast(e.message, true); }
    };
    // conteggio dei votanti in diretta
    let alive = true;
    const tick = async () => { if (!alive) return; try { const x = await api(API); if (x.table.status !== F.table.status) { F = x; return render(); } F.voters = x.voters; $('#vcount').textContent = x.voters; } catch { /* si riprova */ } setTimeout(tick, 4000); };
    setTimeout(tick, 4000);
    stopPoll = () => { alive = false; };
  }
}

function drawDraft() {
  const L = F.limits, max = F.maxNeeds;
  const canOpen = F.session.pmPhase === 'tavoli';
  app.innerHTML = `<div class="card">${head()}
    <p class="ink2" style="margin-top:12px">Scrivi fino a ${max} need emersi dalla discussione. Il codice (T1, T2…) segue l'ordine; puoi spostarli finché non apri il voto.</p>
    <div id="list">${draft.map((n, i) => `<div class="pm-nrow">
      <div class="row between"><span class="pm-code">T${i + 1}</span><div class="row">
        <button type="button" class="sm ghost" data-up="${i}" ${i ? '' : 'disabled'} aria-label="Sposta T${i + 1} in su">↑</button>
        <button type="button" class="sm ghost" data-down="${i}" ${i < draft.length - 1 ? '' : 'disabled'} aria-label="Sposta T${i + 1} in giù">↓</button>
        <button type="button" class="sm ghost" data-del="${i}">Togli<span class="sr-only"> T${i + 1}</span></button></div></div>
      <label class="f" for="nt${i}">Titolo *</label><input type="text" id="nt${i}" data-t="${i}" maxlength="${L.needTitle}" value="${esc(n.title)}">
      <label class="f" for="nd${i}">Descrizione (una frase, facoltativa)</label><input type="text" id="nd${i}" data-d="${i}" maxlength="${L.needDescr}" value="${esc(n.descr)}"></div>`).join('')}</div>
    ${draft.length < max ? '<button type="button" class="ghost" id="add">+ Aggiungi un need</button>' : `<p class="small muted">Hai inserito ${max} need, il massimo.</p>`}
    <p id="err" class="banner risk hidden" role="alert"></p>
    <div class="pm-send"><button class="ghost" id="save">Salva</button>
      <button class="big primary" id="open" ${canOpen ? '' : 'aria-disabled="true"'}>Conferma e apri il voto</button></div>
    ${canOpen ? '' : '<p class="small muted">Il voto si apre quando la regia ELIS avvia la fase dei tavoli. Intanto puoi scrivere e salvare.</p>'}</div>`;
  $$('[data-t]').forEach((x) => x.oninput = () => { draft[x.dataset.t].title = x.value; dirty = true; });
  $$('[data-d]').forEach((x) => x.oninput = () => { draft[x.dataset.d].descr = x.value; dirty = true; });
  const move = (i, j) => { [draft[i], draft[j]] = [draft[j], draft[i]]; dirty = true; drawDraft(); };
  $$('[data-up]').forEach((b) => b.onclick = () => move(+b.dataset.up, +b.dataset.up - 1));
  $$('[data-down]').forEach((b) => b.onclick = () => move(+b.dataset.down, +b.dataset.down + 1));
  $$('[data-del]').forEach((b) => b.onclick = () => { draft.splice(+b.dataset.del, 1); dirty = true; drawDraft(); });
  if ($('#add')) $('#add').onclick = () => { draft.push({ title: '', descr: '' }); drawDraft(); $(`#nt${draft.length - 1}`).focus(); };
  const save = async () => {
    const list = draft.filter((n) => n.title.trim() || n.descr.trim());
    if (list.some((n) => !n.title.trim())) { const e = $('#err'); e.textContent = 'Ogni need deve avere un titolo'; e.classList.remove('hidden'); return false; }
    try { F = await api(`${API}/needs`, { method: 'PUT', body: { needs: list } }); draft = F.needs.map((n) => ({ title: n.title, descr: n.descr || '' })); dirty = false; return true; }
    catch (e) { toast(e.message, true); return false; }
  };
  $('#save').onclick = async () => { if (await save()) { toast('Need salvati'); drawDraft(); } };
  $('#open').onclick = async () => {
    if (!canOpen) { try { const x = await api(API); F.session = x.session; } catch { /* rete */ } if (F.session.pmPhase !== 'tavoli') return toast('La regia ELIS non ha ancora avviato la fase dei tavoli', true); }
    if (!(await save())) return;
    if (!F.needs.length) return toast('Inserisci almeno un need', true);
    if (!await ask(`${F.needs.map((n) => `${n.code} ${n.title}`).join('\n')}\n\nDopo la conferma i need non si possono più aggiungere né togliere, e le persone del tavolo possono votare.`, { title: 'Confermare i need e aprire il voto?', ok: 'Conferma e apri il voto' })) return;
    try { F = await api(`${API}/open`, { method: 'POST', body: {} }); toast('Voto aperto'); render(); } catch (e) { toast(e.message, true); }
  };
}
addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
start();
