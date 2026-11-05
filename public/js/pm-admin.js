// Pomeriggio · scheda della regia nella control room della sessione e cartoncini QR dei tavoli.
// Il quadro mostra per ogni tavolo stato, need e quante persone hanno votato: mai che cosa (R4, TAV-04).
import { api, esc, $, $$, toast, ask, askText, icon, fmtDate, qrLabeled } from './ui.js';

const STATUS = { bozza: ['chip-off', 'need in scrittura'], voto: ['chip-live', 'voto aperto'], chiuso: ['chip-done', 'voto chiuso'] };
const NEXT = {
  chiuso: ['tavoli', 'Avvia i tavoli e il voto', 'I facilitatori possono confermare i need e aprire il voto dei loro tavoli. Le persone votano dal QR del tavolo.'],
  tavoli: ['plenaria', 'Passa alla plenaria', 'I tavoli con il voto ancora aperto si chiudono: nessuno vota più. Le mappe dei tavoli si possono proiettare.'],
  plenaria: ['scelta', 'Apri la scelta dei 3 need', 'Referenti e facilitatori registrano i 3 need di ogni azienda tra quelli votati dalle sue persone.'],
  scelta: ['chiuso_def', 'Chiudi il pomeriggio', 'La scelta dei need non si modifica più e i link dei facilitatori dei tavoli smettono di funzionare.'],
};
const facUrl = (P, t) => `${P.baseUrl}/ft/${t.facToken}`;
const voteUrl = (P, t) => `${P.baseUrl}/t/${t.code}`;
const copy = async (text, label) => { try { await navigator.clipboard.writeText(text); toast(`${label} copiato`); } catch { await askText('Seleziona il testo e copialo.', text, { label, ok: 'Chiudi' }); } };

