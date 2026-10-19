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
  app.innerHTML = `<div class="card" style="max-width:420px;margin:40px auto"><h1>Accesso ELIS</h1>
    <label class="f">Password</label><input type="password" id="pw" autofocus>
    <p class="small muted">La password iniziale è stampata nella finestra del terminale al primo avvio.</p>
    <button id="go" class="big">Entra</button></div>`;
  const go = async () => { try { await api('/api/admin/login', { method: 'POST', body: { password: $('#pw').value } }); location.reload(); } catch (e) { toast(e.message, true); } };
  $('#go').onclick = go; $('#pw').onkeydown = (e) => e.key === 'Enter' && go();
}

function route() {
  if (stopPoll) { stopPoll(); stopPoll = null; }
  const [, view = 'sessioni', arg] = location.hash.split('/');
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.v === view || (view === 'sessione' && a.dataset.v === 'sessioni') || (view === 'azienda' && a.dataset.v === 'aziende')));
  ({ sessioni: viewSessions, sessione: viewControl, aziende: viewCompanies, azienda: viewCompany, benchmark: viewBenchmark,
    audit: viewAudit, impostazioni: viewSettings, qr: viewQr, tavolo: viewTableCard }[view] || viewSessions)(arg);
}

// ---------- Sessioni ----------
async function viewSessions() {
  const ss = await api('/api/admin/sessions');
  app.innerHTML = `<h1>Sessioni</h1>
    ${NET.baseUrl.includes('localhost') ? '<div class="banner risk">Non è stato trovato un indirizzo di rete: i telefoni non potranno collegarsi. Verifica il Wi-Fi in Impostazioni.</div>' : ''}
    <div class="grid c2">${ss.map((s) => `<div class="card"><div class="row between"><h3>${esc(s.title)}</h3>${s.mode === 'adhoc' ? '<span class="tag gold">ad hoc</span>' : ''}</div>
      <p class="small muted">${esc(INST.sessions.find((x) => x.id === s.base).items.join(' · '))} · codice <span class="mono">${esc(s.code)}</span> · ${esc(s.channel)}</p>
      ${phaseChips(s.phase)}<div style="margin-top:12px"><a class="btn sm" href="#/sessione/${s.id}">Control room</a></div></div>`).join('')}</div>
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

// ---------- Control room ----------
async function viewControl(id) {
  let C = await api(`/api/admin/sessions/${id}/control`);
  const draw = () => {
    const s = C.session;
    const idx = PHASES.findIndex((p) => p.id === s.phase);
    const totP = C.companies.reduce((a, c) => a + c.participants, 0);
    const totS = C.companies.reduce((a, c) => a + c.submitted, 0);
    const active = C.companies.filter((c) => c.participants || c.consolidated_at || c.presession);
    const others = C.companies.filter((c) => !active.includes(c));
    app.innerHTML = `<p><a href="#/sessioni">← Sessioni</a></p>
      <div class="card"><div class="row between"><div><h1>${esc(s.title)}</h1><p class="small muted">${esc(C.def.items.map((i) => `${i} ${INST.items[i].title}`).join(' · '))}</p></div>${phaseChips(s.phase)}</div>
        <div class="row"><span class="small muted">Passa alla fase:</span>${PHASES.map((p, i) => { const locked = i < idx && i <= 1 && idx >= 2; return `<button class="sm ${i === idx ? '' : 'ghost'}" data-phase="${p.id}" ${i === idx || locked ? 'disabled' : ''} title="${locked ? 'Dopo il confronto non si torna alla fase individuale (§2)' : ''}">${i < idx ? '↩ ' : ''}${esc(p.label)}</button>`; }).join('')}</div>
        <p class="small muted" style="margin-top:8px">Individuale → Confronto blocca le risposte individuali. Il consolidamento si può confermare solo nella fase Consolidamento.</p></div>
      <div class="grid c3">
        <div class="card" style="text-align:center">${qrImg(C.joinUrl, 180)}<p class="small mono" style="word-break:break-all">${esc(C.joinUrl)}</p><a class="btn sm" href="#/qr/${s.id}">QR a schermo intero</a></div>
        <div class="card"><div class="kpi">${totP} <small>partecipanti</small></div><div class="kpi">${totS} <small>hanno inviato</small></div>
          <div class="kpi">${C.companies.filter((c) => c.consolidated_at).length} <small>aziende consolidate</small></div></div>
        <div class="card"><h3>Benchmark ${esc(INST.sessions.find((x) => x.id === s.base).name)}</h3>
          ${C.benchmark.length ? `<p class="small">Ultima versione: <b>${esc(C.benchmark[0].label)}</b> (N=${C.benchmark[0].n_companies})</p>` : '<p class="small muted">Nessuna versione congelata.</p>'}
          <div class="row"><a class="btn sm" href="/live/${s.id}" target="_blank">Dashboard live</a><button class="sm gold" id="freeze">Congela benchmark</button><a class="btn sm ghost" href="/plenaria/${s.base}" target="_blank">Plenaria</a></div>
          <div class="row" style="margin-top:8px"><a class="btn sm ghost" href="/api/admin/sessions/${s.id}/pdfs.zip">Scarica tutti i PDF (zip)</a></div>
          <p class="small muted" style="margin-top:6px">Entrano solo aziende REALI con consenso al benchmark. Le versioni consegnate non cambiano.</p></div>
      </div>
      <div class="card"><h2>Aziende</h2><div class="tablewrap"><table>
        <thead><tr><th>Azienda</th><th>Scheda</th><th class="num">Partecipanti</th><th>Risposte</th><th>Funzioni</th><th>Consolidato</th><th>Commitment</th><th>Report</th><th></th></tr></thead>
        <tbody>${active.map(row).join('') || '<tr><td colspan="9" class="muted">Nessuna azienda ancora attiva in questa sessione.</td></tr>'}</tbody></table></div>
        ${others.length ? `<details style="margin-top:10px"><summary class="small">Altre aziende censite (${others.length})</summary><table><tbody>${others.map(row).join('')}</tbody></table></details>` : ''}</div>`;
    $$('[data-phase]').forEach((b) => b.onclick = async () => {
      const to = b.dataset.phase;
      const back = PHASES.findIndex((p) => p.id === to) < idx;
      let reason = null;
      if (back) { reason = prompt(`Motivo per tornare alla fase "${to}" (resta nel registro modifiche)`); if (!reason) return; }
      else if (!confirm(`Passare alla fase "${to}"?${to === 'confronto' ? '\nLe risposte individuali verranno bloccate e non si potranno riaprire.' : ''}`)) return;
      try { await api(`/api/admin/sessions/${s.id}/phase`, { method: 'PUT', body: { phase: to, reason } }); C = await api(`/api/admin/sessions/${id}/control`); draw(); } catch (e) { toast(e.message, true); }
    });
    $('#freeze').onclick = async () => {
      if (!confirm('Congelare una nuova versione del benchmark con i dati consolidati attuali?')) return;
      try { const r = await api(`/api/admin/benchmark/${s.base}/freeze`, { method: 'POST' }); toast(`Congelata: ${r.label} (N=${r.n})`); C = await api(`/api/admin/sessions/${id}/control`); draw(); } catch (e) { toast(e.message, true); }
    };
    $$('[data-release]').forEach((b) => b.onclick = async () => {
      if (!confirm('Rilasciare il report? Viene salvata una copia che l\'azienda vede da ora in poi e che non cambierà più.')) return;
      await api(`/api/admin/sessions/${s.id}/companies/${b.dataset.release}/release`, { method: 'POST' }); C = await api(`/api/admin/sessions/${id}/control`); draw();
    });
    $$('[data-note]').forEach((b) => b.onclick = async () => {
      const c = C.companies.find((x) => x.id === Number(b.dataset.note));
      const note = prompt(`Esito della call con il leader — ${c.name}`, c.leader_call_note || '');
      if (note == null) return;
      await api(`/api/admin/sessions/${s.id}/companies/${c.id}/note`, { method: 'PUT', body: { note } }); C = await api(`/api/admin/sessions/${id}/control`); draw();
    });
  };
  const row = (c) => `<tr>
    <td><b>${esc(c.name)}</b> ${c.kind !== 'REALE' ? `<span class="tag warn">${c.kind}</span>` : ''}<div class="small">${c.referents.map((r) => `<a href="/r/${r.token}" target="_blank">referente: ${esc(r.name)}</a>`).join('<br>') || '<span class="muted">nessun referente</span>'}</div></td>
    <td>${c.presession ? '<span class="tag ok">✓</span>' : '<span class="tag">—</span>'}</td>
    <td class="num">${c.participants}<span class="muted small"> (${c.submitted} inviati)</span></td>
    <td class="small">${c.expected ? `${c.answered}/${c.expected}` : '—'}</td>
    <td class="small">${c.functions.length}${c.participants && c.functions.length < 2 ? ' <span class="tag warn">1 sola</span>' : ''}</td>
    <td>${c.consolidated_at ? `<span class="tag ok">✓</span> <span class="small muted">${fmtDate(c.consolidated_at)}</span>` : '—'}</td>
    <td>${c.commitment ? '<span class="tag ok">✓</span>' : '—'}</td>
    <td class="small">${c.consolidated_at ? `<a href="/report/${c.id}" target="_blank">apri</a> · <a href="/api/admin/pdf/${c.id}">PDF</a> · <a href="/report/${c.id}?preview=1" target="_blank">anteprima</a><br>${c.report_released_at ? `<span class="tag ok">rilasciato</span> <button class="link small" data-release="${c.id}" title="Crea una nuova versione marcata come tale">nuova versione</button>` : `<button class="sm ghost" data-release="${c.id}">Rilascia</button>`}` : ''}</td>
    <td class="small"><a href="#/tavolo/${C.session.id}:${c.id}">QR tavolo</a>${c.consolidated_at ? `<br><button class="link small" data-note="${c.id}">Call leader${c.leader_call_note ? ' ✓' : ''}</button>` : ''}</td></tr>`;
  draw();
  stopPoll = poll(async () => { const n = await api(`/api/admin/sessions/${id}/control`); if (JSON.stringify(n) !== JSON.stringify(C)) { C = n; if (!document.activeElement || document.activeElement === document.body) draw(); } }, 4000);
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
    <div class="tablecard"><div class="small muted">AITO · ${esc(C.session.title)}</div><h2>${esc(c.name)}</h2>${qrImg(url, 260)}<p class="small mono" style="word-break:break-all">${esc(url)}</p>
    <p class="small">Inquadra il QR: l'azienda è già selezionata.</p></div>`;
}

