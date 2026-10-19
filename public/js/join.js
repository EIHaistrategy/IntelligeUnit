import { api, esc, $, $$, toast, poll, distBars, confTag, phaseChips } from './ui.js';

const code = location.pathname.split('/').pop();
const preCompany = new URLSearchParams(location.search).get('c');
const KEY = `aito_p_${code}`;
const app = $('#app');
let tok = null; try { tok = localStorage.getItem(KEY); } catch { /* storage non disponibile */ }
let state = null;
let step = 0;
let lastPhase = null;

function saveTok(t) { tok = t; try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* */ } }

async function start() {
  if (tok) {
    try { state = await api(`/api/p/${tok}`); return renderPhase(); }
    catch (e) { if (e.status === 403) { saveTok(null); app.innerHTML = `<div class="card"><p>${esc(e.message)}</p><button onclick="location.reload()">Registrati di nuovo</button></div>`; return; } saveTok(null); }
  }
  renderJoin();
}

async function renderJoin() {
  let info;
  try { info = await api(`/api/join/${code}`); } catch (e) { app.innerHTML = `<div class="card"><h2>Sessione non trovata</h2><p>${esc(e.message)}</p></div>`; return; }
  $('#sesstitle').textContent = info.session.title;
  const pre = info.companies.find((c) => c.code === preCompany);
  app.innerHTML = `
    <div class="card">
      <h1>${esc(info.session.title)}</h1>
      <p class="ink2">AI Transformation &amp; Adoption Map · fase individuale (10 minuti). Rispondi solo sui temi che conosci: se non hai visibilità su un punto scegli <b>N.D.</b></p>
      <label class="f">Azienda</label>
      ${pre ? `<div class="tag navy" style="font-size:.9rem;padding:6px 12px">${esc(pre.name)}</div><input type="hidden" id="company" value="${pre.id}">`
        : `<select id="company"><option value="">— Seleziona la tua azienda —</option>${info.companies.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>`}
      <label class="f">Nome e cognome</label><input type="text" id="name" autocomplete="name">
      <label class="f">Funzione</label>
      <select id="func"><option value="">— Seleziona —</option>${info.functions.map((f) => `<option value="${f.id}">${esc(f.label)}</option>`).join('')}</select>
      <label class="f">Email (facoltativa)</label><input type="email" id="email" autocomplete="email">
      <p class="small muted" style="margin-top:12px">Le tue risposte individuali sono visibili solo a ELIS. I colleghi della tua azienda le vedono in forma anonima, aggregate, durante il confronto. Nel benchmark entra solo il valore consolidato dell'azienda.</p>
      <button class="big" id="go">Entra</button>
    </div>`;
  $('#go').onclick = async () => {
    try {
      const r = await api(`/api/join/${code}`, { method: 'POST', body: { companyId: Number($('#company').value), name: $('#name').value, func: $('#func').value, email: $('#email').value } });
      saveTok(r.token); state = await api(`/api/p/${tok}`); renderPhase();
    } catch (e) { toast(e.message, true); }
  };
}

function header() {
  return `<div class="row between" style="margin-bottom:10px"><div><b>${esc(state.company)}</b> <span class="muted small">· ${esc(state.participant.name)}</span></div></div>${phaseChips(state.session.phase)}<div style="height:12px"></div>`;
}

function renderPhase() {
  $('#sesstitle').textContent = state.session.title;
  lastPhase = state.session.phase;
  const ph = state.session.phase;
  if (ph === 'preparazione') {
    app.innerHTML = `${header()}<div class="card"><h2>Registrazione completata</h2><p>Attendi che il facilitatore apra la fase individuale. La pagina si aggiorna da sola.</p></div>`;
  } else if (ph === 'individuale') {
    renderIndividual();
  } else {
    renderComparison();
  }
}

// ---------- Fase individuale ----------
const totalSteps = () => state.items.length + 2; // item + confronti + riepilogo

function renderIndividual() {
  const n = state.items.length;
  const bar = `<div class="stepper">${Array.from({ length: totalSteps() }, (_, i) => `<span class="${i < step ? 'done' : i === step ? 'on' : ''}"></span>`).join('')}</div>`;
  if (state.participant.submitted_at && step === 0 && !renderIndividual.reopened) step = totalSteps() - 1;
  if (step < n) {
    const it = state.items[step];
    const cur = state.answered.includes(it.id) ? state.answers[it.id] : undefined;
    app.innerHTML = `${header()}${bar}
      <div class="card">
        <div class="muted small">Item ${step + 1} di ${n} · ${esc(it.id)}</div>
        <h2>${esc(it.title)}</h2>
        <p class="ink2"><i>${esc(it.statement)}</i></p>
        ${it.help ? `<p class="small muted">${esc(it.help)}</p>` : ''}
        <p class="small">Scegli il livello che descrive meglio la situazione <b>praticata oggi</b> (ciò che è solo pianificato non conta).</p>
        <div class="levels">
          ${it.levels.map((l) => `<div role="button" tabindex="0" class="level ${cur === l.level ? 'sel' : ''}" data-l="${l.level}"><span class="n">${l.level}</span><span>${esc(l.descriptor)}
            ${l.sub ? `<details class="subs" onclick="event.stopPropagation()"><summary class="small muted">Sotto-opzioni (si scelgono nel consolidamento)</summary>${l.sub.map((s) => `<div><b>${l.level}${s.key}</b> — ${esc(s.text)}</div>`).join('')}</details>` : ''}</span></div>`).join('')}
          <div role="button" tabindex="0" class="level nd ${cur === null ? 'sel' : ''}" data-l="nd">N.D. — non ho sufficiente visibilità</div>
        </div>
      </div>
      <div class="sticky-foot"><button class="ghost" id="prev" ${step === 0 ? 'disabled' : ''}>Indietro</button><button id="next" ${cur === undefined ? 'disabled' : ''}>Avanti</button></div>`;
    $$('.level').forEach((b) => b.onclick = async () => {
      const level = b.dataset.l === 'nd' ? null : Number(b.dataset.l);
      try {
        await api(`/api/p/${tok}/answer`, { method: 'PUT', body: { itemId: it.id, level } });
        state.answers[it.id] = level; if (!state.answered.includes(it.id)) state.answered.push(it.id);
        $$('.level').forEach((x) => x.classList.toggle('sel', x === b)); $('#next').disabled = false;
      } catch (e) { toast(e.message, true); refresh(); }
    });
  } else if (step === n) {
    app.innerHTML = `${header()}${bar}<div class="card"><h2>Confronti a coppie</h2>
      <p class="small ink2">Domande secche: un giudizio relativo tra due capacità della stessa sessione.</p>
      ${state.pairs.map(([a, b]) => {
        const A = state.items.find((x) => x.id === a), B = state.items.find((x) => x.id === b);
        const cur = state.pairAnswers.find((x) => x.item_a === a && x.item_b === b)?.answer;
        const qtext = state.pairQuestion.replace('{a}', `<b>${esc(A.title.toLowerCase())}</b>`).replace('{b}', `<b>${esc(B.title.toLowerCase())}</b>`);
        return `<div class="card flat"><p>${qtext}</p><div class="levels" data-pair="${a}|${b}">
          <button class="level ${cur === 'A' ? 'sel' : ''}" data-v="A"><span class="n">${esc(a)}</span><span>${esc(A.title)}</span></button>
          <button class="level ${cur === 'B' ? 'sel' : ''}" data-v="B"><span class="n">${esc(b)}</span><span>${esc(B.title)}</span></button>
          <button class="level nd ${cur === 'ND' ? 'sel' : ''}" data-v="ND">N.D. — non ho sufficiente visibilità</button></div></div>`;
      }).join('')}</div>
      <div class="sticky-foot"><button class="ghost" id="prev">Indietro</button><button id="next">Avanti</button></div>`;
    $$('[data-pair]').forEach((g) => $$('.level', g).forEach((b) => b.onclick = async () => {
      const [a, bb] = g.dataset.pair.split('|');
      try {
        await api(`/api/p/${tok}/pair`, { method: 'PUT', body: { a, b: bb, answer: b.dataset.v } });
        const ex = state.pairAnswers.find((x) => x.item_a === a && x.item_b === bb);
        if (ex) ex.answer = b.dataset.v; else state.pairAnswers.push({ item_a: a, item_b: bb, answer: b.dataset.v });
        $$('.level', g).forEach((x) => x.classList.toggle('sel', x === b));
      } catch (e) { toast(e.message, true); refresh(); }
    }));
  } else {
    const missing = state.items.filter((i) => !state.answered.includes(i.id)).length + state.pairs.filter(([a, b]) => !state.pairAnswers.some((x) => x.item_a === a && x.item_b === b)).length;
    app.innerHTML = `${header()}${bar}<div class="card"><h2>Riepilogo</h2>
      <table><tbody>${state.items.map((i) => `<tr><td>${esc(i.id)} ${esc(i.title)}</td><td class="num"><b>${state.answered.includes(i.id) ? (state.answers[i.id] ?? 'N.D.') : '—'}</b></td></tr>`).join('')}
      ${state.pairs.map(([a, b]) => { const v = state.pairAnswers.find((x) => x.item_a === a && x.item_b === b)?.answer; return `<tr><td>Più avanti: ${esc(a)} o ${esc(b)}?</td><td class="num"><b>${v === 'A' ? a : v === 'B' ? b : v === 'ND' ? 'N.D.' : '—'}</b></td></tr>`; }).join('')}</tbody></table>
      ${state.participant.submitted_at ? '<div class="banner ok" style="margin-top:12px">Risposte inviate. Puoi ancora modificarle finché la fase individuale è aperta.</div>' : ''}
      ${missing ? `<div class="banner warn" style="margin-top:12px">Mancano ${missing} risposte.</div>` : ''}</div>
      <div class="sticky-foot"><button class="ghost" id="prev">Modifica</button><button id="submit" ${missing ? 'disabled' : ''}>${state.participant.submitted_at ? 'Invia di nuovo' : 'Invia le risposte'}</button></div>`;
    const s = $('#submit');
    if (s) s.onclick = async () => {
      try { await api(`/api/p/${tok}/submit`, { method: 'POST' }); state.participant.submitted_at = new Date().toISOString(); toast('Risposte inviate'); renderIndividual(); }
      catch (e) { toast(e.message, true); }
    };
  }
  const prev = $('#prev'), next = $('#next');
  if (prev) prev.onclick = () => { renderIndividual.reopened = true; step = step === totalSteps() - 1 && state.participant.submitted_at ? 0 : Math.max(0, step - 1); renderIndividual(); scrollTo(0, 0); };
  if (next) next.onclick = () => { step = Math.min(totalSteps() - 1, step + 1); renderIndividual(); scrollTo(0, 0); };
}

// ---------- Confronto (vista anonima) ----------
function renderComparison() {
  const c = state.comparison;
  const msg = { confronto: 'Confronto in corso: guardate dove le risposte divergono e quali evidenze le sostengono.',
    consolidamento: 'Il referente sta registrando la posizione ufficiale dell\'azienda.', chiusa: 'Sessione chiusa. Grazie per la partecipazione.' }[state.session.phase];
  app.innerHTML = `${header()}<div class="banner info">${msg}</div>
    <div class="card"><h2>Le risposte della vostra azienda</h2><p class="small muted">Vista anonima: ${c.participants} partecipanti, ${c.submitted} hanno inviato. Funzioni presenti: ${c.functions.length}.</p></div>
    ${c.items.map((it) => `<div class="card"><div class="row between"><h3>${esc(it.itemId)} · ${esc(it.title)}</h3>${confTag(it.confidence)}</div>
      ${distBars(it.summary)}
      <p class="small" style="margin-top:8px">Mediana: <b>${it.summary.median ?? '—'}</b> · Range: <b>${it.summary.range ?? '—'}</b> · N.D.: <b>${it.summary.nd}</b></p>
      ${it.summary.divergent ? '<div class="banner warn">Divergenza di due o più livelli: discussione necessaria.</div>' : ''}</div>`).join('')}
    <div class="card"><h3>Confronti a coppie</h3>${c.pairs.map((p) => `<p><b>${esc(p.a)}</b> ${p.counts.A} · <b>${esc(p.b)}</b> ${p.counts.B} · N.D. ${p.counts.ND}
      ${p.discordant ? `<br><span class="tag risk">${p.discordant} ${p.discordant === 1 ? 'risposta' : 'risposte'} in contrasto con i livelli scelti dalla stessa persona</span>` : ''}</p>`).join('')}</div>`;
}

async function refresh() {
  if (!tok) return;
  const s = await api(`/api/p/${tok}`);
  const changed = s.session.phase !== lastPhase;
  state = s;
  if (changed) { step = 0; renderIndividual.reopened = false; renderPhase(); }
  else if (s.session.phase !== 'individuale' && s.session.phase !== 'preparazione') renderComparison();
}

start().then(() => poll(async () => { if (tok && state) await refresh(); }, 4000));
