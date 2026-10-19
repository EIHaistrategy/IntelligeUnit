import { api, esc, $, $$, toast, poll, distBars, confTag, phaseChips, qrImg, fmtScore, fmtDate, bandTag, levelLabel, alt } from './ui.js';

const T = location.pathname.split('/').pop();
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
  try { me = await api(`/api/r/${T}`); } catch (e) { app.innerHTML = `<div class="card"><h2>Link non valido</h2><p>${esc(e.message)}</p></div>`; return; }
  $('#who').textContent = `${me.referent.company} · ${me.referent.name}`;
  addEventListener('hashchange', route);
  route();
}

function route() {
  if (stopPoll) { stopPoll(); stopPoll = null; }
  const [, view, arg] = location.hash.split('/');
  if (view === 'scheda') return renderScheda(arg);
  if (view === 'sessione') return renderSession(Number(arg));
  return renderHome();
}

async function renderHome() {
  me = await api(`/api/r/${T}`);
  app.innerHTML = `
    <div class="pagehead"><div><h1>${esc(me.referent.company)}</h1>
      <p>Perimetro valutato: <b>${esc(me.referent.perimeter || 'non indicato')}</b>${me.referent.kind !== 'REALE' ? ` <span class="tag warn">${esc(me.referent.kind)}</span>` : ''}</p></div></div>
    <p class="lede" style="margin-bottom:20px">Da qui compili la scheda pre-sessione una settimana prima, segui i partecipanti in sala e registri la posizione ufficiale dell'azienda nel consolidamento.</p>
    <div class="${me.reports.length ? 'card' : 'hidden'}">
      ${me.reports.length ? `<h2>Report riservati</h2><table><tbody>${me.reports.map((v) => `<tr><td><b>${esc(v.session_title)}</b>${v.version > 1 ? ` <span class="tag">versione ${v.version}</span>` : ''}</td><td class="small muted">rilasciato il ${fmtDate(v.created_at)}</td>
        <td><a href="/report/${me.referent.companyId}?t=${T}&snap=${v.id}" target="_blank">Apri</a> · <a href="/api/report/${me.referent.companyId}/pdf?t=${T}&snap=${v.id}">PDF</a></td></tr>`).join('')}</tbody></table>` : ''}
    </div>
    <div class="card"><h2>Sessioni</h2><div class="tablewrap"><table>
      <thead><tr><th>Sessione</th><th>Fase</th><th>Scheda pre-sessione</th><th>Partecipanti</th><th>Consolidato</th><th></th></tr></thead>
      <tbody>${me.sessions.map((s) => `<tr>
        <td><b>${esc(s.title)}</b>${s.mode === 'adhoc' ? ' <span class="tag gold">ad hoc</span>' : ''}</td>
        <td><span class="tag ${['chiusa', 'preparazione'].includes(s.phase) ? '' : 'navy'}">${esc(s.phase.charAt(0).toUpperCase() + s.phase.slice(1))}</span></td>
        <td>${s.presession_updated_at ? `<span class="tag ok">compilata</span> <span class="small muted">${fmtDate(s.presession_updated_at)}</span>` : '<span class="tag warn">da compilare</span>'}<br><a href="#/scheda/${s.base}" class="small">Apri scheda</a></td>
        <td class="num">${s.participants}</td>
        <td>${s.consolidated_at ? `<span class="tag ok">sì</span> <span class="small muted">${fmtDate(s.consolidated_at)}</span>` : '—'}</td>
        <td><a class="btn sm" href="#/sessione/${s.id}">Apri</a></td></tr>`).join('')}</tbody></table></div></div>`;
}

