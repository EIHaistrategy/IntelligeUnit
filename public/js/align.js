// Allineamento finale (§14.1), dal link del referente o dal tavolo del facilitatore ELIS.
// Per ogni capacità si conferma il valore della sessione o lo si modifica con un'evidenza: il valore della sessione resta
// e la pagina mostra lo spostamento. Poi le tre priorità finali e la conferma.
import { api, esc, $, $$, toast, ask, fmtScore, fmtDate, levelLabel, icon } from './ui.js';

const shiftTag = (x) => (x == null || x === 0 ? '<span class="shift zero">invariato</span>'
  : `<span class="shift ${x > 0 ? 'up' : 'down'}">${x > 0 ? '▲ +' : '▼ '}${fmtScore(x).replace('-', '−')}</span>`);

export async function renderAlignment(app, { API, FAC }) {
  let S = await api(`${API}/alignment`);
  const editing = new Map(); // item aperti in modifica: livello, sotto-opzione ed evidenza non ancora salvati
  let prio = [...S.priorities], note = S.prioritiesNote;
  // il facilitatore ELIS può preparare l'allineamento anche prima che sia aperto alle aziende
  const isLocked = () => !!S.confirmedAt || (!S.open && !FAC);

  // salvando una capacità non si perdono priorità e nota scelte ma non ancora salvate
  const save = async (url, body, method = 'PUT') => {
    try {
      S = await api(`${API}${url}`, { method, body });
      if (!url.includes('/item/')) { prio = [...S.priorities]; note = S.prioritiesNote; }
      return true;
    } catch (e) { toast(e.message, true); return false; }
  };

  function itemHtml(it) {
    const done = !!it.current, locked = isLocked();
    const ed = editing.get(it.itemId);
    const lvDef = ed && it.levels.find((l) => l.level === ed.level);
    const state = !done ? '<span class="tag warn">da rivedere</span>'
      : it.current.action === 'modifica' ? `<span class="tag navy">modificato</span> ${shiftTag(it.shift)}` : '<span class="tag ok">confermato</span>';
    return `<section class="card al-item ${done ? 'done' : ''}" id="al-${it.itemId}" aria-labelledby="alh-${it.itemId}">
      <div class="row between" style="align-items:flex-start;gap:12px">
        <div><span class="tag navy">${esc(it.itemId)}</span> <span class="small muted">Dim. ${esc(it.dimension)} · ${esc(it.sessionName)}${it.preJuly ? ' · da riallineare' : ''}</span>
          <h3 id="alh-${it.itemId}" style="margin:6px 0 2px">${esc(it.title)}</h3></div>
        <div class="al-state">${state}</div></div>
      <div class="al-compare">
        <div><span class="small muted">In sessione</span><b>${it.base ? levelLabel(it.base.level, it.base.sub) : '—'}</b><span class="small">${it.base ? `${fmtScore(it.base.score)} · ${esc(it.base.descriptor || '')}` : 'non misurata'}</span></div>
        <div aria-hidden="true" class="al-arrow">${icon('arrow')}</div>
        <div><span class="small muted">Allineamento</span><b>${done ? levelLabel(it.current.level, it.current.sub) : '—'}</b><span class="small">${done ? `${fmtScore(it.current.score)}${it.current.evidence ? ` · ${esc(it.current.evidence)}` : ''}` : 'da scegliere'}</span></div>
      </div>
      ${it.current?.baseChanged ? '<div class="banner warn small" style="margin-top:10px">Il valore della sessione è stato corretto da ELIS dopo questa modifica: lo spostamento è calcolato sul valore corretto. Ricontrollate la modifica.</div>' : ''}
      ${locked ? '' : ed ? `
        <div class="al-edit">
          <p class="statement small">${esc(it.statement)}</p>
          <div class="levels" role="group" aria-label="Nuovo livello ${esc(it.itemId)}">${it.levels.map((l) => `<button type="button" class="level ${ed.level === l.level ? 'sel' : ''}" data-al-l="${it.itemId}:${l.level}" aria-pressed="${ed.level === l.level}"><span class="n">${l.level}</span><span>${esc(l.descriptor)}</span></button>`).join('')}</div>
          ${lvDef?.sub?.length ? `<div class="subchoice" role="group" aria-label="Sotto-opzione ${esc(it.itemId)}">${lvDef.sub.map((x) => `<button type="button" class="level ${ed.sub === x.key ? 'sel' : ''}" data-al-s="${it.itemId}:${x.key}" aria-pressed="${ed.sub === x.key}"><span class="n">${ed.level}${x.key}</span><span>${esc(x.text)}</span></button>`).join('')}</div>` : ''}
          <label class="f" for="ev-${it.itemId}">Evidenza: che cosa è cambiato rispetto alla sessione, con un fatto osservabile *</label>
          <textarea id="ev-${it.itemId}" maxlength="2000" data-al-ev="${it.itemId}" aria-required="true" aria-describedby="everr-${it.itemId}" ${ed.err ? 'aria-invalid="true"' : ''}>${esc(ed.evidence || '')}</textarea>
          <p id="everr-${it.itemId}" class="field-err" ${ed.err ? '' : 'hidden'}>${esc(ed.err || '')}</p>
          <div class="row" style="margin-top:10px"><button type="button" class="primary" data-al-save="${it.itemId}">Salva la modifica</button><button type="button" class="ghost" data-al-cancel="${it.itemId}">Annulla</button></div>
        </div>` : `<div class="row" style="margin-top:12px">${it.base ? `<button type="button" class="${done && it.current.action === 'conferma' ? 'ghost' : ''}" data-al-ok="${it.itemId}" ${done && it.current.action === 'conferma' ? 'disabled' : ''}>${!done ? 'Confermo il valore' : it.current.action === 'conferma' ? 'Confermato' : 'Torna al valore della sessione'}</button>` : ''}<button type="button" class="ghost" data-al-mod="${it.itemId}">${done && it.current.action === 'modifica' ? 'Cambia la modifica' : 'Modifico'}</button></div>`}
    </section>`;
  }

  function draw() {
    const bySess = [...new Set(S.items.map((i) => i.sessionName))];
    // due colonne compatte: al telefono la tabella resta dentro lo schermo
    const dimRows = S.dims.map((d) => `<li><span class="dim-letter">${d.id}</span><span class="al-dn">${esc(d.name)}</span>
      <span class="al-dv">${d.before == null ? '<span class="muted small">non misurata</span>' : `${fmtScore(d.before)} → <b>${fmtScore(d.after)}</b> ${shiftTag(d.shift)}`}</span></li>`).join('');
    const locked = isLocked();
    app.innerHTML = `<a class="back" href="#/">${icon('back')} ${FAC ? 'Tavolo dell\'azienda' : 'Le vostre sessioni'}</a>
      <div class="pagehead"><div><h1>Allineamento finale</h1>
        <p>${FAC ? 'Con l\'azienda, rivedi le 16 capacità misurate nelle quattro sessioni: per ognuna conferma il valore o modificalo indicando un\'evidenza.' : 'Rivedete le 16 capacità misurate nelle quattro sessioni: per ognuna confermate il valore o modificatelo indicando un\'evidenza.'} I valori delle sessioni non si cancellano: il report unificato mostra lo spostamento rispetto alla prima rilevazione. Le 12 capacità misurate prima di luglio sono da riallineare; quelle di Scalare si possono correggere.</p></div></div>
      ${!S.open ? (FAC ? '<div class="banner info">L\'allineamento non è ancora aperto alle aziende: come facilitatore puoi già prepararlo; il referente lo vedrà quando lo apri dalla console.</div>' : '<div class="banner warn">L\'allineamento finale non è ancora aperto: ELIS lo aprirà a settembre 2027. Intanto potete vedere i valori.</div>') : ''}
      ${S.confirmedAt ? `<div class="banner ok">Allineamento confermato il ${esc(fmtDate(S.confirmedAt))}. ${S.released ? 'Il report unificato è disponibile tra i report riservati.' : 'ELIS rilascerà il report unificato.'} ${FAC ? 'Per una correzione riaprilo dalla console (Allineamento finale → Riapri).' : 'Per una correzione contattate ELIS.'}</div>` : ''}
      <div class="card"><div class="row between"><h2 style="margin:0">Vista d'insieme</h2><span class="small"><b>${S.reviewed} di ${S.total}</b> capacità riviste · ${S.changed} ${S.changed === 1 ? 'modificata' : 'modificate'}</span></div>
        <div class="meter-bar" role="progressbar" aria-label="Capacità riviste" aria-valuemin="0" aria-valuemax="${S.total}" aria-valuenow="${S.reviewed}" style="margin:12px 0 16px"><i style="width:${S.total ? Math.round((S.reviewed / S.total) * 100) : 0}%"></i></div>
        <p class="small muted" style="margin:0 0 6px">Per dimensione: score in sessione → dopo l'allineamento.</p>
        <ul class="al-dims">${dimRows}</ul>
        ${S.overallBefore != null ? `<p class="small muted" style="margin-top:8px">Indicatore complessivo: ${fmtScore(S.overallBefore)} in sessione, <b>${fmtScore(S.overallAfter)}</b> dopo l'allineamento.</p>` : ''}</div>
      ${bySess.map((n) => `<h2 class="al-sess">${esc(n)}</h2>${S.items.filter((i) => i.sessionName === n).map(itemHtml).join('')}`).join('')}
      <section class="card" aria-labelledby="pr-t"><h2 id="pr-t">Le tre priorità finali</h2>
        <p class="small ink2">${FAC ? 'Tre dimensioni scelte dall\'azienda' : 'Scegliete tre dimensioni'}, nell'ordine di importanza. La piattaforma propone ${S.suggestedPriorities.map((x) => `<b>${x}</b>`).join(', ')} secondo la regola della nota (coerenza, prerequisiti fondativi, dimensioni sotto 70 e sotto i peer): potete confermarle o cambiarle.</p>
        ${locked && S.confirmedAt ? `<ol class="al-prio-done">${S.priorities.map((id) => { const d = S.dims.find((x) => x.id === id); return `<li><b>${id} · ${esc(d?.name || '')}</b> <span class="small muted">${fmtScore(d?.after)}</span></li>`; }).join('')}</ol>${S.prioritiesNote ? `<p class="small">${esc(S.prioritiesNote)}</p>` : ''}` : `
        <div class="al-prio" role="group" aria-label="Priorità finali">${S.dims.map((d) => { const i = prio.indexOf(d.id); return `<button type="button" class="level ${i >= 0 ? 'sel' : ''}" data-al-p="${d.id}" aria-pressed="${i >= 0}" ${locked ? 'disabled' : ''}><span class="n">${i >= 0 ? `<span class="sr-only">Priorità </span>${i + 1}` : d.id}</span><span><b>${d.id} · ${esc(d.name)}</b><br><span class="small">${fmtScore(d.after)}${S.suggestedPriorities.includes(d.id) ? ' · proposta' : ''}</span></span></button>`; }).join('')}</div>
        <label class="f" for="pr-note">Perché queste priorità (facoltativo)</label><textarea id="pr-note" maxlength="2000" ${locked ? 'disabled' : ''}>${esc(note)}</textarea>
        ${locked ? '' : `<div class="row" style="margin-top:10px"><button type="button" class="ghost" id="pr-save">Salva le priorità</button></div>`}`}
      </section>
      ${locked ? '' : `<section class="card"><h2>Conferma</h2><p class="small ink2">Quando tutte le capacità sono riviste e le tre priorità scelte, confermate l'allineamento. Dopo la conferma non si modifica più: per una correzione serve ELIS.</p>
        <button type="button" class="primary" id="al-confirm" ${S.reviewed < S.total || prio.length !== 3 ? 'aria-disabled="true"' : ''}>Conferma l'allineamento</button>
        ${S.reviewed < S.total || prio.length !== 3 ? `<p class="small muted" style="margin-top:8px">Manca: ${[S.reviewed < S.total ? `${S.total - S.reviewed} capacità da rivedere` : '', prio.length !== 3 ? 'le tre priorità' : ''].filter(Boolean).join(' e ')}.</p>` : ''}</section>`}`;
    bind();
  }

  const focusIn = (id, sel) => { const el = $(`#al-${id} ${sel}`) || $(`#al-${id}`); el?.focus({ preventScroll: false }); };
  function bind() {
    $$('[data-al-ok]').forEach((b) => b.onclick = async () => { const id = b.dataset.alOk; if (await save(`/alignment/item/${id}`, { action: 'conferma' })) { editing.delete(id); draw(); focusIn(id, '[data-al-mod]'); } });
    $$('[data-al-mod]').forEach((b) => b.onclick = () => {
      const id = b.dataset.alMod, it = S.items.find((x) => x.itemId === id), src = it.current || it.base;
      editing.set(id, { level: src?.level ?? null, sub: src?.sub ?? null, evidence: it.current?.action === 'modifica' ? it.current.evidence : '' });
      draw(); focusIn(id, '.level.sel, .level');
    });
    $$('[data-al-cancel]').forEach((b) => b.onclick = () => { editing.delete(b.dataset.alCancel); draw(); focusIn(b.dataset.alCancel, '[data-al-mod]'); });
    $$('[data-al-l]').forEach((b) => b.onclick = () => { const [id, l] = b.dataset.alL.split(':'); const e = editing.get(id); e.level = Number(l);
      // la prima sotto-opzione si vede già selezionata: niente scelte implicite
      e.sub = S.items.find((x) => x.itemId === id).levels.find((x) => x.level === e.level)?.sub?.[0]?.key || null; draw(); focusIn(id, `[data-al-l="${id}:${l}"]`); });
    $$('[data-al-s]').forEach((b) => b.onclick = () => { const [id, k] = b.dataset.alS.split(':'); editing.get(id).sub = k; draw(); focusIn(id, `[data-al-s="${id}:${k}"]`); });
    $$('[data-al-ev]').forEach((t) => t.oninput = () => { editing.get(t.dataset.alEv).evidence = t.value; });
    $$('[data-al-save]').forEach((b) => b.onclick = async () => {
      const id = b.dataset.alSave, e = editing.get(id);
      if (e.level == null) return toast('Scegli il livello', true);
      // evidenza mancante: messaggio fisso sotto il campo, focus sul campo
      if (!String(e.evidence || '').trim()) { e.err = 'Scrivi l\'evidenza: che cosa è cambiato rispetto alla sessione, con un fatto osservabile.'; draw(); focusIn(id, `#ev-${id}`); return; }
      e.err = null;
      if (await save(`/alignment/item/${id}`, { action: 'modifica', level: e.level, sub: e.sub, evidence: e.evidence })) {
        editing.delete(id);
        toast(S.items.find((x) => x.itemId === id)?.current?.action === 'conferma' ? 'Il valore scelto è uguale a quello della sessione: registrato come conferma' : 'Modifica salvata');
        draw(); focusIn(id, '[data-al-mod]');
      }
    });
    $$('[data-al-p]').forEach((b) => b.onclick = () => {
      const id = b.dataset.alP, i = prio.indexOf(id);
      if (i >= 0) prio.splice(i, 1); else if (prio.length < 3) prio.push(id); else return toast('Al massimo tre priorità: togline prima una', true);
      draw(); $(`[data-al-p="${id}"]`).focus();
    });
    if ($('#pr-note')) $('#pr-note').oninput = (e) => { note = e.target.value; };
    if ($('#pr-save')) $('#pr-save').onclick = async () => { if (await save('/alignment/priorities', { priorities: prio, note })) { toast('Priorità salvate'); draw(); } };
    if ($('#al-confirm')) $('#al-confirm').onclick = async () => {
      if (S.reviewed < S.total || prio.length !== 3) return toast('Prima rivedete tutte le capacità e scegliete le tre priorità', true);
      if (prio.join() !== S.priorities.join() || note !== S.prioritiesNote) { if (!(await save('/alignment/priorities', { priorities: prio, note }))) return; }
      if (!await ask('Confermare l\'allineamento finale? Dopo la conferma non si modifica più: per una correzione serve ELIS.')) return;
      if (await save('/alignment/confirm', {}, 'POST')) { toast('Allineamento confermato'); draw(); scrollTo(0, 0); }
    };
  }
  draw();
}