export async function renderPmConsole(host, sid) {
  let P = await api(`/api/admin/sessions/${sid}/pm`);
  let editing = null; // tavolo in modifica (numero, titolo, tema)
  const act = async (url, body, method = 'POST', msg) => {
    try { P = await api(url, { method, body: body || {} }); if (msg) toast(msg); draw(); return true; } catch (e) { toast(e.message, true); return false; }
  };

  function tableCard(t) {
    const [chip, lab] = STATUS[t.status];
    const ed = editing === t.id;
    return `<article class="pm-tcard" aria-labelledby="pmt-${t.id}">
      <div class="row between" style="align-items:flex-start;gap:10px"><div><h3 id="pmt-${t.id}">Tavolo ${esc(t.label)} · ${esc(t.title)}</h3>${t.theme ? `<div class="small muted">Tema del mattino: ${esc(t.theme)}</div>` : ''}</div>
        <span class="chip ${chip}">${lab}</span></div>
      <p class="small" style="margin:8px 0"><b>${t.needs}</b> ${t.needs === 1 ? 'need' : 'need'} · <b>${t.voters}</b> ${t.voters === 1 ? 'persona ha votato' : 'persone hanno votato'}</p>
      ${ed ? `<div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap">
          <div><label class="f" for="pe-l">Numero</label><input type="text" id="pe-l" value="${esc(t.label)}" maxlength="${P.limits.tableLabel}" style="width:80px"></div>
          <div style="flex:1;min-width:200px"><label class="f" for="pe-t">Titolo</label><input type="text" id="pe-t" value="${esc(t.title)}" maxlength="${P.limits.tableTitle}"></div>
          <div style="flex:1;min-width:160px"><label class="f" for="pe-h">Tema del mattino (facoltativo)</label><input type="text" id="pe-h" value="${esc(t.theme || '')}" maxlength="${P.limits.theme}"></div>
          <button class="sm primary" data-esave="${t.id}">Salva</button><button class="sm ghost" data-ecancel>Annulla</button></div>` : ''}
      ${t.needList.length ? `<ol class="small" style="margin:6px 0 8px;padding-left:0;list-style:none">${t.needList.map((n) => `<li><span class="pm-code">${esc(n.code)}</span> ${esc(n.title)}${t.status !== 'bozza' && P.pmPhase !== 'chiuso_def' ? ` <button type="button" class="link small" data-fix="${n.id}">correggi<span class="sr-only"> ${esc(n.code)}</span></button>` : ''}</li>`).join('')}</ol>` : '<p class="small muted">Nessun need ancora: li scrive il facilitatore dal suo telefono.</p>'}
      ${P.pmPhase === 'chiuso_def' ? '' : `<div class="row" style="gap:6px;flex-wrap:wrap">
        <button class="sm ghost" data-copyfac="${t.id}">Copia il link del facilitatore</button>
        <a class="btn sm ghost" href="${esc(facUrl(P, t))}" target="_blank">Apri<span class="sr-only"> il telefono del facilitatore del tavolo ${esc(t.label)}</span></a>
        ${t.status === 'voto' ? `<button class="sm" data-close="${t.id}">Chiudi il voto</button>` : ''}
        ${t.status === 'bozza' && !ed ? `<button class="sm ghost" data-edit="${t.id}">Modifica</button><button class="sm ghost" data-del="${t.id}">Togli il tavolo</button>` : ''}
        <details class="more"><summary class="btn sm ghost">Altro<span class="sr-only"> per il tavolo ${esc(t.label)}</span></summary><div class="more-menu">
          <button type="button" class="link" data-regen="${t.id}">Revoca e rigenera il link del facilitatore</button>
          ${t.votersList.length ? `<button type="button" class="link" data-voters="${t.id}">Annulla il voto di una persona</button>` : ''}</div></details></div>`}
    </article>`;
  }

  function draw() {
    const cur = P.phases.findIndex((p) => p.id === P.pmPhase), nx = NEXT[P.pmPhase];
    const open = P.tables.filter((t) => t.status === 'voto');
    const canEdit = P.pmPhase !== 'chiuso_def';
    host.innerHTML = `<div class="card"><div class="row between" style="align-items:flex-start;gap:12px">
        <div><h2 style="margin:0">Pomeriggio: votazione dei need</h2><p class="small ink2" style="margin:6px 0 0">Una sezione a sé: non usa e non mostra nessun dato della Map. I need si mostrano sempre in ordine di codice, senza classifiche, e i risultati di un tavolo si vedono solo dopo la chiusura del suo voto.</p></div>
        <div class="row" style="gap:6px"><a class="btn sm ghost" href="#/pm-qr/${sid}">QR dei tavoli</a><a class="btn sm ghost" href="/plenaria-pomeriggio/${sid}" target="_blank">Plenaria del pomeriggio</a></div></div>
      <ol class="pm-phases" aria-label="Fasi del pomeriggio">${P.phases.map((p, i) => `<li class="${i < cur ? 'done' : i === cur ? 'now' : ''}" ${i === cur ? 'aria-current="step"' : ''}>${i < cur ? icon('check') : ''}${esc(p.label)}</li>`).join('')}</ol>
      ${nx ? `<p class="small ink2" style="margin:10px 0 6px">${esc(nx[2])}</p><div class="row" style="gap:8px"><button class="primary" id="pm_next">${esc(nx[1])}</button>
        ${P.pmPhase === 'tavoli' && open.length ? `<button class="ghost" id="pm_closeall">Chiudi il voto di tutti i tavoli (${open.length})</button>` : ''}
        ${cur > 0 ? '<button class="ghost sm" id="pm_back">Torna alla fase precedente</button>' : ''}</div>`
        : '<p class="small muted" style="margin:10px 0 0">Pomeriggio concluso: i need scelti entrano nel report delle aziende, nella sezione «Dai tavoli».</p><button class="ghost sm" id="pm_back">Torna alla fase precedente</button>'}</div>
    <div class="card"><div class="sechead"><h2>Tavoli</h2></div>
      ${canEdit ? `<form class="row" id="pm_add" style="gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px">
        <div><label class="f" for="pa-l">Numero</label><input type="text" id="pa-l" placeholder="4 o 4a" maxlength="${P.limits.tableLabel}" style="width:90px" required></div>
        <div style="flex:1;min-width:220px"><label class="f" for="pa-t">Titolo del tavolo</label><input type="text" id="pa-t" maxlength="${P.limits.tableTitle}" required></div>
        <div style="flex:1;min-width:180px"><label class="f" for="pa-h">Tema del mattino (facoltativo)</label><input type="text" id="pa-h" maxlength="${P.limits.theme}"></div>
        <button class="primary" type="submit">Aggiungi il tavolo</button></form>
        <p class="small muted">Un tavolo replicato è un tavolo in più con la sua etichetta, per esempio 4a e 4b. Numero e titolo si cambiano fino all'apertura del voto.</p>` : ''}
      <div class="pm-tables">${P.tables.map(tableCard).join('') || '<p class="muted">Nessun tavolo: aggiungili qui sopra, anche la mattina stessa.</p>'}</div></div>
    <div class="card"><h2>Scelta dei 3 need per azienda</h2>
      <p class="small ink2">La registra il referente dal suo link o il facilitatore dal tavolo dell'azienda, nella fase «Scelta dei 3 need».</p>
      ${P.choices.length ? `<div class="tablewrap"><table><thead><tr><th>Azienda</th><th class="num">Persone che hanno votato</th><th>Scelta</th><th><span class="sr-only">Azioni</span></th></tr></thead><tbody>
        ${P.choices.map((c) => `<tr><td><b>${esc(c.name)}</b></td><td class="num">${c.voted}</td>
          <td>${c.status === 'confermata' ? `<span class="chip chip-done">confermata</span> <span class="small muted">${fmtDate(c.confirmedAt)}</span>` : c.status === 'in corso' ? '<span class="chip chip-live">in corso</span>' : '<span class="chip chip-off">non iniziata</span>'}</td>
          <td class="row" style="gap:6px"><a class="btn sm ghost" href="/tavolo-elis/${c.id}#/pomeriggio/${sid}" target="_blank">Apri il tavolo<span class="sr-only"> di ${esc(c.name)}</span></a>
            ${c.status === 'confermata' && P.pmPhase !== 'chiuso_def' ? `<button class="sm ghost" data-reopen="${c.id}" data-n="${esc(c.name)}">Riapri</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted" style="margin:0">Nessuna azienda ha ancora votato al pomeriggio.</p>'}</div>`;
    bind();
  }

  function bind() {
    const base = `/api/admin/sessions/${sid}/pm`;
    if ($('#pm_next')) $('#pm_next').onclick = async () => {
      const [to, label, what] = NEXT[P.pmPhase];
      const still = P.tables.filter((t) => t.status === 'voto').length;
      if (!await ask(`${what}${to === 'plenaria' && still ? ` Ci sono ${still} tavoli con il voto aperto.` : ''}`, { title: `${label}?`, ok: label })) return;
      act(`${base}/phase`, { phase: to }, 'POST', 'Fase aggiornata');
    };
    if ($('#pm_back')) $('#pm_back').onclick = async () => {
      const cur = P.phases.findIndex((p) => p.id === P.pmPhase);
      const reason = await askText(`Si torna a «${P.phases[cur - 1].label}». Il motivo resta nel registro modifiche.`, '', { title: 'Tornare alla fase precedente?', label: 'Motivo', required: true, ok: 'Torna indietro' });
      if (reason) act(`${base}/phase`, { phase: P.phases[cur - 1].id, reason }, 'POST', 'Fase aggiornata');
    };
    if ($('#pm_closeall')) $('#pm_closeall').onclick = async () => {
      if (!await ask('Le persone dei tavoli con il voto aperto non possono più votare. Le mappe dei tavoli si potranno proiettare.', { title: 'Chiudere il voto di tutti i tavoli?', ok: 'Chiudi il voto' })) return;
      act(`${base}/close-all`, {}, 'POST', 'Voto chiuso');
    };
    if ($('#pm_add')) $('#pm_add').onsubmit = (e) => { e.preventDefault(); act(`${base}/tables`, { label: $('#pa-l').value, title: $('#pa-t').value, theme: $('#pa-h').value }, 'POST', 'Tavolo aggiunto'); };
    const T = (id) => P.tables.find((t) => t.id === Number(id));
    $$('[data-copyfac]').forEach((b) => b.onclick = () => copy(facUrl(P, T(b.dataset.copyfac)), 'Link del facilitatore'));
    $$('[data-close]').forEach((b) => b.onclick = async () => {
      const t = T(b.dataset.close);
      if (!await ask(`Hanno votato ${t.voters} ${t.voters === 1 ? 'persona' : 'persone'}. Dopo la chiusura nessuno del tavolo può più votare.`, { title: `Chiudere il voto del tavolo ${t.label}?`, ok: 'Chiudi il voto' })) return;
      act(`/api/admin/pm/tables/${t.id}/close`, {}, 'POST', 'Voto chiuso');
    });
    $$('[data-edit]').forEach((b) => b.onclick = () => { editing = Number(b.dataset.edit); draw(); $('#pe-t').focus(); });
    $$('[data-ecancel]').forEach((b) => b.onclick = () => { editing = null; draw(); });
    $$('[data-esave]').forEach((b) => b.onclick = async () => { if (await act(`/api/admin/pm/tables/${b.dataset.esave}`, { label: $('#pe-l').value, title: $('#pe-t').value, theme: $('#pe-h').value }, 'PUT', 'Tavolo aggiornato')) { editing = null; draw(); } });
    $$('[data-del]').forEach((b) => b.onclick = async () => {
      const t = T(b.dataset.del);
      if (!await ask(`Il tavolo ${t.label} e i suoi need in bozza si tolgono. Il QR già stampato non funzionerà più.`, { title: 'Togliere il tavolo?', ok: 'Togli il tavolo', danger: true })) return;
      act(`/api/admin/pm/tables/${t.id}`, {}, 'DELETE', 'Tavolo tolto');
    });
    $$('[data-regen]').forEach((b) => b.onclick = async () => {
      const reason = await askText('Il link attuale del facilitatore smette di funzionare; ne nasce uno nuovo da mandargli.', '', { title: 'Revocare il link del facilitatore?', label: 'Motivo (resta nel registro)', required: true, ok: 'Rigenera il link' });
      if (reason) act(`/api/admin/pm/tables/${b.dataset.regen}/regen`, { reason }, 'POST', 'Nuovo link creato: copialo e mandalo al facilitatore');
    });
    $$('[data-fix]').forEach((b) => b.onclick = async () => {
      const n = P.tables.flatMap((t) => t.needList).find((x) => x.id === Number(b.dataset.fix));
      const title = await askText(`I voti già dati restano. Correggi solo errori di battitura: il significato del need non deve cambiare.`, n.title, { title: `Correggere il titolo di ${n.code}?`, label: 'Titolo', required: true, max: P.limits.needTitle, rows: 2, ok: 'Avanti' });
      if (!title) return;
      const descr = await askText('Descrizione (facoltativa): lascia vuoto per toglierla.', n.descr || '', { title: `Descrizione di ${n.code}`, label: 'Descrizione', max: P.limits.needDescr, rows: 2, ok: 'Avanti' });
      if (descr === null) return;
      const reason = await askText('Il motivo resta nel registro modifiche.', '', { title: 'Motivo della correzione', label: 'Motivo', required: true, ok: 'Correggi' });
      if (reason) act(`/api/admin/pm/needs/${n.id}`, { title, descr, reason }, 'PUT', 'Need corretto');
    });
    $$('[data-voters]').forEach((b) => b.onclick = async () => {
      const t = T(b.dataset.voters);
      const list = t.votersList.map((v, i) => `${i + 1}. ${v.name} (${v.company})`).join('\n');
      const n = await askText(`${list}\n\nScrivi il numero della persona. Il voto annullato resta nello storico; la persona potrà votare di nuovo, anche a un altro tavolo.`, '', { title: `Annullare un voto del tavolo ${t.label}?`, label: 'Numero della persona', required: true, rows: 1, ok: 'Avanti' });
      const v = t.votersList[Number(n) - 1];
      if (!n) return; if (!v) return toast('Numero non valido', true);
      const reason = await askText(`Si annulla il voto di ${v.name}. Il motivo resta nel registro modifiche.`, '', { title: 'Motivo', label: 'Motivo', required: true, ok: 'Annulla il voto', danger: true });
      if (reason) act(`/api/admin/pm/votes/${v.id}/cancel`, { reason }, 'POST', `Voto di ${v.name} annullato`);
    });
    $$('[data-reopen]').forEach((b) => b.onclick = async () => {
      const reason = await askText(`L'azienda ${b.dataset.n} potrà cambiare la scelta dei need. La scelta confermata resta nello storico.`, '', { title: 'Riaprire la scelta?', label: 'Motivo', required: true, ok: 'Riapri la scelta' });
      if (reason) act(`${base}/choices/${b.dataset.reopen}/reopen`, { reason }, 'POST', 'Scelta riaperta');
    });
  }
  draw();
}

// Cartoncini A4 dei tavoli: numero, titolo e QR per votare (TAV-03)
export async function viewPmQr(app, sid) {
  const P = await api(`/api/admin/sessions/${sid}/pm`);
  app.innerHTML = `<p class="noprint"><a class="back" href="#/sessione/${sid}/pomeriggio">${icon('back')} Pomeriggio</a></p>
    <div class="pagehead noprint"><div><h1>QR dei tavoli del pomeriggio</h1><p>Un cartoncino per tavolo: le persone inquadrano il QR del loro tavolo per votare. Chi ha usato lo stesso telefono al mattino entra senza inserire nulla.</p></div></div>
    ${P.tables.length ? `<div class="row noprint" style="margin-bottom:16px"><button onclick="print()">Stampa ${P.tables.length} ${P.tables.length === 1 ? 'cartoncino' : 'cartoncini'}</button></div>
      <div class="tablecards">${P.tables.map((t) => `<div class="tablecard pm-card"><div class="small muted">AI Transformation & Adoption Map · ${esc(P.session.title)} · pomeriggio</div>
        <p class="pm-cardnum">Tavolo ${esc(t.label)}</p>${qrLabeled(voteUrl(P, t), t.title, 230)}
        <p>Inquadra il QR con la fotocamera per votare i need del tavolo.</p>
        <p class="small tfallback">Se il QR non si apre: vai su <span class="mono">${esc(voteUrl(P, t).replace(/^https?:\/\//, ''))}</span></p></div>`).join('')}</div>`
      : '<div class="card"><p class="muted" style="margin:0">Nessun tavolo: aggiungili dalla scheda Pomeriggio della sessione.</p></div>'}`;
}