// ---------- Scheda pre-sessione ----------
async function renderScheda(base) {
  const r = await api(`/api/r/${T}/presession/${base}`);
  const d = r.saved.data || {};
  const byItem = {};
  r.fields.facts.forEach((f) => (byItem[f.itemId] ||= []).push(f));
  const input = (f) => {
    const v = d[f.id];
    if (f.type === 'choice') return f.options.map((o) => `<label class="check"><input type="radio" name="${f.id}" value="${esc(o.label)}" ${v === o.label ? 'checked' : ''}> ${esc(o.label)}</label>`).join('');
    if (f.type === 'multi') return f.options.map((o) => `<label class="check"><input type="checkbox" name="${f.id}" value="${esc(o.label)}" ${Array.isArray(v) && v.includes(o.label) ? 'checked' : ''}> ${esc(o.label)}</label>`).join('');
    if (f.type === 'percent') return `<div class="row"><input type="number" min="0" max="100" step="0.1" name="${f.id}" aria-label="${esc(f.q)}" value="${esc(v ?? '')}" style="max-width:140px"> <span>%</span></div>`;
    if (f.type === 'count') return `<input type="number" min="0" step="1" name="${f.id}" aria-label="${esc(f.q)}" value="${esc(v ?? '')}" style="max-width:140px">`;
    return '';
  };
  app.innerHTML = `<a class="back" href="#/">← Sessioni</a>
    <div class="pagehead"><div><h1>Scheda pre-sessione: ${esc(r.session.name)}</h1></div></div>
    <div class="card flat">
      <p class="ink2" style="margin:0">Da compilare una settimana prima della sessione. Sono dati fattuali: servono in sala per scegliere le sotto-opzioni senza doverli cercare durante il consolidamento. Se un dato non è disponibile, lascia vuoto.</p>
      ${r.saved.updated_at ? `<p class="small muted" style="margin:8px 0 0">Ultimo salvataggio: ${fmtDate(r.saved.updated_at)}</p>` : ''}</div>
    <form id="f">
    ${Object.entries(byItem).map(([itemId, facts]) => `<div class="card"><h2><span class="tag navy" style="margin-right:8px;vertical-align:4px">${esc(itemId)}</span>${esc(INST.items[itemId].title)}</h2>
      ${facts[0].factOwner ? `<p class="small"><span class="tag gold">${esc(facts[0].factOwner)}</span></p>` : ''}
      ${facts.map((f) => `<fieldset class="q"><legend>${esc(f.q)}</legend><div class="small muted">Serve per il livello ${f.level}</div>${input(f)}</fieldset>`).join('')}</div>`).join('')}
    <div class="card"><h2>Profilo di approccio</h2><p class="small muted">Domande fuori punteggio: descrivono come l'azienda si trasforma, non quanto è avanti.</p>
      ${r.fields.profile.map((p) => `<fieldset class="q"><legend>${esc(p.q)}</legend><div>${p.type === 'percent'
        ? `<div class="row"><input type="number" min="0" max="100" step="0.1" name="${p.id}" aria-label="${esc(p.q)}" value="${esc(d[p.id] ?? '')}" style="max-width:140px"> <span>%</span></div>`
        : p.options.map((o) => `<label class="check"><input type="radio" name="${p.id}" value="${esc(o)}" ${d[p.id] === o ? 'checked' : ''}> ${esc(o)}</label>`).join('')}</div></fieldset>`).join('')}</div>
    <div class="sticky-foot"><button type="submit">Salva la scheda</button></div></form>`;
  $('#f').onsubmit = async (ev) => {
    ev.preventDefault();
    const data = {};
    for (const f of r.fields.facts) {
      if (f.type === 'multi') data[f.id] = $$(`[name="${f.id}"]:checked`).map((x) => x.value);
      else if (f.type === 'choice') { const x = $(`[name="${f.id}"]:checked`); if (x) data[f.id] = x.value; }
      else { const x = $(`[name="${f.id}"]`).value; if (x !== '') data[f.id] = Number(x); }
    }
    for (const p of r.fields.profile) {
      if (p.type === 'percent') { const x = $(`[name="${p.id}"]`).value; if (x !== '') data[p.id] = Number(x); }
      else { const x = $(`[name="${p.id}"]:checked`); if (x) data[p.id] = x.value; }
    }
    try { await api(`/api/r/${T}/presession/${base}`, { method: 'PUT', body: { data } }); toast('Scheda salvata'); location.hash = '#/'; }
    catch (e) { toast(e.message, true); }
  };
}