// ---------- Aziende ----------
async function viewCompanies() {
  const cs = await api('/api/admin/companies');
  app.innerHTML = `<h1>Aziende</h1>
    <div class="card"><h2>Nuova azienda</h2><div class="grid c4">
      <div><label class="f">Nome *</label><input type="text" id="n_name"></div>
      <div><label class="f">Perimetro valutato</label><input type="text" id="n_per" placeholder="gruppo, società o BU"></div>
      <div><label class="f">Settore</label><input type="text" id="n_sec"></div>
      <div><label class="f">Tipo</label><select id="n_kind"><option value="REALE">REALE</option><option value="TEST">TEST (prova, fuori benchmark)</option><option value="DEMO">DEMO (dati fittizi)</option></select></div></div>
      <div style="margin-top:12px"><button id="n_go">Aggiungi</button></div></div>
    <div class="card"><div class="tablewrap"><table><thead><tr><th>Azienda</th><th>Tipo</th><th>Perimetro</th><th>Consensi</th><th>Referenti</th><th></th></tr></thead><tbody>
      ${cs.map((c) => `<tr><td><b>${esc(c.name)}</b></td><td><span class="tag ${c.kind === 'REALE' ? 'ok' : 'warn'}">${c.kind}</span></td><td class="small">${esc(c.perimeter)}</td>
        <td class="small">${['benchmark', 'peer', 'testimonianza', 'followup'].map((k) => `${c.consents[k]?.granted ? '✓' : '·'} ${k}`).join('<br>')}</td>
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
  app.innerHTML = `<p><a href="#/aziende">← Aziende</a></p>
    <div class="card"><h1>${esc(c.name)}</h1><div class="grid c4">
      <div><label class="f">Nome</label><input type="text" id="e_name" value="${esc(c.name)}"></div>
      <div><label class="f">Perimetro</label><input type="text" id="e_per" value="${esc(c.perimeter)}"></div>
      <div><label class="f">Settore</label><input type="text" id="e_sec" value="${esc(c.sector)}"></div>
      <div><label class="f">Tipo</label><select id="e_kind">${['REALE', 'TEST', 'DEMO'].map((k) => `<option ${c.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div></div>
      <div style="margin-top:12px"><button id="e_save">Salva</button></div></div>
    <div class="grid c2">
      <div class="card"><h2>Consensi</h2><p class="small muted">Distinti e revocabili (§16). Senza consenso al benchmark l'azienda riceve comunque il proprio report ma non entra nelle distribuzioni.</p>
        ${['benchmark', 'peer', 'testimonianza', 'followup'].map((k) => `<label class="check"><input type="checkbox" data-consent="${k}" ${c.consents[k]?.granted ? 'checked' : ''}> ${{ benchmark: 'Benchmark anonimo', peer: 'Peer matching', testimonianza: 'Testimonianza', followup: 'Follow-up' }[k]} <span class="small muted">${c.consents[k] ? fmtDate(c.consents[k].at) : ''}</span></label>`).join('')}</div>
      <div class="card"><h2>Referenti</h2>
        ${c.referents.map((r) => `<div class="card flat"><div class="row between"><b>${esc(r.name)}</b><button class="sm danger" data-delref="${r.id}">Elimina</button></div>
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
    <div class="card"><h2>Dati</h2><p class="small">Database: <span class="mono">${esc(NET.db)}</span>. Per un backup basta copiare la cartella <span class="mono">data</span> a server fermo.</p>
      <a class="btn" href="/api/admin/export.xlsx">Scarica export Excel</a></div>
    <div class="card"><h2>Password admin</h2><div class="row"><input type="password" id="pw1" placeholder="Nuova password (min. 8)" style="max-width:280px"><button class="sm" id="pwgo">Cambia</button></div></div>
    <div class="card"><h2>Versioni</h2><p class="small">Strumento <b>${esc(INST.version)}</b> (${esc(INST.status)}) · Scoring <b>${esc(SC.version)}</b></p></div>`;
  $$('[data-url]').forEach((b) => b.onclick = async () => { await api('/api/admin/network', { method: 'PUT', body: { url: b.dataset.url } }); toast('Indirizzo aggiornato'); viewSettings(); });
  $('#savecustom').onclick = async () => { await api('/api/admin/network', { method: 'PUT', body: { url: $('#custom').value } }); viewSettings(); };
  $('#auto').onclick = async () => { await api('/api/admin/network', { method: 'PUT', body: { url: '' } }); viewSettings(); };
  $('#pwgo').onclick = async () => { try { await api('/api/admin/password', { method: 'PUT', body: { password: $('#pw1').value } }); toast('Password cambiata'); } catch (e) { toast(e.message, true); } };
}

boot();
