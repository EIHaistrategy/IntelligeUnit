// Pomeriggio · scelta finale dei 3 need dell'azienda, dal link del referente o dal tavolo del facilitatore ELIS.
// Si sceglie solo tra i need votati dalle persone dell'azienda (SCE-03). Nessun dato della Map (R1).
import { api, esc, $, $$, toast, ask, icon, fmtDate } from './ui.js';

export async function renderPmChoice(app, { API, FAC, sid }) {
  let S = await api(`${API}/pm/${sid}`);
  let sel = S.items.map((x) => ({ ...x }));     // scelte non ancora confermate
  const locked = () => !S.open || !!S.confirmedAt;
  const save = async (confirm) => {
    try { S = await api(`${API}/pm/${sid}`, { method: 'PUT', body: { items: sel, confirm } }); sel = S.items.map((x) => ({ ...x })); return true; } catch (e) { toast(e.message, true); return false; }
  };
  const needById = (id) => S.groups.flatMap((g) => g.needs.map((n) => ({ ...n, table: g }))).find((n) => n.needId === id);

  function draw() {
    const L = locked(), req = S.required;
    const chosenHtml = sel.length ? sel.map((x, i) => { const n = needById(x.needId); return `<div class="pm-nrow"><div class="row between"><span><span class="pm-code">${esc(n.code)}</span> <b>${esc(n.title)}</b></span><span class="small muted">${i + 1} di ${req}</span></div>
      <div class="small muted">Tavolo ${esc(n.table.label)} · ${esc(n.code)} · ${esc(n.table.title)}</div>
      ${L ? (x.ask ? `<p class="small" style="margin:6px 0 0"><b>${esc(S.texts.ask)}</b> ${esc(x.ask)}</p>` : '') : `<label class="f" for="ask-${x.needId}">${esc(S.texts.ask)}</label>
        <textarea id="ask-${x.needId}" data-ask="${x.needId}" maxlength="${S.limits.ask}" rows="2" aria-describedby="askn-${x.needId}">${esc(x.ask || '')}</textarea><p class="small muted" id="askn-${x.needId}" style="margin:2px 0 0">${esc(S.texts.askNote)}</p>`}</div>`; }).join('')
      : '<p class="small muted">Nessun need scelto ancora: toccali qui sotto.</p>';
    app.innerHTML = `<a class="back" href="#/">${icon('back')} ${FAC ? 'Tavolo dell\'azienda' : 'Le vostre sessioni'}</a>
      <div class="pagehead"><div><h1>Dai tavoli: i need da portare al vertice</h1>
        <p>${esc(S.session.title)}. ${FAC ? 'Con l\'azienda scegli' : 'Scegliete'} ${req < S.finalChoices ? `i ${req} need votati` : `${S.finalChoices} need`} tra quelli votati dalle persone dell'azienda al pomeriggio. Questi dati non entrano nello score né nel benchmark della Map.</p></div></div>
      ${!S.open && !S.confirmedAt ? `<div class="banner info">La scelta si apre a fine pomeriggio, quando la regia ELIS avvia la fase «Scelta dei 3 need». Prima i voti delle persone non si vedono.</div>` : ''}
      ${S.confirmedAt ? `<div class="banner ok">Scelta confermata il ${esc(fmtDate(S.confirmedAt))}. Entra nel report dell'azienda, nella sezione «Dai tavoli». Per cambiarla serve la regia ELIS.</div>` : ''}
      ${S.available && S.available < S.finalChoices ? `<div class="banner warn">Le persone dell'azienda hanno votato ${S.available} ${S.available === 1 ? 'need' : 'need'}: ${S.available === 1 ? 'si sceglie quello' : 'si scelgono tutti'}, e il report lo segnala.</div>` : ''}
      <section class="card" aria-labelledby="ch-t"><h2 id="ch-t">I need scelti</h2>${chosenHtml}
        ${L ? '' : `<div class="row" style="margin-top:12px;gap:8px"><button class="ghost" id="save">Salva</button><button class="primary" id="confirm" ${sel.length === req && req ? '' : 'aria-disabled="true"'}>${req < S.finalChoices ? `Conferma i ${req} need (votati solo ${req})` : `Conferma i ${req} need`}</button></div>`}</section>
      <section class="card" aria-labelledby="vt-t"><h2 id="vt-t">Need votati dalle persone dell'azienda</h2>
        ${S.groups.length ? S.groups.map((g) => `<h3 style="margin:14px 0 6px">Tavolo ${esc(g.label)} · ${esc(g.title)}</h3>
          ${g.needs.map((n) => { const on = sel.some((x) => x.needId === n.needId); return `<div class="pm-nrow">
            <button type="button" class="level ${on ? 'sel' : ''}" data-pick="${n.needId}" aria-pressed="${on}" ${L ? 'disabled' : ''}><span class="n">${esc(n.code)}</span><span><b>${esc(n.title)}</b>${n.descr ? `<br><span class="small">${esc(n.descr)}</span>` : ''}</span></button>
            <ul class="small" style="margin:8px 0 0;padding-left:18px">${n.voters.map((v) => `<li><b>${esc(v.name)}</b>: ${esc(v.priorityLabel)}, ${esc(v.horizonLabel.toLowerCase())}</li>`).join('')}</ul></div>`; }).join('')}`).join('')
          : '<p class="muted" style="margin:0">Nessuna persona dell\'azienda ha scelto un need al pomeriggio.</p>'}
      </section>`;
    bind();
  }
  function bind() {
    $$('[data-pick]').forEach((b) => b.onclick = () => {
      const id = Number(b.dataset.pick), i = sel.findIndex((x) => x.needId === id);
      if (i >= 0) sel.splice(i, 1); else if (sel.length >= S.finalChoices) return toast(`Al massimo ${S.finalChoices} need: togline prima uno`, true); else sel.push({ needId: id, ask: '' });
      save(false).then(() => { draw(); $(`[data-pick="${id}"]`)?.focus(); });
    });
    $$('[data-ask]').forEach((t) => { t.oninput = () => { sel.find((x) => x.needId === Number(t.dataset.ask)).ask = t.value; }; t.onchange = () => save(false); });
    if ($('#save')) $('#save').onclick = async () => { if (await save(false)) { toast('Scelta salvata'); draw(); } };
    if ($('#confirm')) $('#confirm').onclick = async () => {
      if (sel.length !== S.required) return toast(S.required < S.finalChoices ? `Scegli tutti i ${S.required} need votati` : `Scegli ${S.finalChoices} need`, true);
      if (!await ask(`${sel.map((x) => { const n = needById(x.needId); return `Tavolo ${n.table.label} · ${n.code} ${n.title}`; }).join('\n')}\n\nDopo la conferma la scelta non si modifica più: per cambiarla serve la regia ELIS.`, { title: `Confermare i ${S.required} need?`, ok: 'Conferma i need' })) return;
      if (await save(true)) { toast('Scelta confermata'); draw(); scrollTo(0, 0); }
    };
  }
  draw();
}