// ---------- Sessione ----------
let sess = null, phaseShown = null;

async function renderSession(sid) {
  sess = await api(`/api/r/${T}/session/${sid}`);
  phaseShown = sess.session.phase;
  draw();
  stopPoll = poll(async () => {
    const s = await api(`/api/r/${T}/session/${sid}`);
    const phaseChanged = s.session.phase !== phaseShown;
    const partsChanged = JSON.stringify(s.participants) !== JSON.stringify(sess.participants);
    const cmpChanged = JSON.stringify(s.consolidation?.comparison) !== JSON.stringify(sess.consolidation?.comparison);
    const otherConfirmed = s.consolidation && sess.consolidation && s.consolidation.consolidatedAt !== sess.consolidation.consolidatedAt;
    sess = s;
    if (phaseChanged) { phaseShown = s.session.phase; draw(); }
    else if (['preparazione', 'individuale'].includes(s.session.phase)) { if (partsChanged) drawParticipants(); }
    else if (s.session.phase === 'confronto') { if (cmpChanged || partsChanged) draw(); }
    else if (otherConfirmed) { toast('Il consolidamento è stato confermato da un altro referente: valori aggiornati'); drawConsolidation(); }
  }, 4000);
}

function draw() {
  const s = sess.session;
  const intro = {
    preparazione: 'I partecipanti possono già registrarsi con il QR. La fase individuale la apre il facilitatore.',
    individuale: 'Fase individuale (10 minuti): ognuno risponde da solo, senza vedere le risposte degli altri.',
    confronto: 'Confronto (10 minuti): guardate insieme dove le risposte divergono e su quali evidenze si basano.',
    consolidamento: 'Consolidamento (10 minuti): registrate la posizione ufficiale dell\'azienda, poi priorità e commitment.',
    chiusa: 'Sessione chiusa.',
  }[s.phase];
  app.innerHTML = `<a class="back" href="#/">← Sessioni</a>
    <div class="sesshead"><div class="pagehead"><h1>${esc(s.title)}</h1>${phaseChips(s.phase)}</div><p class="phaseintro">${intro}</p></div>
    <div id="parts"></div><div id="body"></div>`;
  drawParticipants();
  if (s.phase === 'confronto') drawComparison();
  if (['consolidamento', 'chiusa'].includes(s.phase)) drawConsolidation();
}

function drawParticipants() {
  const el = $('#parts'); if (!el) return;
  const showQr = ['preparazione', 'individuale'].includes(sess.session.phase);
  el.innerHTML = `<div class="card"><div class="grid ${showQr ? 'c2' : ''}">
    <div><h2>Partecipanti della vostra azienda <span class="muted" style="font-family:var(--font);font-weight:600">${sess.participants.length}</span></h2>
      ${sess.participants.length ? `<table><tbody>${sess.participants.map((p) => `<tr><td>${esc(p.name)}</td><td class="small muted">${esc(INST.functions.find((f) => f.id === p.func)?.label || p.func)}</td>
        <td>${p.submitted ? '<span class="tag ok">inviato</span>' : '<span class="tag">in corso</span>'}</td>
        <td>${showQr ? `<button class="sm danger" data-rm="${p.id}" title="Rimuovi una registrazione errata">Rimuovi</button>` : ''}</td></tr>`).join('')}</tbody></table>`
        : '<p class="muted">Nessuno registrato. Fate inquadrare il QR ai partecipanti.</p>'}
      <p class="small muted">Sono attesi 3–4 partecipanti tra le funzioni protagoniste della sessione. La confidence è alta con almeno 3 risposte valide da almeno 2 funzioni diverse.</p></div>
    ${showQr ? `<div style="text-align:center">${qrImg(sess.joinUrl, 200)}<p style="margin-top:10px">Codice azienda: <b class="mono" style="font-size:1.3rem;letter-spacing:.15em">${esc(new URL(sess.joinUrl).searchParams.get('c') || '')}</b></p><p class="small mono" style="word-break:break-all">${esc(sess.joinUrl)}</p></div>` : ''}
  </div></div>`;
  $$('[data-rm]').forEach((b) => b.onclick = async () => {
    if (!confirm('Rimuovere questa registrazione? Le sue risposte non verranno considerate.')) return;
    try { await api(`/api/r/${T}/session/${sess.session.id}/participant/${b.dataset.rm}`, { method: 'DELETE', body: { reason: 'Registrazione errata' } }); sess = await api(`/api/r/${T}/session/${sess.session.id}`); drawParticipants(); }
    catch (e) { toast(e.message, true); }
  });
}

