import { api, esc, $, $$, toast, poll, phaseChips, PHASES, qrImg, fmtDate, fmtScore, levelLabel } from './ui.js';

const app = $('#app');
let INST, SC, NET;
let stopPoll = null;

async function boot() {
  const me = await api('/api/admin/me');
  if (!me.admin) return login();
  const i = await api('/api/instrument'); INST = i.instrument; SC = i.scoring;
  NET = await api('/api/admin/network');
  $('#logout').onclick = async () => { await api('/api/admin/logout', { method: 'POST' }); location.reload(); };
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

function route() {
  if (stopPoll) { stopPoll(); stopPoll = null; }
  const [, view = 'sessioni', arg] = location.hash.split('/');
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.v === view || (view === 'sessione' && a.dataset.v === 'sessioni') || (view === 'azienda' && a.dataset.v === 'aziende')));
  ({ sessioni: viewSessions, sessione: viewControl, aziende: viewCompanies, azienda: viewCompany, benchmark: viewBenchmark,
    audit: viewAudit, impostazioni: viewSettings, qr: viewQr, tavolo: viewTableCard, tavoli: viewTables, mappe: viewMaps }[view] || viewSessions)(arg);
}

// ---------- Sessioni ----------
async function viewSessions() {
  const ss = await api('/api/admin/sessions');
  app.innerHTML = `<h1>Sessioni</h1>
    ${NET.baseUrl.includes('localhost') ? '<div class="banner risk">Non è stato trovato un indirizzo di rete: i telefoni non potranno collegarsi. Verifica il Wi-Fi in Impostazioni.</div>' : ''}
    <div class="grid c2">${ss.map((s) => `<div class="card sesscard"><div class="row between" style="align-items:flex-start"><div><h2 style="margin:0">${esc(s.title)}</h2>
      <p class="small muted" style="margin:4px 0 0">Item ${esc(INST.sessions.find((x) => x.id === s.base).items.join(', '))} · codice <span class="mono">${esc(s.code)}</span> · ${esc(s.channel)}</p></div>${s.mode === 'adhoc' ? '<span class="tag gold">ad hoc</span>' : ''}</div>
      <div style="margin:18px 0 12px">${phaseChips(s.phase)}</div><p class="small ink2" style="margin:0 0 14px"><b>${esc(nextStepText(s.phase))}</b></p><a class="btn sm" href="#/sessione/${s.id}">Apri la control room</a></div>`).join('')}</div>
    <div class="card"><h2>Sessione ad hoc</h2><p class="small ink2">Per un'azienda assente: stesso flusso, stessi descrittori e stessa versione; la modalità viene registrata e i dati entrano nella versione successiva del benchmark (§6.3).</p>
      <div class="grid c3"><div><label class="f">Sessione di riferimento</label><select id="ah_base">${INST.sessions.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
      <div><label class="f">Data</label><input type="date" id="ah_date"></div>
      <div><label class="f">Canale</label><select id="ah_ch"><option value="presenza">In presenza</option><option value="remoto">Da remoto</option></select></div></div>
      <div style="margin-top:12px"><button id="ah_go">Crea sessione ad hoc</button></div></div>`;
  $('#ah_go').onclick = async () => {
    try { const r = await api('/api/admin/sessions', { method: 'POST', body: { base: $('#ah_base').value, date: $('#ah_date').value, channel: $('#ah_ch').value } }); location.hash = `#/sessione/${r.id}`; }
    catch (e) { toast(e.message, true); }
  };
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

async function viewControl(id) {
  let C = await api(`/api/admin/sessions/${id}/control`);
  let sel = null;          // passo mostrato nel pannello
  let confirming = false;  // conferma del passaggio di fase aperta
  const names = (list, max = 4) => list.slice(0, max).map((c) => esc(c.name)).join(', ') + (list.length > max ? ` e altre ${list.length - max}` : '');
  const meter = (a, b, label) => `<div class="meter"><div class="meter-top"><b>${a}</b><span> di ${b} ${label}</span></div><div class="meter-bar"><i style="width:${b ? Math.round((a / b) * 100) : 0}%"></i></div></div>`;
  const ck = (kind, html) => `<li class="ck ${kind}"><span aria-hidden="true">${kind === 'ok' ? '✓' : kind === 'warn' ? '!' : 'i'}</span><div>${html}</div></li>`;

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
      if (f.id === 'benchmark') return benchDone ? 'done' : idx >= 3 ? 'now' : 'todo';
      if (f.id === 'report') return consolidated.length && released.length === consolidated.length ? 'done' : idx >= 3 && consolidated.length ? 'now' : 'todo';
      return released.length && called.length === released.length ? 'done' : released.length ? 'now' : 'todo';
    };
    const summary = {
      preparazione: `${withRef.length} di ${cos.length} aziende con referente · ${withRef.filter((c) => c.presession).length} schede`,
      individuale: totP ? `${totS} di ${totP} hanno inviato` : 'nessun partecipante ancora',
      confronto: `${inRoom.length} ${inRoom.length === 1 ? 'azienda' : 'aziende'} al tavolo`,
      consolidamento: `${consolidated.length} di ${inRoom.length || consolidated.length} consolidate`,
      benchmark: frozen ? `${frozen.label} · N=${frozen.n_companies}${benchDone ? '' : ' · da aggiornare'}` : 'non ancora congelato',
      report: `${released.length} di ${consolidated.length} rilasciati`,
      call: `${called.length} di ${released.length} annotate`,
    };
    if (!sel) {
      sel = idx < 4 ? FLOW[idx].id : (FLOW.slice(4).find((f) => state(f) !== 'done') || FLOW[6]).id;
    }
    const f = FLOW.find((x) => x.id === sel);
    const st = state(f);
    const mins = C.phaseSince ? Math.max(0, Math.round((Date.now() - new Date(C.phaseSince.replace(' ', 'T') + 'Z')) / 60000)) : null;
    const chip = st === 'done' ? '<span class="tag ok">Completato</span>'
      : st === 'now' ? `<span class="tag gold">${f.phase ? `In corso${mins != null ? ` da ${mins} min` : ''}${f.minutes ? ` · previsti ${f.minutes}` : ''}` : 'Da fare ora'}</span>`
      : '<span class="tag">Più avanti</span>';

    // ---- contenuto del pannello
    let what = '', checks = [], extra = '';
    if (f.id === 'preparazione') {
      what = 'Una settimana prima i referenti compilano la scheda pre-sessione con i dati fattuali. In sala i partecipanti si registrano con il QR, ma vedono le domande solo quando apri le risposte individuali.';
      const noRef = cos.filter((c) => !c.referents.length), noPre = withRef.filter((c) => !c.presession);
      checks.push(noRef.length ? ck('warn', `${noRef.length} ${noRef.length === 1 ? 'azienda' : 'aziende'} senza referente: ${names(noRef)}. <a href="#/aziende">Aggiungi i referenti</a>`) : ck('ok', `Tutte le ${cos.length} aziende hanno un referente`));
      checks.push(noPre.length ? ck('warn', `Schede pre-sessione compilate: ${withRef.length - noPre.length} di ${withRef.length}. Mancano: ${names(noPre)}`) : ck('ok', 'Tutte le schede pre-sessione sono compilate'));
      checks.push(ck('info', `Partecipanti già registrati: <b>${totP}</b>`));
      extra = `<div class="fp-qr">${qrImg(C.joinUrl, 150)}<div><h4>QR di sala e cartoncini</h4><p class="small mono" style="word-break:break-all">${esc(C.joinUrl)}</p>
        <div class="row"><a class="btn sm" href="#/qr/${s.id}">QR a schermo intero</a><a class="btn sm ghost" href="#/tavoli/${s.id}">Stampa i cartoncini dei tavoli</a></div></div></div>`;
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
    if (f.phase === s.phase && nx) {
      const warnNow = s.phase === 'individuale' && totP > totS ? `<p class="small" style="color:var(--warn)">${totP - totS === 1 ? 'Un partecipante non ha' : `${totP - totS} partecipanti non hanno`} ancora premuto Invia: le risposte già date verranno considerate così come sono.</p>`
        : s.phase === 'consolidamento' && inRoom.some((c) => !c.consolidated_at) ? `<p class="small" style="color:var(--warn)">Alcune aziende non hanno consolidato: dopo la chiusura dovrai riaprire il consolidamento o correggere da ELIS.</p>` : '';
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

    let group = '';
    app.innerHTML = `<a class="back" href="#/sessioni">← Sessioni</a>
      <div class="pagehead"><div><h1>${esc(s.title)}</h1><p class="small">${esc(C.def.items.map((i) => `${i} ${INST.items[i].title}`).join(' · '))} · codice <span class="mono">${esc(s.code)}</span></p></div>
        <div class="row"><a class="btn sm ghost" href="/live/${s.id}" target="_blank">Dashboard live</a><a class="btn sm ghost" href="/mappe/${s.base}" target="_blank">Mappe a quadranti</a><a class="btn sm ghost" href="#/qr/${s.id}">QR di sala</a></div></div>
      <div class="flow">
        <nav class="flowsteps" aria-label="Passi della sessione">${FLOW.map((x, i) => {
          const g = x.group !== group ? `<div class="fgroup">${esc((group = x.group))}</div>` : '';
          const stx = state(x);
          return `${g}<button type="button" class="fstep ${stx} ${x.id === sel ? 'sel' : ''}" data-step="${x.id}" ${x.id === sel ? 'aria-current="step"' : ''}>
            <span class="fnum" aria-hidden="true">${stx === 'done' ? '✓' : i + 1}</span><span class="ftxt"><b>${esc(x.title)}</b><small>${summary[x.id]}</small></span>
            <span class="sr-only">${stx === 'done' ? 'completato' : stx === 'now' ? 'in corso' : 'più avanti'}</span></button>`;
        }).join('')}</nav>
        <section class="card flowpanel" aria-live="polite">
          <div class="fp-head"><div><div class="small muted">${esc(f.group)} · passo ${FLOW.indexOf(f) + 1} di ${FLOW.length}</div><h2>${esc(f.title)}</h2></div>${chip}</div>
          <p class="lede">${what}</p>
          ${checks.length ? `<ul class="checks">${checks.join('')}</ul>` : ''}
          ${extra}
          ${action}${back}
        </section>
      </div>
      <div class="card"><h2>Aziende in questa sessione</h2><div class="tablewrap"><table>
        <thead><tr><th>Azienda</th><th>Scheda</th><th class="num">Partecipanti</th><th>Risposte</th><th>Funzioni</th><th>Consolidato</th><th>Commitment</th><th>Report</th><th>Tavolo</th></tr></thead>
        <tbody>${cos.filter((c) => c.participants || c.consolidated_at || c.presession).map(row).join('') || '<tr><td colspan="9" class="muted">Nessuna azienda ancora attiva in questa sessione.</td></tr>'}</tbody></table></div>
        ${cos.some((c) => !(c.participants || c.consolidated_at || c.presession)) ? `<details style="margin-top:10px"><summary class="small">Altre aziende censite (${cos.filter((c) => !(c.participants || c.consolidated_at || c.presession)).length})</summary><table><tbody>${cos.filter((c) => !(c.participants || c.consolidated_at || c.presession)).map(row).join('')}</tbody></table></details>` : ''}</div>`;

    const reload = async () => { C = await api(`/api/admin/sessions/${id}/control`); draw(); };
    $$('[data-step]').forEach((b) => b.onclick = () => { sel = b.dataset.step; confirming = false; draw(); $('.flowpanel h2')?.focus?.(); });
    $$('[data-goto]').forEach((b) => b.onclick = () => { sel = b.dataset.goto; draw(); });
    if ($('#nextphase')) $('#nextphase').onclick = () => { confirming = true; draw(); $('#yes')?.focus(); };
    if ($('#no')) $('#no').onclick = () => { confirming = false; draw(); };
    if ($('#yes')) $('#yes').onclick = async () => {
      try { await api(`/api/admin/sessions/${s.id}/phase`, { method: 'PUT', body: { phase: nx.to } }); confirming = false; sel = null; toast('Fase aggiornata'); await reload(); }
      catch (e) { toast(e.message, true); }
    };
    if ($('#goback')) $('#goback').onclick = async () => {
      const reason = $('#backreason').value.trim();
      if (!reason) { toast('Indica il motivo per tornare indietro', true); $('#backreason').focus(); return; }
      try { await api(`/api/admin/sessions/${s.id}/phase`, { method: 'PUT', body: { phase: prev.id, reason } }); sel = null; toast(`Tornati a: ${prev.label}`); await reload(); }
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
    $$('[data-release]').forEach((b) => b.onclick = async () => {
      if (!confirm('Rilasciare il report? Viene salvata una copia che l\'azienda vede da ora in poi e che non cambierà più.')) return;
      b.disabled = true;
      const url = `/api/admin/sessions/${s.id}/companies/${b.dataset.release}/release`;
      try { await api(url, { method: 'POST', body: {} }); toast('Report rilasciato'); }
      catch (e) {
        if (e.status === 409 && confirm(`${e.message}\n\nRilasciare comunque, senza confronto con il benchmark?`)) {
          try { await api(url, { method: 'POST', body: { withoutBenchmark: true } }); toast('Report rilasciato'); } catch (e2) { toast(e2.message, true); }
        } else if (e.status !== 409) toast(e.message, true);
      }
      await reload();
    });
    $$('[data-note]').forEach((b) => b.onclick = async () => {
      const c = C.companies.find((x) => x.id === Number(b.dataset.note));
      const note = prompt(`Esito della call con il leader: ${c.name}`, c.leader_call_note || '');
      if (note == null) return;
      await api(`/api/admin/sessions/${s.id}/companies/${c.id}/note`, { method: 'PUT', body: { note } }); await reload();
    });
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
    <td class="small"><a href="#/tavolo/${C.session.id}:${c.id}">QR tavolo</a>${c.leader_call_note ? '<br><span class="tag ok">call ✓</span>' : ''}</td></tr>`;
  draw();
  stopPoll = poll(async () => {
    const n = await api(`/api/admin/sessions/${id}/control`);
    if (JSON.stringify(n) !== JSON.stringify(C)) { C = n; const a = document.activeElement; if (!confirming && (!a || a === document.body || a.dataset?.step)) draw(); }
  }, 4000);
}

// Tutti i cartoncini dei tavoli di una sessione, da stampare in una volta
async function viewTables(sid) {
  const C = await api(`/api/admin/sessions/${sid}/control`);
  const cs = C.companies.filter((c) => c.kind !== 'DEMO');
  app.innerHTML = `<p class="noprint"><a class="back" href="#/sessione/${sid}">← Control room</a></p>
    <div class="row noprint" style="margin-bottom:16px"><button onclick="print()">Stampa ${cs.length} cartoncini</button><span class="small muted">Un cartoncino per azienda: il QR porta direttamente alla registrazione con l'azienda già scelta.</span></div>
    <div class="tablecards">${cs.map((c) => { const url = `${C.joinUrl}?c=${c.joinCode}`; return `<div class="tablecard"><div class="small muted">AITO · ${esc(C.session.title)}</div><h2>${esc(c.name)}</h2>${qrImg(url, 220)}
      <p>Codice azienda: <b class="mono" style="font-size:1.5rem;letter-spacing:.2em">${esc(c.joinCode)}</b></p><p class="small">Inquadra il QR: l'azienda è già selezionata.</p></div>`; }).join('')}</div>`;
}

async function viewQr(id) {
  const C = await api(`/api/admin/sessions/${id}/control`);
  app.innerHTML = `<div class="qrfull"><div><h1>${esc(C.session.title)}</h1>
    <p style="font-size:1.2rem">Inquadra il QR, scegli la tua azienda e rispondi.<br><span class="muted">Il telefono deve essere sulla stessa rete Wi-Fi.</span></p>
    <div style="margin:18px auto">${qrImg(C.joinUrl, 420)}</div><div class="url">${esc(C.joinUrl)}</div>
    <p><a href="#/sessione/${id}">chiudi</a></p></div></div>`;
}

async function viewTableCard(arg) {
  const [sid, cid] = arg.split(':').map(Number);
  const C = await api(`/api/admin/sessions/${sid}/control`);
  const c = C.companies.find((x) => x.id === cid);
  const url = `${C.joinUrl}?c=${c.joinCode}`;
  app.innerHTML = `<p class="noprint"><a href="#/sessione/${sid}">← Control room</a> · <button class="sm" onclick="print()">Stampa</button></p>
    <div class="tablecard"><div class="small muted">AITO · ${esc(C.session.title)}</div><h2>${esc(c.name)}</h2>${qrImg(url, 260)}
    <p>Codice azienda: <b class="mono" style="font-size:1.6rem;letter-spacing:.2em">${esc(c.joinCode)}</b></p><p class="small mono" style="word-break:break-all">${esc(url)}</p>
    <p class="small">Inquadra il QR: l'azienda è già selezionata. Con il QR della sala, inserisci il codice.</p></div>`;
}

// ---------- Aziende ----------
async function viewCompanies() {
  const cs = await api('/api/admin/companies');
  app.innerHTML = `<h1>Aziende</h1>
    <div class="card"><h2>Nuova azienda</h2><div class="grid c4">
      <div><label class="f">Nome *</label><input type="text" id="n_name"></div>
      <div><label class="f">Perimetro valutato</label><input type="text" id="n_per" placeholder="gruppo, società o BU"></div>
      <div><label class="f">Settore</label><input type="text" id="n_sec"></div>
      <div><label class="f">Tipo</label><select id="n_kind"><option value="REALE">REALE</option><option value="TEST">TEST (prova, fuori benchmark)</option></select></div></div>
      <div style="margin-top:12px"><button id="n_go">Aggiungi</button></div></div>
    <div class="card"><div class="tablewrap"><table><thead><tr><th>Azienda</th><th>Tipo</th><th>Perimetro</th><th>Consensi</th><th>Referenti</th><th></th></tr></thead><tbody>
      ${cs.map((c) => `<tr><td><b>${esc(c.name)}</b></td><td><span class="tag ${c.kind === 'REALE' ? 'ok' : 'warn'}">${esc(c.kind)}</span></td><td class="small">${esc(c.perimeter)}</td>
        <td class="small"><div class="consents">${['benchmark', 'peer', 'testimonianza', 'followup'].map((k) => `<span class="${c.consents[k]?.granted ? 'yes' : ''}">${c.consents[k]?.granted ? '✓' : '–'} ${k}</span>`).join('')}</div></td>
        <td class="small">${c.referents.map((r) => esc(r.name)).join('<br>') || '—'}</td><td><a class="btn sm" href="#/azienda/${c.id}">Apri</a></td></tr>`).join('')}
    </tbody></table></div></div>`;
  $('#n_go').onclick = async () => {
    try { const r = await api('/api/admin/companies', { method: 'POST', body: { name: $('#n_name').value, perimeter: $('#n_per').value, sector: $('#n_sec').value, kind: $('#n_kind').value } }); location.hash = `#/azienda/${r.id}`; }
    catch (e) { toast(e.message, true); }
  };
}

async function viewCompany(id) {
  const cs = await api('/api/admin/companies');
  const c = cs.find((x) => x.id === Number(id));
  const R = await api(`/api/admin/report/${id}`);
  app.innerHTML = `<a class="back" href="#/aziende">← Aziende</a>
    <div class="card"><h1>${esc(c.name)}</h1><div class="grid c4">
      <div><label class="f">Nome</label><input type="text" id="e_name" value="${esc(c.name)}"></div>
      <div><label class="f">Perimetro</label><input type="text" id="e_per" value="${esc(c.perimeter)}"></div>
      <div><label class="f">Settore</label><input type="text" id="e_sec" value="${esc(c.sector)}"></div>
      <div><label class="f">Tipo</label><select id="e_kind">${(c.kind === 'DEMO' ? ['DEMO'] : ['REALE', 'TEST']).map((k) => `<option ${c.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div></div>
      <div style="margin-top:12px"><button id="e_save">Salva</button></div></div>
    <div class="grid c2">
      <div class="card"><h2>Consensi</h2><p class="small muted">Distinti e revocabili (§16). Senza consenso al benchmark l'azienda riceve comunque il proprio report ma non entra nelle distribuzioni.</p>
        ${['benchmark', 'peer', 'testimonianza', 'followup'].map((k) => `<label class="check"><input type="checkbox" data-consent="${k}" ${c.consents[k]?.granted ? 'checked' : ''}> ${{ benchmark: 'Benchmark anonimo', peer: 'Peer matching', testimonianza: 'Testimonianza', followup: 'Follow-up' }[k]} <span class="small muted">${c.consents[k] ? fmtDate(c.consents[k].at) : ''}</span></label>`).join('')}</div>
      <div class="card"><h2>Referenti</h2>
        ${c.referents.map((r) => `<div class="card flat"><div class="row between"><b>${esc(r.name)}</b><div class="row"><button class="sm ghost" data-regen="${r.id}" title="Disattiva il link attuale e ne crea uno nuovo">Rigenera link</button><button class="sm danger" data-delref="${r.id}">Elimina</button></div></div>
          <div class="small muted">${esc(r.role || '')} ${esc(r.email || '')}</div>
          <div class="row" style="margin-top:6px"><input type="text" readonly value="${esc(NET.baseUrl)}/r/${esc(r.token)}" class="mono small"><button class="sm ghost" data-copy="${esc(NET.baseUrl)}/r/${esc(r.token)}">Copia link</button></div>
          <details><summary class="small">QR del link referente</summary>${qrImg(`${NET.baseUrl}/r/${r.token}`, 160)}</details></div>`).join('') || '<p class="muted">Nessun referente.</p>'}
        <div class="grid c3"><input type="text" id="r_name" placeholder="Nome e cognome"><input type="text" id="r_role" placeholder="Ruolo"><input type="email" id="r_email" placeholder="Email"></div>
        <div style="margin-top:8px"><button class="sm" id="r_add">Aggiungi referente</button></div>
        <p class="small muted">Il link è personale: chi lo possiede compila la scheda e consolida per l'azienda. Funziona sulla rete locale del computer ELIS.</p></div>
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
  $('#e_save').onclick = async () => { try { await api(`/api/admin/companies/${id}`, { method: 'PUT', body: { name: $('#e_name').value, perimeter: $('#e_per').value, sector: $('#e_sec').value, kind: $('#e_kind').value } }); toast('Salvato'); } catch (e) { toast(e.message, true); } };
  $$('[data-consent]').forEach((b) => b.onchange = async () => {
    const reason = prompt('Riferimento o motivo del cambio di consenso (es. "modulo firmato il 10/11", "revoca via email del 3/12")');
    if (!reason) { b.checked = !b.checked; return; }
    try { await api(`/api/admin/companies/${id}/consent`, { method: 'PUT', body: { type: b.dataset.consent, granted: b.checked, reason } }); toast('Consenso aggiornato'); }
    catch (e) { b.checked = !b.checked; toast(e.message, true); }
  });
  $('#r_add').onclick = async () => { try { await api(`/api/admin/companies/${id}/referents`, { method: 'POST', body: { name: $('#r_name').value, role: $('#r_role').value, email: $('#r_email').value } }); viewCompany(id); } catch (e) { toast(e.message, true); } };
  $$('[data-regen]').forEach((b) => b.onclick = async () => { if (confirm('Il link attuale smetterà di funzionare. Creare un nuovo link per questo referente?')) { await api(`/api/admin/referents/${b.dataset.regen}/regenerate`, { method: 'POST', body: {} }); viewCompany(id); } });
  $$('[data-delref]').forEach((b) => b.onclick = async () => { if (confirm('Eliminare il referente? Il suo link smetterà di funzionare.')) { await api(`/api/admin/referents/${b.dataset.delref}`, { method: 'DELETE' }); viewCompany(id); } });
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
    <p class="lede" style="margin-bottom:20px">Una pagina per sessione con le tre mappe della nota (§10.2–10.4): dove intervenire, se il bisogno è individuale o condiviso, con chi accelerare. Usano l'ultima versione congelata del benchmark; l'anteprima usa anche i dati dimostrativi. I nomi delle aziende sono nascosti finché non li mostri.</p>
    <div class="grid c2">${INST.sessions.map((s) => { const v = vs.find((x) => x.base === s.id); const dims = s.dimensions.map((d) => INST.dimensions.find((x) => x.id === d));
      return `<div class="card sesscard"><h2 style="margin:0">${esc(s.name)}</h2>
        <p class="small muted" style="margin:4px 0 12px">${dims.map((d) => `${d.id} ${esc(d.name)}`).join(' · ')}</p>
        <p class="small" style="margin:0 0 14px">${v ? `Benchmark: <b>${esc(v.label)}</b>, ${v.n_companies} aziende` : '<span class="muted">Benchmark non ancora congelato: per ora solo anteprima</span>'}</p>
        <div class="row" style="margin-top:auto">${v ? `<a class="btn sm" href="/mappe/${s.id}" target="_blank">Apri le mappe</a>` : ''}<a class="btn sm ghost" href="/mappe/${s.id}?preview=1" target="_blank">Anteprima con dati dimostrativi</a></div></div>`; }).join('')}</div>`;
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
  app.innerHTML = `<h1>Impostazioni</h1>
    <div class="card"><h2>Rete</h2>
      <p>Indirizzo usato nei QR: <b class="mono">${esc(NET.baseUrl)}</b></p>
      <p class="small ink2">I telefoni devono essere sulla stessa rete Wi-Fi di questo computer. Se il computer ha più indirizzi, scegli quello della rete Wi-Fi della sala. Alcune reti aziendali o per ospiti isolano i dispositivi: in quel caso usa l'hotspot del telefono o un router dedicato.</p>
      <table><tbody>${NET.addresses.map((a) => `<tr><td class="mono">http://${esc(a.address)}:${NET.port}</td><td class="small muted">${esc(a.name)}</td><td><button class="sm ghost" data-url="http://${esc(a.address)}:${NET.port}">Usa questo</button></td></tr>`).join('') || '<tr><td class="muted">Nessuna rete trovata</td></tr>'}</tbody></table>
      <div class="row" style="margin-top:10px"><input type="text" id="custom" placeholder="oppure un indirizzo manuale, es. http://192.168.1.20:3000" value="${esc(NET.custom || '')}" style="max-width:420px"><button class="sm" id="savecustom">Salva</button><button class="sm ghost" id="auto">Automatico</button></div></div>
    <div class="card"><h2>Dati dimostrativi</h2><div id="demo"><p class="muted small">…</p></div></div>
    <div class="card"><h2>Dati</h2><p class="small">Database: <span class="mono">${esc(NET.db)}</span>. Per un backup basta copiare la cartella <span class="mono">data</span> a server fermo.</p>
      <a class="btn" href="/api/admin/export.xlsx">Scarica export Excel</a></div>
    <div class="card"><h2>Registrazione dei partecipanti</h2>
      <label class="f" for="o_mode">Come il partecipante indica la sua azienda</label>
      <select id="o_mode" style="max-width:520px"><option value="codice">Con il codice azienda (QR del tavolo o codice comunicato) — consigliato</option><option value="elenco">Scegliendo dall'elenco delle aziende (chiunque abbia il QR di sala vede l'elenco)</option></select>
      <label class="f" for="o_priv">Indirizzo dell'informativa privacy ELIS (https://…)</label>
      <input type="text" id="o_priv" style="max-width:520px" placeholder="https://www.elis.org/...">
      <p class="small muted">Il link compare nella pagina di registrazione, accanto alla spiegazione di chi vede le risposte.</p>
      <button class="sm" id="o_save">Salva</button></div>
    <div class="card"><h2>Password admin</h2><div class="row"><input type="password" id="pw1" placeholder="Nuova password (min. 8)" style="max-width:280px"><button class="sm" id="pwgo">Cambia</button></div></div>
    <div class="card"><h2>Versioni</h2><p class="small">Strumento <b>${esc(INST.version)}</b> (${esc(INST.status)}) · Scoring <b>${esc(SC.version)}</b></p></div>`;
  const D = await api('/api/admin/demo');
  $('#demo').innerHTML = `<p class="small ink2">14 aziende DEMO con valori su tutte e quattro le sessioni e un'azienda vetrina (TEST) con scheda, partecipanti, consolidamento e commitment. Non entrano mai nel benchmark ufficiale: si vedono con l'opzione "anteprima".</p>
    ${D.present ? `<div class="row"><a class="btn sm" href="/live/1?preview=1" target="_blank">Dashboard live (anteprima)</a><a class="btn sm ghost" href="/plenaria/GOV?preview=1" target="_blank">Plenaria (anteprima)</a><a class="btn sm ghost" href="/mappe/GOV?preview=1" target="_blank">Mappe (anteprima)</a>
      ${D.vetrina ? `<a class="btn sm ghost" href="/report/${D.vetrina}?preview=1" target="_blank">Report vetrina</a><a class="btn sm ghost" href="/api/admin/pdf/${D.vetrina}?preview=1">PDF vetrina</a>` : ''}
      <button class="sm danger" id="demo_rm">Rimuovi dati dimostrativi</button></div>` : '<button class="sm" id="demo_add">Carica dati dimostrativi</button>'}`;
  if ($('#demo_add')) $('#demo_add').onclick = async () => { try { await api('/api/admin/demo', { method: 'POST' }); toast('Dati dimostrativi caricati'); viewSettings(); } catch (e) { toast(e.message, true); } };
  if ($('#demo_rm')) $('#demo_rm').onclick = async () => { if (!confirm('Rimuovere tutte le aziende DEMO e l\'azienda vetrina?')) return; await api('/api/admin/demo', { method: 'DELETE' }); toast('Dati dimostrativi rimossi'); viewSettings(); };
  const O = await api('/api/admin/options');
  $('#o_mode').value = O.joinMode; $('#o_priv').value = O.privacyUrl;
  $('#o_save').onclick = async () => { try { await api('/api/admin/options', { method: 'PUT', body: { joinMode: $('#o_mode').value, privacyUrl: $('#o_priv').value } }); toast('Impostazioni salvate'); } catch (e) { toast(e.message, true); } };
  $$('[data-url]').forEach((b) => b.onclick = async () => { await api('/api/admin/network', { method: 'PUT', body: { url: b.dataset.url } }); toast('Indirizzo aggiornato'); viewSettings(); });
  $('#savecustom').onclick = async () => { await api('/api/admin/network', { method: 'PUT', body: { url: $('#custom').value } }); viewSettings(); };
  $('#auto').onclick = async () => { await api('/api/admin/network', { method: 'PUT', body: { url: '' } }); viewSettings(); };
  $('#pwgo').onclick = async () => { try { await api('/api/admin/password', { method: 'PUT', body: { password: $('#pw1').value } }); toast('Password cambiata'); } catch (e) { toast(e.message, true); } };
}

boot();