function comparisonHtml(c) {
  return `<div class="grid c2">${c.items.map((it) => `<div class="card"><div class="row between" style="align-items:flex-start;margin-bottom:12px"><h3 style="margin:0">${esc(it.itemId)} · ${esc(it.title)}</h3>${confTag(it.confidence)}</div>
    ${distBars(it.summary)}
    <dl class="facts"><div><dt>Mediana</dt><dd>${it.summary.median ?? '—'}</dd></div><div><dt>Range</dt><dd>${it.summary.range ?? '—'}</dd></div><div><dt>Valide</dt><dd>${it.summary.valid}</dd></div><div><dt>N.D.</dt><dd>${it.summary.nd}</dd></div><div><dt>Funzioni</dt><dd>${it.summary.perspectives}</dd></div></dl>
    ${it.summary.divergent ? '<div class="banner warn">Divergenza ≥ 2 livelli: discussione obbligatoria prima del consolidamento.</div>' : ''}</div>`).join('')}</div>
    <div class="card"><h3>Confronti a coppie</h3>${c.pairs.map((p) => `<p><b>${esc(p.a)} ${esc(p.aTitle)}</b>: ${p.counts.A} · <b>${esc(p.b)} ${esc(p.bTitle)}</b>: ${p.counts.B} · N.D.: ${p.counts.ND}
      ${p.discordant ? `<br><span class="tag risk">${p.discordant} su ${p.evaluable} in contrasto con i livelli scelti dalla stessa persona: punto da chiarire</span>` : ''}</p>`).join('')}</div>`;
}

function drawComparison() {
  $('#body').innerHTML = comparisonHtml(sess.consolidation.comparison);
}

// ---------- Consolidamento ----------
let form = {};
let saveTimer;
function saveDraftSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => api(`/api/r/${T}/session/${sess.session.id}/draft`, { method: 'PUT', body: { items: form } }).catch(() => {}), 600);
}

function drawConsolidation() {
  const C = sess.consolidation;
  const done = !!C.consolidatedAt;
  const editable = sess.session.phase === 'consolidamento';
  form = {};
  for (const it of C.items) {
    const d = it.draft || {};
    const cur = C.current[it.itemId];
    const fromCur = done && cur ? { level: cur.level, sub: cur.sub, overrideReason: cur.override_reason } : null;
    form[it.itemId] = fromCur || { level: d.level ?? it.proposed ?? null, sub: d.sub ?? null, overrideReason: d.overrideReason ?? '' };
  }
  $('#body').innerHTML = `
    ${done ? `<div class="banner ok">Consolidamento confermato il ${fmtDate(C.consolidatedAt)}. ${editable ? 'Finché la fase è aperta potete correggerlo e confermare di nuovo: la versione precedente resta nello storico.' : ''}</div>` : ''}
    ${!editable && !done ? '<div class="banner warn">Il consolidamento non è stato completato. Contattate il facilitatore ELIS.</div>' : ''}
    <details class="card"><summary>Rivedi la vista di confronto</summary><div style="margin-top:12px">${comparisonHtml(C.comparison)}</div></details>
    <div id="items"></div>
    ${editable ? '<div class="card"><div id="errs" role="alert"></div>' + (done ? '<label class="f" for="chg">Motivo della modifica (il consolidamento era già confermato) *</label><input type="text" id="chg" maxlength="1000" style="margin-bottom:10px">' : '') + '<button class="big" id="confirm">Conferma il consolidamento</button><p class="small muted" style="margin-top:8px">Livello ufficiale e sotto-opzione diventano il dato dell\'azienda per questa sessione.</p></div>' : ''}
    <div id="summary"></div><div id="commit"></div>`;
  C.items.forEach((it) => drawItem(it, editable));
  const btn = $('#confirm');
  if (btn) btn.onclick = async () => {
    btn.disabled = true;
    try {
      await api(`/api/r/${T}/session/${sess.session.id}/confirm`, { method: 'POST', body: { items: form, changeReason: $('#chg')?.value || '', baseConsolidatedAt: C.consolidatedAt || null } });
      toast('Consolidamento confermato');
      sess = await api(`/api/r/${T}/session/${sess.session.id}`); drawConsolidation(); $('#summary').scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      if (e.status === 409) { toast(e.message, true); sess = await api(`/api/r/${T}/session/${sess.session.id}`); drawConsolidation(); return; }
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
      ${lv.suggestion ? (lv.suggestion.value != null && lv.suggestion.value !== '' && !(Array.isArray(lv.suggestion.value) && !lv.suggestion.value.length) ? `<div class="fact">Dalla scheda pre-sessione: «${esc(Array.isArray(lv.suggestion.value) ? lv.suggestion.value.join(', ') : lv.suggestion.value)}» → indica <b>${f.level}${esc(lv.suggestion.maps || '')}</b></div>` : '<div class="fact">Il dato per questa sotto-opzione non è nella scheda pre-sessione.</div>') : ''}
      <div class="subchoice" role="group" aria-label="Sotto-opzione ${esc(it.itemId)}" ${dis}>${subs.map((x) => `<button type="button" class="level ${f.sub === x.key ? 'sel' : ''}" data-s="${x.key}" aria-pressed="${f.sub === x.key}" ${editable ? '' : 'disabled'}><span class="n" aria-hidden="true">${f.level}${x.key}</span><span><span class="sr-only">Opzione ${f.level}${x.key}: </span>${esc(x.text)}</span></button>`).join('')}</div>
      <p class="small muted">Se non ci sono evidenze sufficienti per un'opzione superiore, vale la prima opzione del livello.</p>` : f.level ? '<p class="small muted">Il livello scelto non ha sotto-opzioni.</p>' : ''}`}`;
  if (!editable) return;
  const refocus = (sel) => { const el = host.querySelector(sel); if (el) el.focus({ preventScroll: true }); };
  $$('[data-l]', host).forEach((b) => b.onclick = () => { f.level = Number(b.dataset.l); f.sub = null; drawItem(it, editable); saveDraftSoon(); refocus(`[data-l="${f.level}"]`); });
  $$('[data-s]', host).forEach((b) => b.onclick = () => { f.sub = b.dataset.s; drawItem(it, editable); saveDraftSoon(); refocus(`[data-s="${f.sub}"]`); });
  const r = $('[data-reason]', host); if (r) r.oninput = () => { f.overrideReason = r.value; saveDraftSoon(); };
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
      await api(`/api/r/${T}/session/${sess.session.id}/commitment`, { method: 'PUT', body: {
        priority_item: $('#c_item').value, action: $('#c_action').value, owner: $('#c_owner').value, due_date: $('#c_due').value,
        kpi: $('#c_kpi').value, peer_interest: $('#c_peer').checked, peer_note: $('#c_peernote').value } });
      toast('Commitment salvato');
    } catch (e) { toast(e.message, true); }
  };
}

boot();
