import { api, esc, $, $$, toast, ask, askText, poll, phaseChips, PHASES, qrImg, qrLabeled, downloadQrPng, icon, fmtDate, fmtScore, levelLabel, alt } from './ui.js';

const app = $('#app');
let INST, SC, NET;
let stopPoll = null;

// ---------- Ambiente: Produzione o DEMO (cookie del browser, letto anche dal server) ----------
const PROVA = /(?:^|;\s*)aito_mode=prova/.test(document.cookie);
async function setEnv(env) {
  if (ROLE === 'demo') return; // l'accesso DEMO non passa mai alla Produzione
  const msg = env === 'prova'
    ? 'Passare all\'ambiente DEMO? Vedrai solo dati simulati (azienda del percorso guidato e community di prova). I dati reali restano dove sono.'
    : 'Tornare all\'ambiente di Produzione? Vedrai e modificherai i dati reali del programma.';
  if (!await ask(msg)) return;
  document.cookie = `aito_mode=${env === 'prova' ? 'prova' : 'prod'}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`;
  location.hash = '#/programma'; location.reload();
}

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const shortDate = (d) => (d ? `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}` : '');
const longDate = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const isoDay = (d) => d.toISOString().slice(0, 10);
const PHASE_LABEL = { preparazione: 'In preparazione', individuale: 'In sala: risposte individuali', confronto: 'In sala: confronto', consolidamento: 'In sala: consolidamento', chiusa: 'Chiusa' };
let SESSIONS = [];
let SIMDAY = null; // DEMO: data simulata del percorso guidato (scadenze e giorni mancanti si calcolano su questa)

// accesso DEMO (comitato scientifico): solo l'ambiente DEMO, senza selettore e senza impostazioni di sistema
let ROLE = 'admin';
async function boot() {
  const me = await api('/api/admin/me');
  if (!me.admin) return login();
  ROLE = me.role || 'admin';
  if (ROLE === 'demo' && !PROVA) { document.cookie = `aito_mode=prova; Path=/; Max-Age=${60 * 60 * 24 * 14}; SameSite=Lax`; location.reload(); return; }
  const i = await api('/api/instrument'); INST = i.instrument; SC = i.scoring;
  NET = await api('/api/admin/network');
  $('#logout').onclick = async () => { await api('/api/admin/logout', { method: 'POST' }); if (me.role === 'demo') location.href = '/demo'; else location.reload(); };
  $$('[data-env]').forEach((b) => { const on = (b.dataset.env === 'prova') === PROVA; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); b.onclick = () => { if (!on) setEnv(b.dataset.env); }; });
  if (ROLE === 'demo') {
    $('#envswitch').insertAdjacentHTML('afterend', '<span class="rolebadge" title="Accesso solo all\'ambiente DEMO, per la validazione del modello"><span class="rb-long">Accesso DEMO · comitato scientifico</span><span class="rb-short" aria-hidden="true">DEMO · comitato</span></span>');
  } else $('#envswitch').classList.remove('hidden');
  if (PROVA) { document.body.classList.add('prova'); $('#provabar').classList.remove('hidden'); }
  shell();
  if (PROVA) await refreshSimDay();
  addEventListener('hashchange', route);
  route();
}

// Menu laterale: ridotto a sole icone su desktop (scelta ricordata nel browser), a scomparsa su tablet e telefono.
function shell() {
  const shellEl = $('#appshell'), menuBtn = $('#menubtn'), collapse = $('#collapse'), scrim = $('#scrim');
  menuBtn.innerHTML = icon('menu');
  $('#logout .ico-slot').innerHTML = icon('logout', 'thin');
  $('.ico-slot', collapse).innerHTML = icon('collapse');
  const setCollapsed = (on) => {
    shellEl.classList.toggle('collapsed', on); collapse.setAttribute('aria-expanded', String(!on));
    $('.lbl', collapse).textContent = on ? 'Espandi il menu' : 'Riduci il menu'; collapse.title = on ? 'Espandi il menu' : '';
    try { localStorage.setItem('aito_side', on ? 'min' : ''); } catch { /* preferenza non salvata */ }
  };
  let saved = ''; try { saved = localStorage.getItem('aito_side') || ''; } catch { /* nessuna preferenza */ }
  setCollapsed(saved === 'min');
  collapse.onclick = () => setCollapsed(!shellEl.classList.contains('collapsed'));
  const setOpen = (on) => {
    shellEl.classList.toggle('open', on); scrim.hidden = !on; menuBtn.setAttribute('aria-expanded', String(on));
    // menu aperto sopra la pagina: il resto non si raggiunge con il Tab finché non si chiude
    $('.appmain').inert = on;
    menuBtn.setAttribute('aria-label', on ? 'Chiudi il menu' : 'Apri il menu');
    if (on) $('#nav a')?.focus();
  };
  menuBtn.onclick = () => setOpen(!shellEl.classList.contains('open'));
  scrim.onclick = () => { setOpen(false); menuBtn.focus(); };
  matchMedia('(min-width: 1024px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && shellEl.classList.contains('open')) { setOpen(false); menuBtn.focus(); } });
  $('#nav').addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
}

function login() {
  $('#logout').classList.add('hidden');
  $('#appshell').classList.add('solo');
  app.innerHTML = `<div class="login-brand" aria-hidden="true"><svg viewBox="0 0 32 32"><rect x="1.5" y="1.5" width="29" height="29" rx="7" fill="none" stroke="#101D35" stroke-opacity=".5" stroke-width="1.5"/><path d="M16 5v22M5 16h22" stroke="#101D35" stroke-opacity=".25" stroke-width="1.2"/><circle cx="9.5" cy="21.5" r="2" fill="#101D35" fill-opacity=".55"/><circle cx="11.5" cy="10.5" r="2" fill="#101D35" fill-opacity=".55"/><circle cx="21" cy="22" r="2" fill="#101D35" fill-opacity=".55"/><circle cx="19" cy="13.5" r="1.6" fill="#101D35" fill-opacity=".55"/><circle cx="23.5" cy="9" r="3.2" fill="#35D4C0"/></svg>
      <span class="bname"><b>Intelligence Unit</b><small>AI Transformation &amp; Adoption Map · ELIS</small></span></div>
    <div class="card lift login"><h1>Console ELIS</h1><p class="ink2">Sessioni, aziende, benchmark e report del programma AITO 2026-27.</p>
    <label class="f" for="pw">Password</label><input type="password" id="pw" autocomplete="current-password" autofocus>
    <p class="small muted" style="margin-top:8px">La password la custodisce il team AI Strategy ELIS. Comitato scientifico: entra da <a href="/demo">/demo</a> con la password DEMO.</p>
    <button id="go" class="big">Entra</button></div>`;
  const go = async () => { try { await api('/api/admin/login', { method: 'POST', body: { password: $('#pw').value } }); location.reload(); } catch (e) { toast(e.message, true); } };
  $('#go').onclick = go; $('#pw').onkeydown = (e) => e.key === 'Enter' && go();
}

// ---------- Menu: segue il flusso della metodologia ----------
const calendar = () => SESSIONS.filter((s) => s.mode === 'workshop');
const adhoc = () => SESSIONS.filter((s) => s.mode === 'adhoc');
async function buildNav(view, arg) {
  SESSIONS = await api('/api/admin/sessions');
  // tip: testo semplice per il titolo (menu ridotto a icone)
  const link = (href, ic, label, active, extra = '', tip = label) => `<a href="${href}" class="${active ? 'active' : ''} ${extra}" ${active ? 'aria-current="page"' : ''} title="${esc(tip)}">${ic}<span class="lbl">${label}</span></a>`;
  const ico = (n) => icon(n, 'thin');
  const sid = view === 'sessione' || view === 'tavoli' ? Number(String(arg || '').split('/')[0]) : null;
  const cur = SESSIONS.find((s) => s.id === sid);
  const live = (s) => ['individuale', 'confronto', 'consolidamento'].includes(s.phase);
  const sessName = (s) => INST.sessions.find((x) => x.id === s.base)?.name || s.title;
  // voci che si riempiono solo dopo il consolidamento: restano cliccabili, ma lo dicono
  const soon = SESSIONS.some((s) => ['consolidamento', 'chiusa'].includes(s.phase)) ? '' : '<small class="navsoon">Disponibile dopo la sessione 1</small>';
  $('#nav').innerHTML = `
    <div class="navgroup">Programma</div>
    ${link('#/programma', ico('grid'), 'Programma', view === 'programma')}
    <div class="navsub" role="group" aria-label="Sessioni del programma">
    ${calendar().map((s, i) => link(`#/sessione/${s.id}`, `<span class="navnum ph-${s.phase}" aria-hidden="true">${s.phase === 'chiusa' ? icon('check') : i + 1}</span>`,
      `${esc(sessName(s))}<small>${esc(shortDate(s.date))}${live(s) ? ' · in corso' : s.phase === 'chiusa' ? ' · chiusa' : ''}</small>`, sid === s.id, 'navsess',
      `${sessName(s)} · ${shortDate(s.date)}${live(s) ? ' · in corso' : s.phase === 'chiusa' ? ' · chiusa' : ''}`)).join('')}
    </div>
    ${PROVA ? link('#/percorso', ico('flag'), 'Percorso guidato', view === 'percorso') : ''}
    ${link('#/allineamento', ico('layers'), 'Allineamento finale', view === 'allineamento')}
    ${link('#/domande', ico('list'), 'Domande delle sessioni', view === 'domande')}
    <div class="navgroup">Operatività</div>
    ${link('#/adhoc', ico('plus'), `Sessioni ad hoc${adhoc().length ? ` <span class="navcount">${adhoc().length}</span>` : ''}`, view === 'adhoc' || (cur && cur.mode === 'adhoc'), '', 'Sessioni ad hoc')}
    ${link('#/report', ico('file'), `Report e call con i leader${soon}`, view === 'report', '', `Report e call con i leader${soon ? ' · disponibile dopo la sessione 1' : ''}`)}
    ${link('#/commitment', ico('target'), `Commitment e verifica${soon}`, view === 'commitment', '', `Commitment e verifica${soon ? ' · disponibile dopo la sessione 1' : ''}`)}
    <div class="navgroup">Amministrazione</div>
    ${link('#/aziende', ico('building'), 'Aziende e referenti', view === 'aziende' || view === 'azienda')}
    ${link('#/audit', ico('history'), 'Registro modifiche', view === 'audit')}
    ${ROLE === 'demo' ? '' : link('#/impostazioni', ico('gear'), 'Impostazioni', view === 'impostazioni')}`;
  // percorso in alto: dove si è, con i livelli superiori cliccabili
  const C = (label, href) => ({ label, href });
  const trail = {
    programma: [C('Programma')], percorso: [C('Programma', '#/programma'), C('Percorso guidato')], domande: [C('Programma', '#/programma'), C('Domande delle sessioni')], allineamento: [C('Programma', '#/programma'), C('Allineamento finale')],
    adhoc: [C('Operatività'), C('Sessioni ad hoc')], report: [C('Operatività'), C('Report e call con i leader')], commitment: [C('Operatività'), C('Commitment e verifica')],
    aziende: [C('Amministrazione'), C('Aziende e referenti')], azienda: [C('Amministrazione'), C('Aziende e referenti', '#/aziende'), C('Scheda azienda')],
    audit: [C('Amministrazione'), C('Registro modifiche')], impostazioni: [C('Amministrazione'), C('Impostazioni')],
    mappe: [C('Programma', '#/programma'), C('Mappe')], benchmark: [C('Programma', '#/programma'), C('Benchmark')],
  }[view] || (cur ? [C(cur.mode === 'adhoc' ? 'Sessioni ad hoc' : 'Programma', cur.mode === 'adhoc' ? '#/adhoc' : '#/programma'), C(sessName(cur), view === 'sessione' ? null : `#/sessione/${cur.id}`), ...(view === 'tavoli' ? [C('QR delle aziende')] : [])]
    : [C('Programma', '#/programma')]);
  $('#crumbs').innerHTML = `<ol>${trail.map((t, i) => `<li>${t.href && i < trail.length - 1 ? `<a href="${t.href}">${esc(t.label)}</a>` : `<span ${i === trail.length - 1 ? 'aria-current="page"' : ''}>${esc(t.label)}</span>`}</li>`).join('')}</ol>`;
  // titolo della scheda del browser: la pagina in cui si è (utile con più schede aperte e ai lettori di schermo)
  if (trail.length) document.title = `${trail[trail.length - 1].label} · Console ELIS${PROVA ? ' · DEMO' : ''}`;
}

let keyHandler = null; // scorciatoie da tastiera della pagina aperta (oggi solo la control room)
document.addEventListener('keydown', (e) => keyHandler?.(e));
// se in un'altra scheda si è passati da DEMO a Produzione (o viceversa), questa pagina si ricarica:
// selettore, menu e dati restano sempre dello stesso ambiente
const envChanged = () => /(?:^|;\s*)aito_mode=prova/.test(document.cookie) !== PROVA;
addEventListener('focus', () => { if (envChanged()) location.reload(); });
async function route() {
  if (envChanged()) { location.reload(); return; }
  if (stopPoll) { stopPoll(); stopPoll = null; }
  keyHandler = null;
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  let [view = 'programma', ...rest] = parts;
  view = (view || '').split('?')[0];
  if (!view || view === 'sessioni') view = 'programma';
  const arg = rest.join('/');
  await buildNav(view, arg);
  ({ programma: viewProgram, sessione: viewControl, adhoc: viewAdhoc, report: viewReports, commitment: viewCommitments, aziende: viewCompanies, azienda: viewCompany,
    benchmark: viewBenchmark, audit: viewAudit, impostazioni: viewSettings, qr: viewQr, tavolo: viewTableCard, tavoli: viewTables, mappe: viewMaps, domande: viewQuestions, percorso: viewTour, allineamento: viewAlignment }[view] || viewProgram)(arg);
}

// ---------- DEMO: percorso guidato con un'azienda fittizia ----------
async function refreshSimDay() {
  try { const D = await api('/api/admin/demo'); SIMDAY = D.simDay || null; } catch { SIMDAY = null; }
  const el = $('#simday'); if (el) el.textContent = SIMDAY ? ` · data simulata: ${longDate(SIMDAY)}` : '';
}
let tourView = 'admin'; // al telefono si vede una vista alla volta
let tourReview = null; // passo già fatto che si sta rivedendo (solo vista: i dati restano quelli di adesso)
async function viewTour() {
  if (!PROVA) { location.hash = '#/programma'; return; }
  const D = await api('/api/admin/demo');
  const act = async (url, body, msg) => { tourReview = null; $$('[id^=tour_]').forEach((b) => { b.disabled = true; }); try { await api(url, { method: 'POST', body: body || {} }); toast(msg); await refreshSimDay(); route(); } catch (e) { toast(e.message, true); $$('[id^=tour_]').forEach((b) => { b.disabled = false; }); } };
  if (!D.present) {
    app.innerHTML = `<div class="pagehead"><div><h1>Percorso guidato</h1><p>Il programma dall'inizio alla fine con un'azienda fittizia, per mostrarlo a stakeholder e clienti senza dati reali.</p></div></div>
      <div class="card"><p>I dati DEMO non sono caricati. Puoi caricarli in due modi:</p>
      <ul class="small ink2"><li><b>Programma concluso</b>: le quattro sessioni chiuse, con mappe, report, call e commitment da mostrare.</li><li><b>Dall'inizio</b>: tutte le sessioni in preparazione, per seguire il processo passo per passo con «Avanza».</li></ul>
      <div class="row"><button type="button" class="primary" id="tour_load">Carica il programma concluso</button><button type="button" class="ghost" id="tour_start">Parti dall'inizio</button></div></div>`;
    $('#tour_load').onclick = () => act('/api/admin/demo', {}, 'Dati DEMO caricati: programma concluso');
    $('#tour_start').onclick = () => act('/api/admin/demo/reset', {}, 'Percorso guidato all\'inizio');
    return;
  }
  const rv = !D.done && tourReview != null && tourReview < D.k ? tourReview : null;
  const S = D.sessions, cur = D.done ? null : S[D.s], step = D.done ? null : D.steps[rv ?? D.k], cid = D.company.id;
  const sname = (x) => INST.sessions.find((y) => y.id === x.base)?.name || x.title;
  // la pagina vera da mostrare nel telefono e quella della console per ogni passo
  const joinUrl = (p) => `/j/${cur.code}?c=${D.company.joinCode}&anteprima=1${p ? `&p=${p}` : ''}`;
  const phone = D.done ? null : {
    prep: { url: `/r/${D.referentToken}`, who: `Il referente ${esc(D.referents[0]?.name || '')} riceve il link: vede le domande della sessione e le inoltra ai colleghi` },
    qr: { url: joinUrl(), who: 'Inquadrato il QR del tavolo: l\'azienda è già scelta, ognuno tocca il proprio nome' },
    individuale: { url: joinUrl(D.liveToken), who: `${esc(D.liveName || 'Una persona')} risponde dal telefono: puoi toccare i livelli, la risposta si salva davvero (solo in DEMO)` },
    confronto: { url: joinUrl(D.liveToken), who: 'Dopo l\'invio: la distribuzione anonima delle risposte dell\'azienda' },
    consolidamento: { url: `/r/${D.referentToken}#/sessione/${cur.id}`, who: 'Il referente segue e corregge dal suo link quello che il facilitatore registra al tavolo' },
    report: { url: `/report/${cid}?t=${D.referentToken}${D.snapshot ? `&snap=${D.snapshot.id}` : ''}`, who: 'Il report rilasciato, come lo legge il referente, con la trascrizione della call in appendice' },
    commitment: { url: `/r/${D.referentToken}#/sessione/${cur.id}`, who: 'Priorità e commitment dell\'azienda, dal link del referente' },
  }[step.id];
  const console_ = D.done ? [] : {
    prep: [[`#/sessione/${cur.id}/prima`, 'Preparazione della sessione'], [`#/azienda/${cid}`, 'Scheda dell\'azienda']],
    qr: [[`#/tavolo/${cur.id}:${cid}`, 'QR dell\'azienda'], [`#/sessione/${cur.id}/prima`, 'Preparazione della sessione']],
    individuale: [[`#/sessione/${cur.id}/sala`, 'Control room: risposte in sala']],
    confronto: [[`/tavolo-elis/${cid}#/sessione/${cur.id}`, 'Tavolo del facilitatore', true], [`#/sessione/${cur.id}/sala`, 'Control room']],
    consolidamento: [[`/tavolo-elis/${cid}#/sessione/${cur.id}`, 'Tavolo del facilitatore: consolida', true], [`#/sessione/${cur.id}/sala`, 'Control room']],
    report: [['#/report', 'Report e call con i leader'], [`/report/${cid}`, 'Report dell\'azienda', true], [`/plenaria/${cur.base}`, 'Plenaria della community', true]],
    commitment: [['#/commitment', 'Commitment e verifica'], [`#/azienda/${cid}`, 'Scheda dell\'azienda']],
  }[step.id];
  const stage = (x, i) => {
    const st = i < D.s || D.done ? 'done' : i === D.s ? 'live' : 'prep';
    return `<li class="tstage st-${st}"><span class="stage-n" aria-hidden="true">${st === 'done' ? icon('check') : i + 1}</span><span><b>${esc(sname(x))}</b><small>${esc(longDate(x.date))}</small></span></li>`;
  };
  const phoneUrl = D.done ? `/r/${D.referentToken}#/allineamento` : phone.url;
  const phoneHtml = /null|undefined/.test(phoneUrl) ? '<div class="phone-static"><p>Questa vista non è disponibile: il referente o il partecipante DEMO è stato rimosso dalla console. Con <b>Riparti da zero</b> il percorso si ricarica.</p></div>'
    : `<iframe class="phone-frame" src="${esc(phoneUrl)}" title="Vista azienda: ${D.done ? 'allineamento finale' : esc(step.label)}"></iframe>`;
  const realUrl = !D.done && phone.url.startsWith('/j/') ? `${NET.baseUrl}${phone.url.replace('&anteprima=1', '').replace(/&p=[^&#]*/, '')}` : null;
  app.innerHTML = `<div class="pagehead"><div><h1>Percorso guidato</h1><p>${esc(D.company.name)} · ${esc(D.company.sector || '')} · perimetro ${esc(D.company.perimeter || '')}. Dati inventati: nulla entra nei dati reali o nel benchmark ufficiale.</p></div>
      <div class="row"><button type="button" class="sm ghost" id="tour_reset">Riparti da zero</button></div></div>
    <ol class="tstages" aria-label="Sessioni del percorso">${S.map(stage).join('')}<li class="tstage ${D.done ? 'st-live' : 'st-prep'}"><span class="stage-n" aria-hidden="true">${icon('flag')}</span><span><b>Allineamento finale</b><small>settembre 2027</small></span></li></ol>
    ${D.done ? '' : `<ol class="tsteps" aria-label="Passi di ${esc(sname(cur))}">${D.steps.map((x, k) => `<li class="${k < D.k ? 'done' : k === D.k ? 'on' : ''} ${k === rv ? 'rv' : ''}" ${k === D.k ? 'aria-current="step"' : ''}>${k < D.k
      ? `<button type="button" class="tstep-btn" data-rv="${k}" aria-pressed="${k === rv}" title="Rivedi questo passo"><span aria-hidden="true">${icon('check')}</span>${esc(x.label)}<span class="sr-only"> (fatto: rivedi)</span></button>`
      : `<span aria-hidden="true">${k + 1}</span>${esc(x.label)}`}</li>`).join('')}</ol>`}
    <div class="tourbar">
      <div><span class="eyebrow">${D.done ? 'Fine del percorso' : rv != null ? `${esc(sname(cur))} · stai rivedendo il passo ${rv + 1}: i dati sono quelli di adesso` : `${esc(sname(cur))} · passo ${D.k + 1} di ${D.steps.length}`}</span><h2>${D.done ? 'Allineamento finale' : esc(step.label)}</h2>
        <p>${D.done ? 'Le quattro sessioni sono chiuse. A settembre l\'azienda conferma o modifica le 16 capacità con un\'evidenza e sceglie le tre priorità finali; ELIS rilascia il report unificato con gli spostamenti rispetto alle sessioni.' : esc(step.who)}</p></div>
      <div class="row tour-actions">${rv != null ? `<button type="button" class="primary" id="tour_back">Torna al passo ${D.k + 1}</button>` : ''}${D.done || rv != null ? '' : `<button type="button" class="primary" id="tour_next">Avanza${icon('arrow', 'thin')}</button><button type="button" class="ghost" id="tour_sess">${D.s < 3 ? 'Vai alla sessione successiva' : 'Chiudi l\'ultima sessione'}</button><button type="button" class="ghost" id="tour_end">Vai alla fine</button>`}</div>
    </div>
    <div class="tourtabs" role="group" aria-label="Quale vista mostrare"><button type="button" data-tv="admin" aria-pressed="${tourView === 'admin'}">Vista admin ELIS</button><button type="button" data-tv="phone" aria-pressed="${tourView === 'phone'}">Vista azienda</button></div>
    <div class="tourpanes view-${tourView}">
      <section class="panel tp-admin" aria-labelledby="tpa-t"><h3 id="tpa-t">Vista admin ELIS</h3>
        ${D.done ? `<p>L'allineamento è confermato e il report unificato è rilasciato. Le pagine vere della console:</p><div class="tlinks"><a class="btn ghost" href="#/allineamento">Allineamento finale: vista d'insieme</a><a class="btn ghost" href="/report/${cid}${D.snapshot ? `?snap=${D.snapshot.id}` : ''}" target="_blank">Report unificato<span class="sr-only"> (nuova scheda)</span></a><a class="btn ghost" href="/tavolo-elis/${cid}#/allineamento" target="_blank">Tavolo del facilitatore<span class="sr-only"> (nuova scheda)</span></a><a class="btn ghost" href="#/commitment">Commitment e verifica</a></div>`
          : `<p class="small ink2">Le pagine vere della console, con i dati di questo passo:</p><div class="tlinks">${console_.map(([href, label, ext]) => `<a class="btn ghost" href="${href}" ${ext ? 'target="_blank"' : ''}>${esc(label)}${ext ? '<span class="sr-only"> (nuova scheda)</span>' : ''}</a>`).join('')}</div>`}
        <dl class="tfacts"><div><dt>Azienda</dt><dd>${esc(D.company.name)} · TEST, fuori dal benchmark</dd></div>
          <div><dt>Referenti</dt><dd>${D.referents.map((r) => `${esc(r.name)} <span class="muted">(${esc(r.role || '')})</span>`).join('<br>')}</dd></div>
          <div><dt>Codice azienda</dt><dd class="mono">${esc(D.company.joinCode)}</dd></div>
          ${D.simDay ? `<div><dt>Data simulata</dt><dd>${esc(longDate(D.simDay))}</dd></div>` : ''}</dl>
      </section>
      <section class="panel tp-phone" aria-labelledby="tpp-t"><h3 id="tpp-t">Vista azienda</h3>
        <p class="small ink2">${D.done ? 'Il referente rivede le 16 capacità: conferma o modifica con un\'evidenza, vede lo spostamento e sceglie le tre priorità finali.' : phone.who}</p>
        <div class="phone">${phoneHtml}</div>
        ${realUrl ? `<details class="small"><summary>Aprila sul tuo telefono</summary><div style="margin-top:8px">${qrImg(realUrl, 150)}</div><p class="mono small" style="word-break:break-all">${esc(realUrl)}</p></details>` : ''}
      </section>
    </div>`;
  $$('[data-tv]').forEach((b) => b.onclick = () => { tourView = b.dataset.tv; $('.tourpanes').className = `tourpanes view-${tourView}`; $$('[data-tv]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.tv === tourView))); });
  $$('[data-rv]').forEach((b) => b.onclick = () => { tourReview = Number(b.dataset.rv) === rv ? null : Number(b.dataset.rv); viewTour(); });
  if ($('#tour_back')) $('#tour_back').onclick = () => { tourReview = null; viewTour(); };
  if ($('#tour_next')) $('#tour_next').onclick = () => act('/api/admin/demo/advance', { mode: 'step' }, 'Passo successivo');
  if ($('#tour_sess')) $('#tour_sess').onclick = () => act('/api/admin/demo/advance', { mode: 'session' }, 'Sessione successiva');
  if ($('#tour_end')) $('#tour_end').onclick = async () => { if (await ask('Portare il percorso alla fine? Le quattro sessioni DEMO si chiudono con tutti i dati del file.')) act('/api/admin/demo/advance', { mode: 'end' }, 'Percorso completato'); };
  $('#tour_reset').onclick = async () => { if (await ask('Ripartire da zero? I dati DEMO si cancellano (anche aziende e sessioni create a mano in DEMO) e si ricaricano con tutte le sessioni in preparazione, per seguire il processo passo per passo. I dati reali non vengono toccati.')) act('/api/admin/demo/reset', {}, 'Percorso guidato ripartito da zero'); };
}

// ---------- Allineamento finale (§14.1): vista d'insieme del team ELIS ----------
// Avanzamento per azienda, spostamenti medi per dimensione rispetto alle sessioni, apertura e rilascio del report unificato.
async function viewAlignment() {
  const O = await api('/api/admin/alignment');
  const shift = (x) => (x == null ? '—' : x === 0 ? '<span class="shift zero">invariato</span>' : `<span class="shift ${x > 0 ? 'up' : 'down'}">${x > 0 ? '▲ +' : '▼ '}${fmtScore(x).replace('-', '−')}</span>`);
  const dimName = (id) => INST.dimensions.find((d) => d.id === id)?.name || id;
  const prioRank = Object.entries(O.priorityCount).sort((a, b) => b[1] - a[1]);
  const toRelease = O.companies.filter((c) => c.confirmedAt && !c.released);
  const status = (c) => (c.confirmedAt ? (c.released ? '<span class="chip chip-done">report rilasciato</span>' : '<span class="chip chip-done">confermato</span>')
    : c.reviewed ? `<span class="chip chip-live">in corso · ${c.reviewed}/${c.total}</span>` : '<span class="chip chip-off">da iniziare</span>');
  const canOpen = O.companies.length > 0;
  app.innerHTML = `<div class="pagehead"><div><h1>Allineamento finale</h1>
      <p>Settembre 2027. Ogni azienda rivede le 16 capacità delle quattro sessioni: conferma o modifica con un'evidenza e sceglie le tre priorità finali. I valori delle sessioni restano: qui si vedono gli spostamenti. Dopo la conferma, ELIS rilascia il report unificato.</p></div>
      <div class="al-open">${O.open ? '<button type="button" class="ghost" id="al_open">Chiudi l\'allineamento</button><p class="small muted">Chiudendo, i referenti non modificano più; quanto salvato resta.</p>'
        : `<button type="button" class="${canOpen ? 'primary' : 'ghost'}" id="al_open" ${canOpen ? '' : 'disabled'}>Apri l'allineamento alle aziende</button>${canOpen ? '' : '<p class="small muted">Si apre quando le aziende hanno capacità consolidate (dopo Scalare).</p>'}`}</div></div>
    <div class="banner ${O.open ? 'ok' : 'info'}">${O.open ? `Aperto: i referenti lo vedono dal loro link. ${O.confirmed} ${O.confirmed === 1 ? 'azienda ha confermato' : 'aziende hanno confermato'}, ${O.started - O.confirmed} in corso.` : 'Chiuso: i referenti non lo vedono ancora. Il facilitatore può già prepararlo dal tavolo di ogni azienda.'}</div>
    <section class="kpis" aria-label="Indicatori dell'allineamento">
      <div class="kpitile"><span class="kt-l">Aziende</span><span class="kt-v">${O.companies.length}</span><span class="kt-s">con capacità misurate</span></div>
      <div class="kpitile"><span class="kt-l">Confermate</span><span class="kt-v">${O.confirmed}<small>/${O.companies.length}</small></span><span class="kt-s">${O.started - O.confirmed} in corso</span></div>
      <div class="kpitile"><span class="kt-l">Capacità modificate</span><span class="kt-v">${O.companies.reduce((n, c) => n + c.changed, 0)}</span><span class="kt-s">${O.companies.reduce((n, c) => n + c.up, 0)} in su · ${O.companies.reduce((n, c) => n + c.down, 0)} in giù</span></div>
      <div class="kpitile"><span class="kt-l">Priorità più scelta</span><span class="kt-v">${prioRank[0] ? prioRank[0][0] : '—'}</span><span class="kt-s">${prioRank[0] ? `${esc(dimName(prioRank[0][0]))} · ${prioRank[0][1]} ${prioRank[0][1] === 1 ? 'azienda' : 'aziende'}` : 'nessuna conferma ancora'}</span></div>
    </section>
    <div class="card"><h2>Vista d'insieme per dimensione</h2>
      <p class="small ink2">Media delle aziende che hanno iniziato l'allineamento: score in sessione → dopo l'allineamento e spostamento. Salite e scese dicono dove il quadro è cambiato da quando la dimensione è stata misurata.${O.testExcluded ? ` Le aziende TEST (${O.testExcluded}) sono nell'elenco sotto ma non entrano nelle medie.` : ''}</p>
      <div class="tablewrap"><table class="al-overview"><thead><tr><th>Dimensione</th><th class="num">Aziende</th><th class="num">Sessione → allineamento</th><th>Spostamento</th><th class="num">Salite / scese</th><th class="num">Scelta come priorità da</th></tr></thead><tbody>
      ${O.dims.map((d) => `<tr><td><span class="dim-letter">${d.id}</span>${esc(d.name)}</td><td class="num">${d.n}</td><td class="num nowrap">${fmtScore(d.before)} → <b>${fmtScore(d.after)}</b></td><td>${shift(d.shift)}</td><td class="num">${d.up} / ${d.down}</td><td class="num">${O.priorityCount[d.id] || 0}</td></tr>`).join('')}
      </tbody></table></div></div>
    <div class="card"><h2>Perché cambiano i valori, per sessione</h2>
      <p class="small ink2">Per ogni modifica l'azienda dice se è un <b>cambiamento reale</b> avvenuto dopo la sessione o una <b>revisione</b> della risposta data allora; per ogni conferma, se è soddisfatta o sperava in un miglioramento. Più mesi passano tra sessione e allineamento, più ci si aspettano cambiamenti reali; da Scalare (luglio) soprattutto conferme. Molte revisioni sulla stessa capacità indicano una domanda o un descrittore da chiarire nella prossima versione dello strumento. Contano tutte le aziende che hanno iniziato l'allineamento, anche se non l'hanno ancora confermato.</p>
      <div class="tablewrap"><table class="al-overview"><thead><tr><th>Sessione</th><th class="num">Capacità riviste</th><th class="num">Cambiamenti reali<br><span class="small muted">in su / in giù</span></th><th class="num">Revisioni<br><span class="small muted">in su / in giù</span></th><th class="num">Spostamento medio<br><span class="small muted">reali · revisioni</span></th><th class="num">Conferme<br><span class="small muted">soddisfatti / speravamo</span></th></tr></thead><tbody>
      ${O.sessions.map((s) => `<tr><td><b>${esc(s.name)}</b><div class="small muted">${esc(s.date.split('-').reverse().join('/'))}</div></td><td class="num">${s.reviewed}</td>
        <td class="num">${s.evoluzioneUp} / ${s.evoluzioneDown}</td><td class="num">${s.revisioneUp} / ${s.revisioneDown}</td>
        <td class="num nowrap">${s.shiftEvoluzione == null ? '—' : shift(s.shiftEvoluzione)} · ${s.shiftRevisione == null ? '—' : shift(s.shiftRevisione)}</td>
        <td class="num">${s.confermeSoddisfatti} / ${s.confermeSperavamo}${s.confermeSenzaGiudizio ? `<div class="small muted">${s.confermeSenzaGiudizio} senza giudizio</div>` : ''}</td></tr>`).join('')}
      </tbody></table></div>
      ${O.revisions.length ? `<h3>Capacità con più revisioni</h3><ul class="small">${O.revisions.slice(0, 5).map((r) => `<li><b>${esc(r.itemId)}</b> ${esc(r.title)}: ${r.n} ${r.n === 1 ? 'revisione' : 'revisioni'}</li>`).join('')}</ul>` : ''}</div>
    <div class="card"><div class="sechead"><h2>Aziende</h2>${toRelease.length ? `<button type="button" class="primary sm" id="al_relall">Rilascia i report unificati pronti (${toRelease.length})</button>` : ''}</div>
      ${O.companies.length ? `<ul class="al-list">${O.companies.map((c) => `<li>
        <div class="al-c-name"><a href="#/azienda/${c.id}"><b>${esc(c.name)}</b></a>${c.kind === 'TEST' ? ' <span class="tag">TEST</span>' : ''}<div>${status(c)}</div></div>
        <div class="al-c-mod small">${c.changed ? `<b>${c.changed}</b> ${c.changed === 1 ? 'modificata' : 'modificate'}<br><span class="muted">${c.up} in su · ${c.down} in giù</span>` : '<span class="muted">nessuna modifica</span>'}</div>
        <div class="al-c-prio small">${c.priorities.length ? `<span class="muted">Priorità finali</span><br>${c.priorities.map((p, i) => `${i + 1}. <b>${p}</b> ${esc(dimName(p))}`).join('<br>')}` : '<span class="muted">priorità non ancora scelte</span>'}</div>
        <div class="al-c-act">
          ${c.confirmedAt && !c.released ? `<button type="button" class="sm primary" data-rel="${c.id}" data-n="${esc(c.name)}">Rilascia il report unificato</button>` : ''}
          ${c.released ? `<a class="btn sm ghost" href="/report/${c.id}?snap=${c.released.id}" target="_blank">Apri il report<span class="sr-only"> unificato di ${esc(c.name)} (nuova scheda)</span></a>` : ''}
          <a class="btn sm ghost" href="/tavolo-elis/${c.id}#/allineamento" target="_blank">Apri il tavolo<span class="sr-only"> di ${esc(c.name)} (nuova scheda)</span></a>
          <details class="more"><summary class="btn sm ghost">Altro<span class="sr-only"> per ${esc(c.name)}</span></summary><div class="more-menu">
            <a href="/report/${c.id}?final=1" target="_blank">Anteprima del report unificato</a>
            ${c.released ? `<button type="button" class="link" data-rel="${c.id}" data-n="${esc(c.name)}" data-again="1">Rilascia una nuova versione</button>` : ''}
            ${c.confirmedAt ? `<button type="button" class="link" data-reopen="${c.id}" data-n="${esc(c.name)}">Riapri l'allineamento</button>` : ''}</div></details></div></li>`).join('')}</ul>` : '<p class="muted">Nessuna azienda ha ancora capacità consolidate.</p>'}</div>`;
  $('#al_open').onclick = async () => {
    const msg = O.open ? 'I referenti non potranno più modificarlo dal loro link; quello che hanno già salvato resta.' : 'I referenti lo vedranno dal loro link e potranno confermare o modificare le capacità.';
    if (!await ask(msg, { title: O.open ? 'Chiudere l\'allineamento?' : 'Aprire l\'allineamento alle aziende?', ok: O.open ? 'Chiudi l\'allineamento' : 'Apri alle aziende' })) return;
    try { await api('/api/admin/alignment/open', { method: 'POST', body: { open: !O.open, env: PROVA ? 1 : 0 } }); toast(O.open ? 'Allineamento chiuso' : 'Allineamento aperto'); route(); } catch (e) { toast(e.message, true); }
  };
  const release = async (id) => api(`/api/admin/alignment/${id}/release`, { method: 'POST', body: {} });
  $$('[data-rel]').forEach((b) => b.onclick = async () => {
    const again = !!b.dataset.again;
    if (!await ask(`Il referente di ${b.dataset.n} lo vedrà dal suo link. Il report rilasciato non cambia più${again ? ': la versione precedente resta consultabile' : ': eventuali correzioni diventano una nuova versione'}.`, { title: again ? 'Rilasciare una nuova versione del report unificato?' : 'Rilasciare il report unificato?', ok: 'Rilascia il report' })) return;
    try { const r = await release(b.dataset.rel); toast(`Report unificato v${r.version} rilasciato`); route(); } catch (e) { toast(e.message, true); }
  });
  if ($('#al_relall')) $('#al_relall').onclick = async () => {
    if (!await ask(`Si rilascia il report unificato di ${toRelease.length} ${toRelease.length === 1 ? 'azienda' : 'aziende'} con l'allineamento confermato: ${toRelease.map((c) => c.name).join(', ')}. I report rilasciati non cambiano più.`, { title: 'Rilasciare i report unificati pronti?', ok: `Rilascia ${toRelease.length} report` })) return;
    let ok = 0; for (const c of toRelease) { try { await release(c.id); ok++; } catch (e) { toast(`${c.name}: ${e.message}`, true); } }
    toast(`${ok} report unificati rilasciati`); route();
  };
  $$('[data-reopen]').forEach((b) => b.onclick = async () => {
    const reason = await askText(`Il referente di ${b.dataset.n} potrà di nuovo modificarlo; il report già rilasciato resta com'è.`, '', { title: 'Riaprire l\'allineamento?', label: 'Motivo (resta nel registro modifiche)', required: true, ok: 'Riapri' });
    if (!reason) return;
    try { const r = await api(`/api/admin/alignment/${b.dataset.reopen}/reopen`, { method: 'POST', body: { reason } }); toast(r.closed ? 'Riaperto: il referente potrà modificarlo quando apri l\'allineamento alle aziende (ora è chiuso)' : 'Allineamento riaperto'); route(); } catch (e) { toast(e.message, true); }
  });
}

// ---------- Domande delle sessioni: le stesse in DEMO e in Produzione (lo strumento V1 è uno solo) ----------
function viewQuestions(arg) {
  const base = INST.sessions.some((x) => x.id === arg) ? arg : INST.sessions[0].id;
  const S = INST.sessions.find((x) => x.id === base);
  const day = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  const pairQ = ([a, b]) => INST.pairQuestion.replace('{a}', `<b>${esc(INST.items[a].pairLabel || INST.items[a].title)}</b>`).replace('{b}', `<b>${esc(INST.items[b].pairLabel || INST.items[b].title)}</b>`);
  const facts = S.items.flatMap((id) => INST.items[id].levels.filter((l) => l.fact).map((l) => ({ ...l.fact, item: id, level: l.level })));
  const profile = (INST.profile || []).filter((p) => p.session === base);
  api('/api/admin/flags/questions-seen', { method: 'POST', body: {} }).catch(() => {});
  app.innerHTML = `<div class="pagehead"><div><h1>Domande delle sessioni</h1><p>Le domande sono le stesse in DEMO e in Produzione: lo strumento V1 è uno solo. Qui ci sono anche le sotto-opzioni, che si scelgono nel consolidamento.</p></div></div>
    <div class="tabs" role="tablist" aria-label="Sessioni">${INST.sessions.map((x, i) => `<button type="button" role="tab" class="tab ${x.id === base ? 'on' : ''}" aria-selected="${x.id === base}" data-qs="${x.id}"><span class="tdot" aria-hidden="true">${i + 1}</span>${esc(x.name)}</button>`).join('')}</div>
    <div class="row between" style="margin-bottom:16px"><p class="ink2" style="margin:0"><b>${esc(S.name)}</b>${S.date ? ` · ${esc(day(S.date))}` : ''} · dimensioni ${esc(S.dimensions.join(' e '))}</p>
      <div class="row"><a class="btn sm ghost" href="/anteprima/${S.id}" target="_blank">Anteprima per le aziende</a><button class="sm ghost" id="qcopy" type="button">Copia il link dell'anteprima</button></div></div>
    ${S.items.map((id, i) => { const it = INST.items[id]; return `<section class="card" aria-labelledby="qt-${id}">
      <div class="qmeta"><span>Domanda ${i + 1} di ${S.items.length} · dimensione ${esc(it.dimension)}</span><span class="tag navy">${esc(id)}</span></div>
      <h2 id="qt-${id}">${esc(it.title)}</h2><p class="statement">${esc(it.statement)}</p>
      <ol class="preview-levels">${it.levels.map((l) => `<li><span class="n" aria-hidden="true">${l.level}${alt(l.level)}</span><span><span class="sr-only">Livello ${l.level}: </span>${esc(l.descriptor)}${l.valoriale ? ' <span class="tag gold">valoriale</span>' : ''}
        ${l.sub ? `<span class="small muted" style="display:block;margin-top:4px">${l.sub.map((x) => `<b>${l.level}${esc(x.key)}</b> ${esc(x.text)}`).join('<br>')}</span>` : ''}</span></li>`).join('')}</ol></section>`; }).join('')}
    ${S.pairs?.length ? `<section class="card"><h2>Confronti a coppie</h2><ul>${S.pairs.map((pq) => `<li>${pairQ(pq)}</li>`).join('')}</ul></section>` : ''}
    ${facts.length || profile.length ? `<section class="card"><h2>In sala chiediamo anche</h2>
      ${facts.length ? `<h3>Dati fattuali per le sotto-opzioni</h3><ul>${facts.map((f) => `<li><b>${esc(f.item)}, livello ${f.level}</b>: ${esc(f.q)}</li>`).join('')}</ul>` : ''}
      ${profile.length ? `<h3>Profilo di approccio (fuori punteggio)</h3><ul>${profile.map((pp) => `<li>${esc(pp.q)}</li>`).join('')}</ul>` : ''}</section>` : ''}`;
  $$('[data-qs]').forEach((b) => b.onclick = () => { location.hash = `#/domande/${b.dataset.qs}`; });
  $('#qcopy').onclick = async () => { try { await navigator.clipboard.writeText(`${location.origin}/anteprima/${S.id}`); toast('Link copiato'); } catch { toast(`${location.origin}/anteprima/${S.id}`); } };
}

// Azioni condivise tra control room e pagina "Report e call"
async function releaseReport(sid, cid) {
  if (!await ask('Viene salvata una copia che l\'azienda vede da ora in poi e che non cambierà più.', { title: 'Rilasciare il report?', ok: 'Rilascia il report' })) return false;
  const url = `/api/admin/sessions/${sid}/companies/${cid}/release`;
  try { await api(url, { method: 'POST', body: {} }); toast('Report rilasciato'); return true; }
  catch (e) {
    if (e.status === 409 && await ask(`${e.message}\n\nRilasciare comunque, senza confronto con il benchmark?`)) {
      try { await api(url, { method: 'POST', body: { withoutBenchmark: true } }); toast('Report rilasciato'); return true; } catch (e2) { toast(e2.message, true); }
    } else if (e.status !== 409) toast(e.message, true);
  }
  return false;
}
async function noteCall(sid, c) {
  const note = await askText(`Che cosa è emerso nella call con il leader di ${c.name}? È una nota interna di ELIS: non va nel report.`, c.leader_call_note || '', { label: 'Esito della call', ok: 'Salva l\'esito', rows: 5 });
  if (note == null) return false;
  await api(`/api/admin/sessions/${sid}/companies/${c.id}/note`, { method: 'PUT', body: { note } }); toast('Esito annotato'); return true;
}
// Trascrizione Teams della call: incollata qui, va integrale in appendice in una nuova versione del report (la vede anche il referente)
function transcriptDialog(sid, c) {
  return new Promise((done) => {
    const d = document.createElement('dialog'); d.className = 'modal';
    d.setAttribute('aria-labelledby', 'tr-t');
    d.innerHTML = `<h2 id="tr-t">Trascrizione della call · ${esc(c.name)}</h2>
      <p class="small ink2">Incolla il testo esportato da Teams. Salvando si rilascia una <b>nuova versione del report</b> con la trascrizione integrale in appendice: la vede anche il referente. Le versioni già rilasciate non cambiano.
      ${c.transcript_chars ? '<br><b>Sostituisce la trascrizione attuale</b>, che resta nel registro modifiche.' : ''}</p>
      <label class="f" for="tr-date">Data della call</label><input type="date" id="tr-date" value="${esc(c.transcript_date || isoDay(new Date()))}" style="max-width:220px">
      <label class="f" for="tr-text">Trascrizione</label><textarea id="tr-text" rows="14" maxlength="300000" placeholder="Incolla qui la trascrizione di Teams"></textarea>
      <p class="small muted" id="tr-n">0 caratteri</p>
      <div class="row" style="justify-content:flex-end;margin-top:8px"><button class="ghost" id="tr-no" type="button">Annulla</button><button id="tr-ok" type="button">Salva e rilascia la nuova versione</button></div>`;
    document.body.appendChild(d); d.showModal();
    const close = (v) => { d.close(); d.remove(); done(v); };
    d.addEventListener('cancel', () => close(false));
    $('#tr-text', d).oninput = (e) => { $('#tr-n', d).textContent = `${e.target.value.length.toLocaleString('it-IT')} caratteri`; };
    $('#tr-no', d).onclick = () => close(false);
    $('#tr-ok', d).onclick = async (e) => {
      const text = $('#tr-text', d).value.trim();
      if (!text) { toast('Incolla la trascrizione della call', true); return; }
      e.target.disabled = true;
      try {
        const r = await api(`/api/admin/sessions/${sid}/companies/${c.id}/transcript`, { method: 'PUT', body: { text, date: $('#tr-date', d).value } });
        toast(`Trascrizione salvata: rilasciata la versione ${r.version} del report`); close(true);
      } catch (err) { toast(err.message, true); e.target.disabled = false; }
    };
  });
}
const benchUpToDate = (C) => {
  const lastCons = C.companies.filter((c) => c.consolidated_at).map((c) => c.consolidated_at).sort().pop() || null;
  const frozen = C.benchmark[0] || null;
  return !!frozen && (!lastCons || frozen.created_at >= lastCons);
};

// ---------- Programma: calendario e cose da fare ----------
async function viewProgram() {
  const cal = calendar();
  const ctrl = await Promise.all(SESSIONS.map((s) => api(`/api/admin/sessions/${s.id}/control`)));
  const byId = Object.fromEntries(ctrl.map((C) => [C.session.id, C]));
  const [commits, companies, AO, FL] = await Promise.all([api('/api/admin/commitments'), api('/api/admin/companies'), api('/api/admin/alignment'), api('/api/admin/flags')]);
  const alNote = AO.open ? `Aperto · ${AO.confirmed} di ${AO.companies.length} aziende confermate` : AO.companies.length ? 'Da aprire alle aziende' : 'Dopo le quattro sessioni';
  const today = SIMDAY || isoDay(new Date());
  const next = cal.find((s) => s.phase !== 'chiusa');
  const live = SESSIONS.find((s) => ['individuale', 'confronto', 'consolidamento'].includes(s.phase));

  // ---- cose da fare, calcolate dai dati
  const todo = [];
  const add = (kind, html, href, label) => todo.push({ kind, html, href, label });
  if (live) add('now', `<b>${esc(live.title)}</b> è in corso: ${esc(PHASE_LABEL[live.phase].toLowerCase())}.`, `#/sessione/${live.id}/sala`, 'Gestisci la sessione');
  if (next && next.phase === 'preparazione') {
    const C = byId[next.id];
    const days = Math.round((new Date(`${next.date}T09:00:00`) - new Date()) / 864e5);
    const noRef = C.companies.filter((c) => !c.referents.length);
    if (noRef.length) add('warn', `<b>${esc(INST.sessions.find((x) => x.id === next.base).name)}</b>: ${noRef.length} ${noRef.length === 1 ? 'azienda senza referente' : 'aziende senza referente'}.`, '#/aziende', 'Aggiungi i referenti');
    if (days >= 0 && days <= 10) add('info', `Mancano ${days} giorni a ${esc(next.title)}: stampa i QR delle aziende e provali sulla rete della sala.`, `#/tavoli/${next.id}`, 'QR delle aziende');
  }
  // report e call: una riga per tipo di attività, con le sessioni interessate
  const sn = (s) => INST.sessions.find((x) => x.id === s.base)?.name || s.title;
  const toRelease = [], toCall = [];
  for (const s of SESSIONS.filter((x) => ['consolidamento', 'chiusa'].includes(x.phase))) {
    const C = byId[s.id];
    const cons = C.companies.filter((c) => c.consolidated_at), rel = cons.filter((c) => c.report_released_at), call = rel.filter((c) => !c.leader_call_note);
    if (!PROVA && cons.length && !benchUpToDate(C)) add('warn', `<b>${esc(sn(s))}</b>: benchmark ${C.benchmark.length ? 'da aggiornare' : 'da congelare'} prima di rilasciare i report.`, `#/sessione/${s.id}/dopo`, 'Congela il benchmark');
    if (cons.length > rel.length) toRelease.push([s, cons.length - rel.length]);
    if (call.length) toCall.push([s, call.length]);
  }
  const sum = (l) => l.reduce((n, [, k]) => n + k, 0), where = (l) => l.map(([s, k]) => `${esc(sn(s))} ${k}`).join(' · ');
  if (toRelease.length) add('warn', `<b>${sum(toRelease)} ${sum(toRelease) === 1 ? 'report da rilasciare' : 'report da rilasciare'}</b> <span class="muted">(${where(toRelease)})</span>`, '#/report', 'Vai ai report');
  if (toCall.length) add('info', `<b>${sum(toCall)} ${sum(toCall) === 1 ? 'call con il leader da annotare' : 'call con i leader da annotare'}</b> <span class="muted">(${where(toCall)})</span>`, '#/report', 'Vai alle call');
  const overdue = commits.filter((m) => ['aperto', 'avviato'].includes(m.status) && m.due_date && m.due_date < today);
  if (overdue.length) add('warn', `${overdue.length} ${overdue.length === 1 ? 'commitment scaduto' : 'commitment scaduti'} da verificare con l'azienda.`, '#/commitment', 'Verifica');

  // ---- indicatori: solo dati presenti nel sistema, nessuna stima
  const closed = cal.filter((s) => s.phase === 'chiusa').length;
  const open = commits.filter((m) => ['aperto', 'avviato'].includes(m.status));
  // in Produzione contano le aziende REALI (le TEST, come l'azienda amica, restano a parte: regola 7)
  const real = PROVA ? companies : companies.filter((c) => c.kind === 'REALE');
  const tests = companies.length - real.length;
  const withRef = real.filter((c) => c.referents.length).length;
  const daysTo = (d) => Math.round((new Date(`${d}T09:00:00`) - new Date(`${today}T09:00:00`)) / 864e5);
  const focus = live || next;
  const sname = (s) => INST.sessions.find((x) => x.id === s.base)?.name || s.title;
  const dimNames = (base) => (INST.sessions.find((x) => x.id === base)?.dimensions || []).map((d) => INST.dimensions.find((x) => x.id === d)?.name || d);
  const status = (s) => ({ preparazione: ['prep', 'In preparazione'], individuale: ['live', 'In sala · risposte'], confronto: ['live', 'In sala · confronto'], consolidamento: ['live', 'In sala · consolidamento'], chiusa: ['done', 'Chiusa'] }[s.phase]);
  const primary = live ? { href: `#/sessione/${live.id}/sala`, label: 'Gestisci la sessione in sala' }
    : next ? { href: `#/sessione/${next.id}/prima`, label: 'Prepara la sessione' }
    : { href: '#/report', label: 'Report e call con i leader' };
  // B3: cosa manca per la prossima sessione in preparazione (dai dati della control room)
  const missing = [];
  if (next && next.phase === 'preparazione' && !live) {
    const C = byId[next.id], cs = PROVA ? C.companies.filter((c) => c.kind === 'TEST') : C.companies;
    if (!cs.length) missing.push(['nessuna azienda censita', '#/aziende']);
    else {
      const noRef = cs.filter((c) => !c.referents.length).length, noMail = cs.filter((c) => c.referents.length && !c.invited_at).length, noQr = cs.filter((c) => c.referents.length && !c.qr_generated_at).length;
      if (noRef) missing.push([`${noRef} ${noRef === 1 ? 'azienda senza referente' : 'aziende senza referente'}`, '#/aziende']);
      if (noMail) missing.push([`${noMail} ${noMail === 1 ? 'email al referente da inviare' : 'email ai referenti da inviare'}`, `#/sessione/${next.id}/prima`]);
      if (noQr) missing.push([`${noQr} QR da generare`, `#/sessione/${next.id}/prima`]);
    }
  }
  // B2: primi passi, finché il programma non è avviato (stato calcolato dai dati; le domande "viste" si ricordano nel browser)
  const qSeen = FL.questionsSeen;
  const nC = next ? byId[next.id].companies.filter((c) => !PROVA || c.kind === 'TEST') : [];
  const setup = next && next.phase === 'preparazione' && !closed && !live ? [
    { done: companies.length > 0 && companies.every((c) => c.referents.length), label: 'Aggiungi le aziende e i referenti', href: '#/aziende',
      note: !companies.length ? 'nessuna ancora' : companies.every((c) => c.referents.length) ? `${companies.length} ${companies.length === 1 ? 'azienda' : 'aziende'}, tutte con referente` : `${companies.filter((c) => !c.referents.length).length} senza referente` },
    { done: qSeen, label: 'Verifica le domande della sessione', href: `#/domande/${next.base}`, note: qSeen ? 'consultate' : 'da consultare' },
    { done: nC.length > 0 && nC.every((c) => c.qr_generated_at), label: 'Genera i QR delle aziende', href: `#/sessione/${next.id}/prima`, note: nC.length ? `${nC.filter((c) => c.qr_generated_at).length} di ${nC.length}` : 'servono le aziende' },
    { done: nC.length > 0 && !missing.length, label: 'Prepara la sessione', href: `#/sessione/${next.id}/prima`, note: missing.length ? `manca: ${missing.map((m) => m[0]).join(', ')}` : nC.length ? 'pronta' : 'servono le aziende' },
  ] : null;
  // «Da fare» riprende anche ciò che manca per preparare la prossima sessione (le aziende senza referente ci sono già)
  for (const [t, h] of missing.filter(([t]) => !t.includes('senza referente'))) add('warn', `<b>${esc(sname(next))}</b>: ${esc(t)}.`, h, 'Vai');
  const kpi = (label, value, sub, extra = '') => `<div class="kpitile"><span class="kt-l">${label}</span><span class="kt-v">${value}</span>${sub ? `<span class="kt-s">${sub}</span>` : ''}${extra}</div>`;
  const pct = cal.length ? Math.round((closed / cal.length) * 100) : 0;

  // ---- tappe: stato dai dati della sessione (fase), mai dedotto dalla data
  const stage = (s, i) => {
    const C = byId[s.id], [st, stl] = status(s);
    const cons = C.companies.filter((c) => c.consolidated_at).length, inRoom = C.companies.filter((c) => c.participants).length;
    const facts = s.phase === 'preparazione' ? `${C.companies.length} ${C.companies.length === 1 ? 'azienda' : 'aziende'} · ${C.companies.filter((c) => c.qr_generated_at).length} QR generati`
      : s.phase === 'chiusa' ? `${cons} ${cons === 1 ? 'azienda consolidata' : 'aziende consolidate'} · ${C.companies.filter((c) => c.report_released_at).length} report rilasciati`
      : `${inRoom} ${inRoom === 1 ? 'tavolo attivo' : 'tavoli attivi'} · ${cons} consolidati`;
    const isFocus = focus && focus.id === s.id;
    return `<li class="stage st-${st} ${isFocus ? 'focus' : ''}">
      <div class="stage-top"><span class="stage-n" aria-hidden="true">${st === 'done' ? icon('check') : i + 1}</span><span class="chip chip-${st}">${st === 'live' ? icon('dot') : ''}${esc(stl)}</span></div>
      <h3>${esc(sname(s))}</h3>
      <p class="stage-date">${icon('calendar', 'thin')}${esc(longDate(s.date))}</p>
      <p class="stage-desc">${dimNames(s.base).map(esc).join(' · ')}</p>
      <p class="stage-facts">${facts}</p>
      <a class="stage-go" href="#/sessione/${s.id}">${isFocus ? 'Apri la sessione' : 'Apri'}<span class="sr-only"> ${esc(sname(s))}</span>${icon('arrow', 'thin')}</a></li>`;
  };
  // contatori delle 4 sessioni del calendario; stesso criterio di "Da fare" per le call (esito annotato)
  const relTot = cal.reduce((n, s) => n + byId[s.id].companies.filter((c) => c.report_released_at).length, 0);
  const consTot = cal.reduce((n, s) => n + byId[s.id].companies.filter((c) => c.consolidated_at).length, 0);
  const callTot = cal.reduce((n, s) => n + byId[s.id].companies.filter((c) => c.leader_call_note).length, 0);
  const relTodo = consTot - relTot;

  app.innerHTML = `
    ${NET.baseUrl.includes('localhost') ? '<div class="banner risk">Non è stato trovato un indirizzo di rete: i telefoni non potranno collegarsi. Verifica in Impostazioni.</div>' : ''}
    ${PROVA ? '<div class="card demo-card" id="demo"><p class="muted small">…</p></div>' : ''}
    <section class="hero" aria-labelledby="ph-t">
      <div class="hero-main">
        <p class="eyebrow">${PROVA ? 'Ambiente DEMO · dati dimostrativi' : 'AITO 2026-27 · ELIS Innovation Hub'}</p>
        <h1 id="ph-t">Programma AITO <span class="nowrap-word">2026-27</span></h1>
        <p class="hero-sub">Quattro sessioni in presenza per misurare come le aziende governano, adottano e scalano l'intelligenza artificiale, fino all'allineamento finale di settembre 2027.</p>
        ${cal.length ? `<div class="hero-prog"><div class="meter-bar" role="progressbar" aria-label="Avanzamento del programma" aria-valuemin="0" aria-valuemax="${cal.length}" aria-valuenow="${closed}" aria-valuetext="${closed} di ${cal.length} sessioni chiuse"><i style="width:${pct}%"></i></div><span aria-hidden="true"><b>${closed} di ${cal.length}</b> sessioni chiuse</span></div>` : ''}
      </div>
      ${focus ? `<div class="hero-next">
        <span class="hn-l">${live ? 'In corso adesso' : 'Prossima sessione'}</span>
        <span class="hn-t">${esc(sname(focus))}</span>
        <span class="hn-d">${esc(longDate(focus.date))}${!live && daysTo(focus.date) === 0 ? ' · oggi' : !live && daysTo(focus.date) > 0 ? ` · tra ${daysTo(focus.date)} ${daysTo(focus.date) === 1 ? 'giorno' : 'giorni'}` : ''}</span>
        <span class="chip chip-${status(focus)[0]}">${status(focus)[0] === 'live' ? icon('dot') : ''}${esc(status(focus)[1])}</span>
        <a class="btn primary" href="${primary.href}">${esc(primary.label)}${icon('arrow', 'thin')}</a>
        ${missing.length ? `<p class="hn-miss"><b>Manca ancora:</b> ${missing.map(([t, h]) => `<a href="${h}">${esc(t)}</a>`).join(' · ')}</p>` : ''}</div>`
      : cal.length ? `<div class="hero-next"><span class="hn-l">Prossima tappa</span><span class="hn-t">Allineamento finale</span><span class="hn-d">Inizio settembre 2027 · le 4 sessioni sono chiuse</span>
          <span class="chip ${AO.open ? 'chip-live' : 'chip-prep'}">${esc(alNote)}</span>
          <a class="btn primary" href="#/allineamento">${AO.open ? 'Segui l\'allineamento' : 'Apri l\'allineamento finale'}${icon('arrow', 'thin')}</a>
          ${relTodo > 0 ? `<a class="small" style="color:#C9D4E3" href="#/report">Prima: ${relTodo} report da rilasciare</a>` : ''}</div>`
      : `<div class="hero-next"><span class="hn-l">Calendario</span><span class="hn-t">Nessuna sessione</span><span class="hn-d">${PROVA ? 'Il percorso guidato carica un\'azienda fittizia e le quattro sessioni DEMO, da seguire passo per passo.' : 'Le sessioni del programma non sono ancora in calendario.'}</span>
          ${PROVA ? `<a class="btn primary" href="#/percorso">Apri il percorso guidato${icon('arrow', 'thin')}</a>` : '<a class="btn primary" href="#/adhoc">Sessioni ad hoc</a>'}</div>`}
    </section>

    ${setup && !setup.every((x) => x.done) ? `<section class="card setup" aria-labelledby="su-t">
      <div class="sechead"><h2 id="su-t">Primi passi</h2><span class="small muted">${setup.filter((x) => x.done).length} di ${setup.length} fatti</span></div>
      <ol class="checklist">${setup.map((x, i) => `<li class="${x.done ? 'done' : ''}"><span class="ck-n" aria-hidden="true">${x.done ? icon('check', 'thin') : i + 1}</span>
        <a href="${x.href}">${esc(x.label)}</a><span class="ck-s">${x.done ? '<span class="sr-only">Fatto: </span>' : '<span class="sr-only">Da fare: </span>'}${esc(x.note)}</span></li>`).join('')}</ol>
    </section>` : ''}

    <section class="kpis" aria-label="Indicatori del programma">
      ${cal.length ? kpi('Sessioni chiuse', `${closed}<small>/${cal.length}</small>`, `${pct}% del calendario`) : kpi('Sessioni chiuse', '—', 'nessuna sessione in calendario')}
      ${kpi(PROVA ? 'Aziende DEMO' : 'Aziende reali', real.length, real.length ? `${withRef} con referente${tests ? ` · ${tests} TEST a parte` : ''}` : `nessuna azienda ${PROVA ? 'DEMO' : 'reale'} censita${tests ? ` · ${tests} TEST` : ''}`)}
      ${kpi('Commitment aperti', open.length, commits.length ? `su ${commits.length} registrati` : 'nessun commitment registrato')}
      ${kpi('Commitment scaduti', overdue.length, overdue.length ? 'scadenza superata: da verificare' : 'nessuna scadenza superata', overdue.length ? '<span class="kt-flag" aria-hidden="true"></span>' : '')}
    </section>

    <section class="roadmap" aria-labelledby="rm-t">
      <div class="sechead"><h2 id="rm-t">Percorso delle sessioni</h2><a class="small" href="#/domande">Domande delle sessioni</a></div>
      <ol class="stages">${cal.map(stage).join('')}
        <li class="stage ${AO.open ? 'st-live' : 'st-future'} final"><div class="stage-top"><span class="stage-n" aria-hidden="true">${icon('flag')}</span><span class="chip ${AO.confirmed && AO.confirmed === AO.companies.length ? 'chip-done' : AO.open ? 'chip-live' : 'chip-off'}">${AO.open ? 'Aperto' : 'Da aprire'}</span></div>
          <h3>Allineamento finale</h3><p class="stage-date">${icon('calendar', 'thin')}Settembre 2027</p>
          <p class="stage-desc">Conferma o modifica delle 16 capacità con un'evidenza, tre priorità finali, report unificato.</p><p class="stage-facts">${esc(alNote)}</p>
          <a class="stage-go" href="#/allineamento">Apri<span class="sr-only"> l'allineamento finale</span>${icon('arrow', 'thin')}</a></li></ol>
    </section>


    <div class="split">
      <section class="panel" aria-labelledby="todo-t">
        <div class="sechead"><h2 id="todo-t">Da fare</h2>${todo.length ? `<span class="count">${todo.length}</span>` : ''}</div>
        ${todo.length ? `<ul class="todolist">${todo.map((t) => `<li class="${t.kind}"><span class="tk" aria-hidden="true">${icon(t.kind === 'now' ? 'dot' : t.kind === 'warn' ? 'alert' : 'info')}</span><div>${t.html}</div><a class="btn sm ${t.kind === 'info' ? 'ghost' : ''}" href="${t.href}">${esc(t.label)}</a></li>`).join('')}</ul>`
          : `<p class="empty-ok">${icon('check')}<span><b>Nessuna attività in sospeso.</b>${next ? ` Prossima sessione: ${esc(sname(next))}, ${esc(longDate(next.date))}.` : ''}</span></p>`}
      </section>
      <section class="panel" aria-labelledby="after-t">
        <div class="sechead"><h2 id="after-t">Dopo le sessioni</h2></div>
        <ul class="afterlist">
          <li><a href="#/report">${icon('file', 'thin')}<span><b>Report e call con i leader</b><small>${consTot ? `Sessioni del calendario: ${relTot} report rilasciati su ${consTot} consolidati · ${callTot} call annotate` : 'I report arrivano dopo il primo consolidamento'}</small></span>${icon('arrow', 'thin')}</a></li>
          <li><a href="#/commitment">${icon('target', 'thin')}<span><b>Commitment e verifica</b><small>${commits.length ? `${open.length} aperti${overdue.length ? ` · ${overdue.length} scaduti` : ''}` : 'Nessun commitment registrato'}</small></span>${icon('arrow', 'thin')}</a></li>
          <li><a href="#/allineamento">${icon('flag', 'thin')}<span><b>Allineamento finale</b><small>Settembre 2027 · ${esc(alNote)}</small></span>${icon('arrow', 'thin')}</a></li>
        </ul>
      </section>
    </div>`;
  if (PROVA) {
    const D = await api('/api/admin/demo');
    $('#demo').innerHTML = `<h2>Dati DEMO</h2>
      <p class="ink2">${D.present ? `Sono caricate 14 aziende della community e l'azienda del percorso guidato (${esc(D.company?.name || '')}). ${D.done ? 'Il programma è concluso: sessioni chiuse, mappe, report e commitment da mostrare.' : 'Il percorso è in corso: lo segui passo per passo dal Percorso guidato.'} Con «Riparti da zero» le sessioni tornano in preparazione per vedere il processo dall\'inizio. Le aziende e le sessioni che crei in questo ambiente restano DEMO.` : 'Non ci sono dati DEMO. Caricali per vedere il programma concluso con un\'azienda fittizia: dashboard, plenaria, mappe e report.'}</p>
      <div class="row">${D.present ? `<a class="btn sm" href="#/percorso">Apri il percorso guidato</a>${D.vetrina ? `<a class="btn sm ghost" href="/report/${D.vetrina}" target="_blank">Report dell'azienda guidata</a>` : ''}<button class="sm ghost" id="demo_zero">Riparti da zero</button><button class="sm danger" id="demo_rm">Cancella tutti i dati DEMO</button>` : '<button class="sm" id="demo_add">Carica i dati DEMO</button>'}</div>`;
    if ($('#demo_add')) $('#demo_add').onclick = async () => { try { await api('/api/admin/demo', { method: 'POST' }); toast('Dati DEMO caricati'); await refreshSimDay(); route(); } catch (e) { toast(e.message, true); } };
    if ($('#demo_zero')) $('#demo_zero').onclick = async () => { if (!await ask('Ripartire da zero? I dati DEMO si ricaricano con tutte le sessioni in preparazione, per seguire il processo passo per passo. I dati reali non vengono toccati.')) return; try { await api('/api/admin/demo/reset', { method: 'POST' }); toast('Percorso guidato ripartito da zero'); await refreshSimDay(); location.hash = '#/percorso'; } catch (e) { toast(e.message, true); } };
    if ($('#demo_rm')) $('#demo_rm').onclick = async () => { if (!await ask('Cancellare tutti i dati DEMO (aziende, sessioni, risposte e report DEMO)? I dati reali non vengono toccati.')) return; try { await api('/api/admin/demo', { method: 'DELETE' }); toast('Dati DEMO cancellati'); await refreshSimDay(); route(); } catch (e) { toast(e.message, true); } };
  }
}

// ---------- Sessioni ad hoc ----------
async function viewAdhoc() {
  const ss = adhoc();
  app.innerHTML = `<div class="pagehead"><div><h1>Sessioni ad hoc</h1><p>Per un'azienda assente: stesso flusso, stessi descrittori e stessa versione dello strumento. La modalità viene registrata e i dati entrano nella versione successiva del benchmark.</p></div></div>
    ${ss.length ? `<div class="grid c2">${ss.map((s) => `<div class="card sesscard"><div class="row between" style="align-items:flex-start"><h2 style="margin:0">${esc(s.title)}</h2><span class="tag gold">${esc(s.channel)}</span></div>
      <div style="margin:16px 0">${phaseChips(s.phase)}</div><a class="btn sm" href="#/sessione/${s.id}">Gestisci la sessione</a></div>`).join('')}</div>` : '<p class="muted">Nessuna sessione ad hoc.</p>'}
    <div class="card"><h2>Nuova sessione ad hoc</h2>
      <div class="grid c3"><div><label class="f" for="ah_base">Sessione di riferimento</label><select id="ah_base">${INST.sessions.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
      <div><label class="f" for="ah_date">Data</label><input type="date" id="ah_date"></div>
      <div><label class="f" for="ah_ch">Canale</label><select id="ah_ch"><option value="presenza">In presenza</option><option value="remoto">Da remoto</option></select></div></div>
      <div style="margin-top:14px"><button id="ah_go">Crea la sessione</button></div></div>`;
  $('#ah_go').onclick = async () => {
    try { const r = await api('/api/admin/sessions', { method: 'POST', body: { base: $('#ah_base').value, date: $('#ah_date').value, channel: $('#ah_ch').value } }); location.hash = `#/sessione/${r.id}`; }
    catch (e) { toast(e.message, true); }
  };
}

// ---------- Dopo le sessioni: report e call con i leader ----------
async function viewReports() {
  const ss = SESSIONS.filter((s) => ['consolidamento', 'chiusa'].includes(s.phase));
  const ctrl = await Promise.all(ss.map((s) => api(`/api/admin/sessions/${s.id}/control`)));
  const blocks = ctrl.map((C) => {
    const cons = C.companies.filter((c) => c.consolidated_at);
    if (!cons.length) return '';
    const upd = benchUpToDate(C);
    return `<div class="card rc-block" data-sid="${C.session.id}"><div class="row between"><h2 style="margin:0">${esc(C.session.title)}</h2>
        <span class="small muted">${cons.filter((c) => c.report_released_at).length} di ${cons.length} rilasciati · ${cons.filter((c) => c.leader_call_note).length} call annotate</span></div>
      ${!PROVA && !upd ? `<p class="note" style="margin-top:12px">Benchmark ${C.benchmark.length ? 'da aggiornare' : 'non ancora congelato'}: <a href="#/sessione/${C.session.id}/dopo">congelalo prima di rilasciare</a>, così il report contiene il confronto.</p>` : ''}
      <div class="tablewrap" style="margin-top:12px"><table><thead><tr><th>Azienda</th><th>Report</th><th>Call con il leader</th></tr></thead><tbody>
      ${cons.map((c) => `<tr data-name="${esc(c.name.toLowerCase())}" data-todo="${!c.report_released_at || !c.leader_call_note ? 1 : 0}"><td><a href="#/azienda/${c.id}"><b>${esc(c.name)}</b></a> ${c.kind !== 'REALE' ? `<span class="tag warn">${esc(c.kind)}</span>` : ''}${c.allTop ? '<div class="small"><span class="tag warn">tutto al livello 5</span> nella call chiedete un esempio concreto per ogni capacità</div>' : ''}<div class="small muted">consolidato ${fmtDate(c.consolidated_at)}</div></td>
        <td><div class="row">${c.report_released_at ? `<span class="tag ok">Rilasciato ${fmtDate(c.report_released_at)}</span>` : '<span class="tag">Bozza</span>'}
          <a class="small" href="/report/${c.id}" target="_blank">apri</a><a class="small" href="/api/admin/pdf/${c.id}">PDF</a>
          <button class="sm ${c.report_released_at ? 'ghost' : ''}" data-rel="${C.session.id}:${c.id}">${c.report_released_at ? 'Nuova versione' : 'Rilascia'}</button></div></td>
        <td>${c.report_released_at ? `<div class="row"><span class="small ${c.leader_call_note ? 'ink2' : 'muted'}" style="max-width:360px">${c.leader_call_note ? esc(c.leader_call_note) : 'Esito non annotato'}</span><button class="sm ghost" data-call="${C.session.id}:${c.id}">${c.leader_call_note ? 'Modifica' : 'Annota esito'}</button>
          <button class="sm ghost" data-trs="${C.session.id}:${c.id}">${c.transcript_chars ? 'Sostituisci trascrizione' : 'Incolla trascrizione Teams'}</button>${c.transcript_chars ? '<span class="tag ok">trascrizione nel report</span>' : ''}</div>` : '<span class="small muted">dopo il rilascio del report</span>'}</td></tr>`).join('')}
      </tbody></table></div></div>`;
  }).join('');
  app.innerHTML = `<div class="pagehead"><div><h1>Report e call con i leader</h1><p>Rilasciare salva una copia del report che l'azienda vede dal link del referente e che non cambia più. Dopo il rilascio, la call con il leader discute il report: annota l'esito qui e incolla la trascrizione di Teams, che va integrale in appendice a una nuova versione del report.</p></div></div>
    ${blocks ? `<div class="card rc-filter"><div class="row" role="group" aria-label="Sessione da mostrare">${ctrl.filter((C) => C.companies.some((c) => c.consolidated_at)).map((C) => `<button type="button" class="sm ghost" data-rcs="${C.session.id}" aria-pressed="false">${esc(INST.sessions.find((x) => x.id === C.session.base)?.name || C.session.title)}</button>`).join('')}<button type="button" class="sm ghost" data-rcs="all" aria-pressed="false">Tutte</button></div>
      <div class="row" style="margin-top:10px;gap:16px"><label class="f" for="rc-q" style="margin:0">Cerca un'azienda</label><input type="search" id="rc-q" placeholder="Nome dell'azienda" style="max-width:280px">
        <label class="small"><input type="checkbox" id="rc-todo"> solo report da rilasciare o call da annotare</label></div></div>` : ''}
    ${blocks || '<div class="card"><p class="muted" style="margin:0">Nessuna azienda ha ancora consolidato: i report compaiono qui dopo il consolidamento in sala.</p></div>'}`;
  // filtro: una sessione alla volta (di default l'ultima), ricerca per nome, solo cose da fare
  const sids = $$('[data-rcs]').map((b) => b.dataset.rcs).filter((x) => x !== 'all');
  let pick = sids[sids.length - 1] || 'all';
  const applyFilter = () => {
    const qv = ($('#rc-q')?.value || '').trim().toLowerCase(), todo = $('#rc-todo')?.checked;
    $$('[data-rcs]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.rcs === pick)));
    $$('.rc-block').forEach((bl) => {
      let n = 0;
      bl.querySelectorAll('tr[data-name]').forEach((tr) => { const ok = (!qv || tr.dataset.name.includes(qv)) && (!todo || tr.dataset.todo === '1'); tr.hidden = !ok; if (ok) n++; });
      bl.hidden = !(pick === 'all' || bl.dataset.sid === pick) || n === 0;
    });
  };
  $$('[data-rcs]').forEach((b) => b.onclick = () => { pick = b.dataset.rcs; applyFilter(); });
  if ($('#rc-q')) { $('#rc-q').oninput = applyFilter; $('#rc-todo').onchange = applyFilter; applyFilter(); }
  const find = (v) => { const [sid, cid] = v.split(':').map(Number); return { sid, c: ctrl.find((C) => C.session.id === sid).companies.find((x) => x.id === cid) }; };
  $$('[data-rel]').forEach((b) => b.onclick = async () => { const { sid, c } = find(b.dataset.rel); b.disabled = true; if (await releaseReport(sid, c.id)) route(); else b.disabled = false; });
  $$('[data-call]').forEach((b) => b.onclick = async () => { const { sid, c } = find(b.dataset.call); if (await noteCall(sid, c)) route(); });
  $$('[data-trs]').forEach((b) => b.onclick = async () => { const { sid, c } = find(b.dataset.trs); if (await transcriptDialog(sid, c)) route(); });
}

// ---------- Dopo le sessioni: commitment e verifica ----------
async function viewCommitments() {
  const all = await api('/api/admin/commitments');
  const today = SIMDAY || isoDay(new Date());
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const only = params.get('tutti') !== '1';
  const due = (m) => ['aperto', 'avviato'].includes(m.status) && m.due_date && m.due_date < today;
  const list = only ? all.filter((m) => !['completato'].includes(m.status)) : all;
  app.innerHTML = `<div class="pagehead"><div><h1>Commitment e verifica</h1><p>Le priorità scelte dalle aziende in sala, con azione, owner e scadenza. Lo stato si aggiorna nella call con il leader e con l'item pulse della sessione successiva.</p></div>
      <div class="row"><a class="btn sm ${only ? '' : 'ghost'}" href="#/commitment">Da seguire</a><a class="btn sm ${only ? 'ghost' : ''}" href="#/commitment?tutti=1">Tutti</a></div></div>
    <div class="card">${list.length ? `<div class="tablewrap"><table><thead><tr><th>Azienda</th><th>Priorità e azione</th><th>Owner e scadenza</th><th>Stato</th></tr></thead><tbody>
      ${list.map((m) => `<tr><td><a href="#/azienda/${m.company_id}"><b>${esc(m.company_name)}</b></a><div class="small muted">${esc(m.session_title)}</div></td>
        <td class="small"><b>${esc(m.priority_item)}</b> ${esc(INST.items[m.priority_item]?.title || '')}<br>${esc(m.action || '—')}<br><span class="muted">KPI: ${esc(m.kpi || '—')}</span></td>
        <td class="small">${esc(m.owner || '—')}<br><span class="${due(m) ? 'tag risk' : ''}">${m.due_date ? esc(new Date(`${m.due_date}T12:00:00`).toLocaleDateString('it-IT')) : '—'}${due(m) ? ' · scaduto' : ''}</span></td>
        <td style="min-width:220px"><select data-cstat="${m.id}" aria-label="Stato del commitment di ${esc(m.company_name)} (${esc(m.session_title)})">${['aperto', 'avviato', 'completato', 'non avviato', 'sospeso'].map((x) => `<option ${m.status === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
          <label class="small" for="cn-${m.id}" style="display:block;margin-top:6px">Evidenza o nota</label><input type="text" id="cn-${m.id}" data-cnote="${m.id}" maxlength="1000" value="${esc(m.status_note || '')}"><button class="sm ghost" data-csave="${m.id}" style="margin-top:6px">Salva<span class="sr-only"> lo stato di ${esc(m.company_name)}</span></button></td></tr>`).join('')}
      </tbody></table></div>` : `<p class="muted" style="margin:0">${only ? 'Nessun commitment da seguire.' : 'Nessun commitment registrato.'}</p>`}</div>`;
  $$('[data-csave]').forEach((b) => b.onclick = async () => {
    const id = b.dataset.csave;
    try { await api(`/api/admin/commitments/${id}/status`, { method: 'PUT', body: { status: $(`[data-cstat="${id}"]`).value, note: $(`[data-cnote="${id}"]`).value } }); toast('Stato aggiornato'); } catch (e) { toast(e.message, true); }
  });
}

// ---------- Control room: il percorso della sessione ----------
// Sette passi in tre momenti. Le prime quattro corrispondono alle fasi della sessione (si aprono una alla volta),
// le ultime tre sono le attività dopo la sessione.
const FLOW = [
  { id: 'preparazione', group: 'Prima della sessione', title: 'Preparazione', phase: 'preparazione' },
  { id: 'individuale', group: 'In sala', title: 'Risposte individuali', phase: 'individuale', minutes: 10 },
  { id: 'confronto', group: 'In sala', title: 'Confronto al tavolo', phase: 'confronto', minutes: 10 },
  { id: 'consolidamento', group: 'In sala', title: 'Consolidamento', phase: 'consolidamento', minutes: 10 },
  { id: 'benchmark', group: 'Follow up', title: 'Congelare il benchmark' },
  { id: 'report', group: 'Follow up', title: 'Rilasciare i report' },
  { id: 'call', group: 'Follow up', title: 'Call con i leader' },
];
const NEXT = {
  preparazione: { to: 'individuale', label: 'Apri le risposte individuali', what: 'I partecipanti registrati vedono le domande della sessione e i confronti a coppie. Chi arriva dopo può ancora registrarsi.' },
  individuale: { to: 'confronto', label: 'Chiudi le risposte e apri il confronto', what: 'Le risposte individuali si bloccano e non si potranno riaprire. Ogni tavolo vede la distribuzione anonima delle proprie risposte, il referente la vista di confronto.' },
  confronto: { to: 'consolidamento', label: 'Apri il consolidamento', what: 'Il facilitatore ELIS registra con ogni tavolo livello e sotto-opzione ufficiali, poi priorità e commitment; il referente può correggere dal suo link.' },
  consolidamento: { to: 'chiusa', label: 'Chiudi la sessione', what: 'I referenti non possono più modificare il consolidamento; il commitment resta modificabile. Da qui in poi le correzioni le fa ELIS, con motivazione nel registro.' },
};
const nextStepText = (phase) => ({ preparazione: 'Prossimo passo: aprire le risposte individuali', individuale: 'In corso: risposte individuali', confronto: 'In corso: confronto al tavolo',
  consolidamento: 'In corso: consolidamento', chiusa: 'Sessione chiusa: benchmark, report e call con i leader' }[phase]);

const TABS = [
  { id: 'prima', label: 'Prima', steps: ['preparazione'] },
  { id: 'sala', label: 'In sala', steps: ['individuale', 'confronto', 'consolidamento'] },
  { id: 'risultati', label: 'Mappe', steps: [] },
  { id: 'dopo', label: 'Follow up', steps: ['benchmark', 'report', 'call'] },
];
async function viewControl(arg) {
  const [id, tabArg] = String(arg).split('/');
  let C = await api(`/api/admin/sessions/${id}/control`);
  let tab = TABS.some((t) => t.id === tabArg) ? tabArg : null;
  let sel = null;          // passo mostrato nel pannello
  let confirming = false;  // conferma del passaggio di fase aperta
  const mailed = new Set(); // aziende per cui si è appena aperta la bozza dell'email: si chiede se è stata inviata
  const names = (list, max = 4) => list.slice(0, max).map((c) => esc(c.name)).join(', ') + (list.length > max ? ` e altre ${list.length - max}` : '');
  const meter = (a, b, label) => `<div class="meter"><div class="meter-top"><b>${a}</b><span> di ${b} ${label}</span></div><div class="meter-bar"><i style="width:${b ? Math.round((a / b) * 100) : 0}%"></i></div></div>`;
  const ck = (kind, html) => `<li class="ck ${kind}"><span aria-hidden="true">${icon(kind === 'ok' ? 'check' : kind === 'warn' ? 'alert' : 'info')}</span><div>${html}</div></li>`;

  // Preparazione: una riga per azienda con i passi 2–4 (referente e persone, email, QR)
  // Una bozza per ogni referente: ognuno riceve solo il proprio link personale.
  const mailtoFor = (c, r) => {
    const s = C.session;
    const subject = `AI Transformation & Adoption Map · ${s.title} · le domande della sessione per ${c.name}`;
    const body = `Gentile ${r.name},\n\nin vista della sessione ${s.title.split(' · ')[0]}${s.date ? ` del ${longDate(s.date)}` : ''}, dal Suo link personale può consultare le domande a cui ${c.name} risponderà in sala e inoltrarle ai colleghi (c'è un pulsante apposito). Non c'è nulla da compilare prima: si risponde in presenza, il giorno della sessione.\n${C.baseUrl}/r/${r.token}\n\nIl link è personale: La preghiamo di non inoltrarlo. In sala il facilitatore ELIS condurrà con voi il confronto e registrerà la posizione ufficiale dell'azienda: dallo stesso link Lei potrà seguirla, correggerla e completare priorità e commitment; dopo la sessione vi leggerà il report.\n\nIn sala risponderà anche Lei come gli altri: inquadri il QR sul tavolo e scelga il Suo nome dall'elenco.\n\nGrazie,\nTeam AI Strategy ELIS`;
    return `mailto:${encodeURIComponent(r.email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
  // Email da inoltrare ai colleghi iscritti: senza link personale, con l'anteprima delle domande (presa visione)
  const mailtoColleagues = (c) => {
    const s = C.session, day = s.date ? longDate(s.date) : '';
    const to = c.referents.map((r) => r.email).filter(Boolean).join(',');
    const names = c.roster.map((r) => r.name).join(', ');
    const subject = `Da inoltrare: AI Transformation & Adoption Map, le domande di ${s.title.split(' · ')[0]}${s.date ? ` del ${s.date.split('-').reverse().join('/')}` : ''}`;
    const body = `[Per ${c.referents.map((r) => r.name).join(', ')}: inoltri ai colleghi iscritti${names ? ` (${names})` : ''} il testo qui sotto, dalla riga «Buongiorno» in poi. Non contiene il Suo link personale.]\n\n----------\n\nBuongiorno,\n${day ? `il ${day} ` : ''}parteciperete alla sessione ${s.title.split(' · ')[0]} di AI Transformation & Adoption Map. Per presa visione, ecco le domande a cui risponderete dal telefono (da questa pagina non si risponde):\n${C.baseUrl}/anteprima/${s.base}\n\nIn sala:\n- portate il telefono carico, con i dati mobili attivi o collegato al Wi-Fi della sala;\n- inquadrate il QR sul tavolo di ${c.name} e scegliete il vostro nome dall'elenco; se non c'è, scegliete «Non sono nell'elenco»;\n- ognuno risponde per conto suo, in circa dieci minuti; se su un tema non avete visibilità, scegliete N.D.\n\nGrazie,\nTeam AI Strategy ELIS`;
    return `mailto:${encodeURIComponent(to).replace(/%2C/g, ',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
  // un indirizzo locale (portatile ELIS) non si apre da fuori: lo si dice prima di mandare l'email
  const localBase = /^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(C.baseUrl);
  const prepTable = () => {
    const cos = C.companies, s = C.session;
    const prow = (c) => {
      const has = c.referents.length;
      const drafts = (again) => c.referents.map((r) => `<div style="margin-top:4px"><a class="${again ? 'small' : 'btn sm'}" href="${mailtoFor(c, r)}" data-mail="${c.id}">${again ? 'prepara di nuovo' : 'Prepara l\'email'}${c.referents.length > 1 ? ` a ${esc(r.name)}` : ''}</a>
        ${r.email ? '' : `<div class="small" style="color:var(--warn)">manca l'email di ${esc(r.name)}: <a href="#/azienda/${c.id}">aggiungila</a></div>`}</div>`).join('');
      const colleagues = `<div style="margin-top:6px"><a class="small" href="${mailtoColleagues(c)}">Email per i colleghi (da inoltrare)</a></div>`;
      const invite = !has ? '<span class="muted small">serve il referente</span>'
        : mailed.has(c.id) ? `<div class="small">L'hai inviata?</div><div class="row" style="margin-top:4px"><button class="sm" data-invited="${c.id}">Sì, segna come inviata</button><button class="sm ghost" data-unmail="${c.id}">Non ancora</button></div>`
        : c.invited_at ? `<span class="tag ok">inviata</span> <span class="small muted">${fmtDate(c.invited_at)}</span>${drafts(true)}${colleagues}`
        : drafts(false) + colleagues;
      const qr = !has ? '<span class="muted small">serve il referente</span>'
        : c.qr_generated_at ? `<span class="tag ok">generato</span> <span class="small muted">${fmtDate(c.qr_generated_at)}</span><div><a class="small" href="#/tavolo/${s.id}:${c.id}">QR azienda</a> · <span class="small muted">referente bloccato</span></div>`
        : `<button class="sm ghost" data-genqr="${c.id}">Genera il QR</button>`;
      return `<tr><td><b>${esc(c.name)}</b> ${c.kind !== 'REALE' ? `<span class="tag warn">${esc(c.kind)}</span>` : ''} <span class="small mono muted" title="Codice azienda">${esc(c.joinCode)}</span></td>
        <td class="small">${has ? c.referents.map((r) => `<div><a href="/r/${r.token}" target="_blank">${esc(r.name)}</a>${r.email ? ` · <span class="muted">${esc(r.email)}</span>` : ''}</div>`).join('') : `<a href="#/azienda/${c.id}">Indica il referente</a>`}
          <div><a href="#/azienda/${c.id}" class="muted">${c.roster.length ? `${c.roster.length} ${c.roster.length === 1 ? 'persona iscritta' : 'persone iscritte'}` : 'nessuna persona iscritta'}</a></div></td>
        <td>${invite}</td><td>${qr}</td></tr>`;
    };
    return `<div class="card"><h2>Aziende del programma</h2>
      ${localBase ? `<div class="banner warn">I link nelle email usano un indirizzo della rete locale (${esc(C.baseUrl)}): fuori dalla rete ELIS non si aprono. Usa la piattaforma online o imposta l'indirizzo pubblico in <a href="#/impostazioni">Impostazioni</a>.</div>` : ''}
      <div class="tablewrap"><table>
      <thead><tr><th>1 · Azienda</th><th>2 · Referente e persone</th><th>3 · Email</th><th>4 · QR</th></tr></thead>
      <tbody>${cos.map(prow).join('') || '<tr><td colspan="4" class="muted">Nessuna azienda: aggiungile da <a href="#/aziende">Aziende e referenti</a>.</td></tr>'}</tbody></table></div></div>`;
  };

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
      if (f.id === 'benchmark') return (PROVA ? idx >= 3 : benchDone) ? 'done' : idx >= 3 ? 'now' : 'todo';
      if (f.id === 'report') return consolidated.length && released.length === consolidated.length ? 'done' : idx >= 3 && consolidated.length ? 'now' : 'todo';
      return released.length && called.length === released.length ? 'done' : released.length ? 'now' : 'todo';
    };
    const summary = {
      preparazione: `${withRef.length} di ${cos.length} aziende con referente · ${withRef.filter((c) => c.qr_generated_at).length} QR`,
      individuale: totP ? `${totS} di ${totP} hanno inviato` : 'nessun partecipante ancora',
      confronto: `${inRoom.length} ${inRoom.length === 1 ? 'azienda' : 'aziende'} al tavolo`,
      consolidamento: `${consolidated.length} di ${inRoom.length || consolidated.length} consolidate`,
      benchmark: PROVA ? 'calcolato sui dati DEMO' : frozen ? `${frozen.label} · N=${frozen.n_companies}${benchDone ? '' : ' · da aggiornare'}` : 'non ancora congelato',
      report: `${released.length} di ${consolidated.length} rilasciati`,
      call: `${called.length} di ${released.length} annotate`,
    };
    if (!sel && !tab) sel = idx < 4 ? FLOW[idx].id : (FLOW.slice(4).find((f) => state(f) !== 'done') || FLOW[6]).id;
    if (!tab) tab = TABS.find((t) => t.steps.includes(sel)).id;
    const T = TABS.find((t) => t.id === tab);
    if (T.steps.length && !T.steps.includes(sel)) sel = (T.steps.find((x) => state(FLOW.find((f) => f.id === x)) === 'now') || T.steps.find((x) => state(FLOW.find((f) => f.id === x)) !== 'done') || T.steps[0]);
    if (!T.steps.length) sel = sel || 'benchmark';
    const f = FLOW.find((x) => x.id === sel);
    const st = state(f);
    const mins = C.phaseSince ? Math.max(0, Math.round((Date.now() - new Date(C.phaseSince.replace(' ', 'T') + 'Z')) / 60000)) : null;
    const chip = st === 'done' ? '<span class="tag ok">Completato</span>'
      : st === 'now' ? `<span class="chip chip-live">${f.phase ? `In corso${mins != null ? ` da ${mins} min` : ''}${f.minutes ? ` · previsti ${f.minutes}` : ''}` : 'Da fare ora'}</span>`
      : '<span class="tag">Più avanti</span>';

    // ---- contenuto del pannello
    let what = '', checks = [], extra = '';
    if (f.id === 'preparazione') {
      // i cinque passi della preparazione, nell'ordine del flusso, con lo stato reale (niente spunte verdi a programma vuoto)
      what = `Cosa preparare prima della sessione${s.date ? ` del ${esc(longDate(s.date))}` : ''}, nell'ordine. Nella tabella sotto trovi, azienda per azienda, i pulsanti per l'email e il QR.`;
      const noRef = cos.filter((c) => !c.referents.length);
      const invited = withRef.filter((c) => c.invited_at), withQr = withRef.filter((c) => c.qr_generated_at);
      const adhoc = s.mode !== 'workshop';
      checks.push(cos.length ? ck('ok', `<b>1 · Aziende:</b> ${cos.length} ${cos.length === 1 ? 'azienda' : 'aziende'} ${PROVA ? 'DEMO' : 'nel programma'}. <a href="#/aziende">Aggiungine altre</a>`)
        : ck('warn', `<b>1 · Aziende:</b> nessuna azienda ${PROVA ? 'DEMO' : 'in Produzione'}. <a href="#/aziende">Aggiungi le aziende</a>`));
      checks.push(!cos.length ? ck('info', '<b>2 · Referenti:</b> dopo le aziende, indica per ognuna il referente (nome ed email).')
        : noRef.length ? ck('warn', `<b>2 · Referenti:</b> ${noRef.length} di ${cos.length} ${cos.length === 1 ? 'azienda' : 'aziende'} senza referente: ${names(noRef)}. <a href="#/aziende">Indica il referente</a>`)
        : ck('ok', `<b>2 · Referenti:</b> ${cos.length === 1 ? 'l\'azienda ha' : `tutte le ${cos.length} aziende hanno`} un referente`));
      const noRoster = cos.filter((c) => !c.roster.length);
      // il referente risponde anche lui: deve essere tra le persone iscritte, altrimenti in sala non può registrarsi
      const refOut = withRef.filter((c) => !c.referents.every((r) => c.roster.some((p) => p.name.trim().toLowerCase() === r.name.trim().toLowerCase())));
      if (refOut.length) checks.push(ck('warn', `<b>Referente tra le persone iscritte:</b> manca per ${names(refOut)}. In sala il referente risponde scegliendo il suo nome dall'elenco: aggiungilo nella pagina dell'azienda.`));
      if (cos.length) checks.push(ck(noRoster.length ? 'info' : 'ok', `<b>Persone iscritte:</b> ${noRoster.length ? `${cos.length - noRoster.length} di ${cos.length} aziende hanno l'elenco. Senza elenco i partecipanti si registrano scrivendo nome e funzione. Mancano: ${names(noRoster)}` : 'tutte le aziende hanno l\'elenco'} · <a href="/anteprima/${s.base}" target="_blank">Anteprima delle domande</a>`));
      checks.push(!withRef.length ? ck('info', `<b>3 · Email al referente:</b> con il link personale, da cui consulta le domande e le inoltra ai colleghi. Si prepara dalla tabella sotto quando c'è il referente.`)
        : invited.length < withRef.length ? ck('warn', `<b>3 · Email al referente:</b> inviata a ${invited.length} di ${withRef.length}. Usa <i>Prepara l'email</i> nella tabella sotto: si apre il programma di posta con il testo pronto.`)
        : ck('ok', `<b>3 · Email al referente:</b> inviata a tutti (${withRef.length})`));
      checks.push(ck(withRef.length && withQr.length === withRef.length ? 'ok' : withRef.length ? 'warn' : 'info', `<b>4 · QR della sessione:</b> ${withQr.length ? `generati per ${withQr.length} di ${withRef.length} ${withRef.length === 1 ? 'azienda' : 'aziende'}. <a href="#/tavoli/${s.id}">Apri i QR delle aziende</a> per stamparli o scaricarli.` : 'non ancora generati.'}
        Dal momento in cui generi il QR di un'azienda, il suo referente <b>non si può più cambiare</b> fino alla chiusura della sessione.
        ${!adhoc && withRef.length > withQr.length ? `<div style="margin-top:8px"><button class="sm" id="genqr">${withQr.length ? 'Genera i QR mancanti' : 'Genera i QR della sessione'}</button></div>` : ''}
        ${adhoc && withRef.length > withQr.length ? '<div class="small muted" style="margin-top:4px">Sessione ad hoc: genera il QR solo per le aziende che partecipano, dalla tabella sotto.</div>' : ''}
        <div class="small muted" style="margin-top:6px">Riserva: il QR di sala (<a href="#/qr/${s.id}">a schermo intero</a>) chiede il codice azienda · <span class="mono" style="word-break:break-all">${esc(C.joinUrl)}</span></div>`));
      // la scheda pre-sessione non si compila (decisione del 20/10/2026): il referente consulta le domande dal suo link
      if (totP) checks.push(ck('info', `<b>Partecipanti già registrati:</b> ${totP}`));
    } else if (f.id === 'individuale') {
      what = 'Ognuno risponde da solo, senza vedere le risposte dei colleghi. Chi non ha visibilità su un punto sceglie N.D.';
      extra = st === 'todo' ? '' : `<div class="grid c2">${meter(totS, totP, 'partecipanti hanno inviato')}${meter(answered, expected, 'risposte date')}</div>`;
      const few = inRoom.filter((c) => c.participants < 3), oneFn = inRoom.filter((c) => c.functions.length < 2), absent = withRef.filter((c) => c.qr_generated_at && !c.participants);
      if (st !== 'todo') {
        checks.push(few.length ? ck('warn', `La confidence sarà più bassa dove ci sono meno di 3 partecipanti: ${names(few)}`) : inRoom.length ? ck('ok', 'Tutte le aziende in sala hanno almeno 3 partecipanti') : ck('info', 'Nessuna azienda ancora in sala'));
        if (oneFn.length) checks.push(ck('warn', `Una sola funzione presente: ${names(oneFn)}`));
        if (absent.length) checks.push(ck('warn', `QR generato ma nessuno registrato: ${names(absent)}`));
      }
    } else if (f.id === 'confronto') {
      what = 'Ogni tavolo guarda dove le risposte divergono e su quali evidenze si basano. Le risposte individuali sono bloccate. Dove la divergenza è di due livelli o più, la discussione è obbligatoria prima del consolidamento.';
      if (st !== 'todo') checks.push(ck('info', `Aziende al tavolo: <b>${inRoom.length}</b>. I referenti vedono la vista di confronto dal proprio link.`));
      extra = `<div class="row"><a class="btn sm ghost" href="/live/${s.id}" target="_blank">Apri la dashboard live</a></div>`;
    } else if (f.id === 'consolidamento') {
      what = 'Il facilitatore ELIS registra con il tavolo la posizione ufficiale: livello, sotto-opzione e, se si scosta dalla mediana, la motivazione (il referente può correggere dal suo link). Poi si sceglie la priorità e il commitment.';
      if (st !== 'todo') {
        extra = meter(consolidated.length, inRoom.length || consolidated.length, 'aziende hanno consolidato');
        const missing = inRoom.filter((c) => !c.consolidated_at), noCommit = consolidated.filter((c) => !c.commitment);
        checks.push(missing.length ? ck('warn', `Non hanno ancora consolidato: ${names(missing)}`) : consolidated.length ? ck('ok', 'Tutte le aziende in sala hanno consolidato') : ck('info', 'Nessun consolidamento ancora'));
        if (consolidated.length) checks.push(noCommit.length ? ck('info', `Commitment ancora da registrare: ${names(noCommit)}. Si può completare anche dopo la sessione.`) : ck('ok', 'Tutte le aziende consolidate hanno registrato il commitment'));
      }
    } else if (f.id === 'benchmark' && PROVA) {
      what = 'Nell\'ambiente DEMO il benchmark si calcola sempre sui dati DEMO e non si congela: dashboard, plenaria, mappe e report lo usano così com\'è. In produzione qui si congela la versione ufficiale.';
      extra = `<div class="row"><a class="btn ghost" href="/plenaria/${s.base}" target="_blank">Apri la plenaria</a><a class="btn ghost" href="/mappe/${s.base}" target="_blank">Mappe a quadranti</a></div>`;
    } else if (f.id === 'benchmark') {
      what = `Congelare salva una versione datata del benchmark: è quella che entra nei report e non cambia più. Entrano solo aziende REALI con consenso; sotto ${SC.benchmark.minN} aziende il confronto non si mostra.`;
      checks.push(frozen ? ck(benchDone ? 'ok' : 'warn', `Ultima versione: <b>${esc(frozen.label)}</b>, ${frozen.n_companies} aziende, ${fmtDate(frozen.created_at)}${benchDone ? '' : '. Ci sono consolidamenti successivi: congela di nuovo per includerli.'}`) : ck('warn', 'Nessuna versione congelata per questa sessione'));
      if (frozen && frozen.n_companies < SC.benchmark.minN) checks.push(ck('info', `Con ${frozen.n_companies} aziende il confronto non compare nei report: servono almeno ${SC.benchmark.minN}.`));
      extra = `<div class="row"><button class="primary" id="freeze">Congela il benchmark ora</button><a class="btn ghost" href="/plenaria/${s.base}" target="_blank">Apri la plenaria</a><a class="btn ghost" href="/mappe/${s.base}" target="_blank">Mappe a quadranti</a><a class="btn ghost" href="/live/${s.id}" target="_blank">Dashboard live</a></div>`;
    } else if (f.id === 'report') {
      what = 'Rilasciare salva una copia del report che l\'azienda vede dal link del referente e che non cambierà più. Conviene congelare prima il benchmark, così il report contiene il confronto.';
      if (!benchDone) checks.push(ck('warn', 'Il benchmark non è aggiornato: <button class="link" data-goto="benchmark">congelalo prima</button>.'));
      extra = consolidated.length ? `<ul class="todo">${consolidated.map((c) => `<li><div><b>${esc(c.name)}</b><div class="small muted"><a href="/report/${c.id}" target="_blank">Bozza</a> · <a href="/api/admin/pdf/${c.id}">PDF</a></div></div>
          ${c.report_released_at ? `<div class="row"><span class="tag ok">Rilasciato ${fmtDate(c.report_released_at)}</span><button class="sm ghost" data-release="${c.id}" title="Crea una nuova versione marcata come tale">Nuova versione</button></div>` : `<button class="sm" data-release="${c.id}">Rilascia</button>`}</li>`).join('')}</ul>
        <div class="row" style="margin-top:12px"><button class="sm ghost" id="zipbtn">Scarica tutti i PDF (zip)</button></div>` : '<p class="muted">Nessuna azienda ha ancora consolidato.</p>';
    } else {
      what = 'Nella call il leader dell\'azienda discute il report, a partire dalle regole di coerenza da esaminare. Annota l\'esito: resta nella scheda dell\'azienda.';
      extra = released.length ? `<ul class="todo">${released.map((c) => `<li><div><b>${esc(c.name)}</b>${c.leader_call_note ? `<div class="small ink2">${esc(c.leader_call_note)}</div>` : '<div class="small muted">Esito non ancora annotato</div>'}</div>
          <div class="row">${c.transcript_chars ? '<span class="tag ok">trascrizione nel report</span>' : ''}<button class="sm ghost" data-transcript="${c.id}">${c.transcript_chars ? 'Sostituisci trascrizione' : 'Incolla trascrizione Teams'}</button>
          <button class="sm ${c.leader_call_note ? 'ghost' : ''}" data-note="${c.id}">${c.leader_call_note ? 'Modifica esito' : 'Annota esito'}</button></div></li>`).join('')}</ul>` : '<p class="muted">Le call si fanno dopo il rilascio dei report.</p>';
    }

    // ---- azione di fase (solo sul passo in corso)
    let action = '';
    const nx = NEXT[s.phase];
    // il giorno della sessione il team apre la scheda «In sala»: lì c'è anche il pulsante per aprire le risposte individuali
    const here = f.phase === s.phase || (s.phase === 'preparazione' && f.id === 'individuale');
    if (here && nx && s.phase === 'preparazione' && !cos.length) {
      action = `<div class="fp-action"><h4>Passo successivo</h4><p class="ink2">Per aprire le risposte individuali serve almeno un'azienda: <a href="#/aziende">aggiungila</a>.</p></div>`;
    } else if (here && nx) {
      const warnNow = s.phase === 'individuale' && totP > totS ? `<p class="small" style="color:var(--warn)">${totP - totS === 1 ? 'Un partecipante non ha' : `${totP - totS} partecipanti non hanno`} ancora premuto Invia: le risposte già date verranno considerate così come sono.</p>`
        : s.phase === 'consolidamento' && inRoom.some((c) => !c.consolidated_at) ? `<p class="small" style="color:var(--warn)">Alcune aziende non hanno consolidato: dopo la chiusura dovrai riaprire il consolidamento o correggere da ELIS.</p>`
        : s.phase === 'preparazione' && s.date && s.date > isoDay(new Date()) ? `<p class="small" style="color:var(--warn)">La sessione è il ${esc(longDate(s.date))}: apri le risposte individuali solo in sala, quando i partecipanti sono pronti.</p>` : '';
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
      : (backFrom && idx >= 2 && idx - 1 <= 1 ? '<p class="small muted" style="margin-top:14px">Dopo il confronto non si torna alle risposte individuali. Per un\'azienda che deve rifare la rilevazione usa una sessione ad hoc.</p>' : '');

    // una sola scheda «in corso»: quella della fase attuale (dopo la chiusura, il follow up)
    const nowTab = TABS.find((t) => t.steps.includes(FLOW[Math.min(idx, 4)]?.id))?.id;
    const tabState = (t) => { if (!t.steps.length) return ''; const st = t.steps.map((x) => state(FLOW.find((f2) => f2.id === x))); return st.every((x) => x === 'done') ? 'done' : st.includes('now') && (t.id === nowTab || idx >= 4) ? 'now' : ''; };
    const results = `<div class="grid c3">
        <div class="card"><h3>Dashboard live</h3><p class="small ink2">Il benchmark in tempo reale, da proiettare in sala mentre le aziende consolidano.</p><a class="btn sm" href="/live/${s.id}" target="_blank">Apri la dashboard</a></div>
        <div class="card"><h3>Plenaria</h3><p class="small ink2">Come si posiziona la community, con le mappe del bisogno e del peer matching. Solo dati aggregati.</p><a class="btn sm" href="/plenaria/${s.base}" target="_blank">Apri la plenaria</a></div>
        <div class="card"><h3>Mappe a quadranti</h3><p class="small ink2">Le tre mappe della nota, compresa la vista azienda per azienda, con i nomi delle aziende (pagina riservata, non da proiettare).</p><a class="btn sm" href="/mappe/${s.base}" target="_blank">Apri le mappe</a></div></div>
      <div class="card"><h2>Versioni del benchmark</h2>${PROVA ? '<p class="muted" style="margin:0">Nell\'ambiente DEMO il benchmark si calcola sui dati DEMO e non si congela.</p>'
        : C.benchmark.length ? `<table><thead><tr><th>Versione</th><th class="num">Aziende</th><th>Creata</th></tr></thead><tbody>${C.benchmark.map((v) => `<tr><td>${esc(v.label)}</td><td class="num">${v.n_companies}</td><td>${fmtDate(v.created_at)}</td></tr>`).join('')}</tbody></table>`
        : '<p class="muted" style="margin:0">Nessuna versione congelata: si congela nella scheda Follow up.</p>'}</div>`;
    const T2 = TABS.find((t) => t.id === tab);
    // navigazione tra le schede: Indietro / Avanti in fondo, scorciatoie da tastiera 1–4 e frecce
    const ti = TABS.indexOf(T2), prevT = TABS[ti - 1], nextT = TABS[ti + 1];
    const tabnav = `<nav class="tabnav" aria-label="Schede della sessione">${prevT ? `<button type="button" class="ghost" data-tab="${prevT.id}">${icon('back')} ${esc(prevT.label)}</button>` : '<span></span>'}
      <span class="small muted kbdhint">Scorciatoie: <kbd>1</kbd>–<kbd>4</kbd> per le schede, <kbd>←</kbd> <kbd>→</kbd> per passare alla precedente o alla successiva</span>
      ${nextT ? `<button type="button" class="ghost" data-tab="${nextT.id}">${esc(nextT.label)} <span aria-hidden="true">→</span></button>` : '<span></span>'}</nav>`;
    app.innerHTML = `<a class="back" href="#/programma">${icon('back')} Programma</a>
      <div class="pagehead"><div><h1>${esc(s.title)}</h1><p class="small">Domande della sessione: ${esc(C.def.items.map((i) => `${i} ${INST.items[i].title}`).join(' · '))}</p></div>
        <div class="row shortcuts" aria-label="Collegamenti rapidi"><a class="btn sm ghost" href="#/tavoli/${s.id}">QR delle aziende</a><a class="btn sm ghost" href="/live/${s.id}" target="_blank">Dashboard live</a>
          <a class="btn sm ghost" href="/plenaria/${s.base}" target="_blank">Plenaria</a><a class="btn sm ghost" href="/mappe/${s.base}" target="_blank">Mappe</a><a class="btn sm ghost" href="#/report">Report e call</a><a class="btn sm ghost" href="#/domande/${s.base}">Domande</a></div></div>
      <div class="tabs" role="tablist" aria-label="Momenti della sessione">${TABS.map((t) => `<button type="button" role="tab" class="tab ${tabState(t)} ${t.id === tab ? 'on' : ''}" aria-selected="${t.id === tab}" data-tab="${t.id}">
        <span class="tdot" aria-hidden="true">${tabState(t) === 'done' ? icon('check') : ''}</span>${esc(t.label)}${tabState(t) === 'now' ? '<span class="sr-only"> (in corso)</span>' : ''}</button>`).join('')}</div>
      ${tab === 'risultati' ? results : `
      ${T2.steps.length > 1 ? `<div class="substeps">${T2.steps.map((x) => { const fx = FLOW.find((f2) => f2.id === x); const stx = state(fx); return `<button type="button" class="fstep ${stx} ${x === sel ? 'sel' : ''}" data-step="${x}" ${x === sel ? 'aria-current="step"' : ''}>
          <span class="fnum" aria-hidden="true">${stx === 'done' ? icon('check') : FLOW.indexOf(fx) + 1}</span><span class="ftxt"><b>${esc(fx.title)}</b><small>${summary[x]}</small></span></button>`; }).join('')}</div>` : ''}
      <section class="card flowpanel" aria-live="polite">
        <div class="fp-head"><div><div class="small muted">${esc(f.group)}</div><h2>${esc(f.title)}</h2></div>${chip}</div>
        <p class="lede">${what}</p>
        ${checks.length ? `<ul class="checks">${checks.join('')}</ul>` : ''}
        ${extra}
        ${action}${back}
      </section>`}
      ${tab === 'risultati' ? '' : s.phase === 'preparazione' ? prepTable() : `<div class="card"><h2>Aziende in questa sessione</h2><div class="tablewrap"><table>
        <thead><tr><th>Azienda</th><th class="num">Partecipanti</th><th>Risposte</th><th>Funzioni</th><th>Consolidato</th><th>Follow up</th><th><span class="sr-only">Azioni</span></th></tr></thead>
        <tbody>${cos.filter((c) => c.participants || c.consolidated_at).map(row).join('') || `<tr><td colspan="7" class="muted">${cos.length ? 'Nessuna azienda ancora attiva in questa sessione.' : 'Nessuna azienda: aggiungile da <a href="#/aziende">Aziende e referenti</a>.'}</td></tr>`}</tbody></table></div>
        ${cos.some((c) => !(c.participants || c.consolidated_at)) ? `<details style="margin-top:10px"><summary class="small">Altre aziende censite (${cos.filter((c) => !(c.participants || c.consolidated_at)).length})</summary><table><tbody>${cos.filter((c) => !(c.participants || c.consolidated_at)).map(row).join('')}</tbody></table></details>` : ''}</div>`}
      ${tabnav}`;

    const reload = async () => { C = await api(`/api/admin/sessions/${id}/control`); draw(); };
    $$('[data-step]').forEach((b) => b.onclick = () => { sel = b.dataset.step; confirming = false; draw(); });
    // preparazione: email al referente (bozza nel programma di posta) e QR della sessione
    $$('[data-mail]').forEach((a) => a.addEventListener('click', () => { mailed.add(Number(a.dataset.mail)); setTimeout(draw, 300); }));
    $$('[data-unmail]').forEach((b) => b.onclick = () => { mailed.delete(Number(b.dataset.unmail)); draw(); });
    $$('[data-invited]').forEach((b) => b.onclick = async () => {
      try { await api(`/api/admin/sessions/${id}/companies/${b.dataset.invited}/invited`, { method: 'POST', body: {} }); mailed.delete(Number(b.dataset.invited)); toast('Email segnata come inviata'); await reload(); }
      catch (e) { toast(e.message, true); }
    });
    const genQr = async (companyId) => {
      const msg = `${companyId ? 'Generare il QR di questa azienda?' : `Generare i QR di ${C.session.title} per tutte le aziende con referente?`} Da questo momento il referente non si potrà cambiare né il suo link rigenerare fino alla chiusura della sessione, se non come eccezione con un motivo scritto nel registro modifiche.`;
      if (!await ask(msg)) return;
      try { const r = await api(`/api/admin/sessions/${id}/qr`, { method: 'POST', body: companyId ? { companyId } : {} }); toast(r.generated ? `QR generati: ${r.generated}` : 'Nessun QR nuovo da generare'); await reload(); }
      catch (e) { toast(e.message, true); }
    };
    $$('[data-genqr]').forEach((b) => b.onclick = () => genQr(Number(b.dataset.genqr)));
    if ($('#genqr')) $('#genqr').onclick = () => genQr(null);
    const goTab = (t) => { tab = t; sel = null; confirming = false; history.replaceState(null, '', `#/sessione/${s.id}/${tab}`); draw(); scrollTo({ top: 0 }); };
    $$('[data-tab]').forEach((b) => b.onclick = () => goTab(b.dataset.tab));
    // scorciatoie: 1–4 aprono le schede, ← → la precedente o la successiva (mai mentre si scrive in un campo)
    keyHandler = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input, textarea, select, [contenteditable], dialog')) return;
      const i = TABS.findIndex((t) => t.id === tab);
      const to = /^[1-4]$/.test(e.key) ? TABS[Number(e.key) - 1] : e.key === 'ArrowLeft' ? TABS[i - 1] : e.key === 'ArrowRight' ? TABS[i + 1] : null;
      if (to && to.id !== tab) { e.preventDefault(); goTab(to.id); }
    };
    $$('[data-goto]').forEach((b) => b.onclick = () => { sel = b.dataset.goto; tab = TABS.find((t) => t.steps.includes(sel)).id; draw(); });
    if ($('#nextphase')) $('#nextphase').onclick = () => { confirming = true; draw(); $('#yes')?.focus(); };
    if ($('#no')) $('#no').onclick = () => { confirming = false; draw(); };
    if ($('#yes')) $('#yes').onclick = async () => {
      try { await api(`/api/admin/sessions/${s.id}/phase`, { method: 'PUT', body: { phase: nx.to } }); confirming = false; sel = null; tab = null; toast('Fase aggiornata'); await reload(); buildNav('sessione', String(s.id)); }
      catch (e) { toast(e.message, true); }
    };
    if ($('#goback')) $('#goback').onclick = async () => {
      const reason = $('#backreason').value.trim();
      if (!reason) { toast('Indica il motivo per tornare indietro', true); $('#backreason').focus(); return; }
      try { await api(`/api/admin/sessions/${s.id}/phase`, { method: 'PUT', body: { phase: prev.id, reason } }); sel = null; tab = null; toast(`Tornati a: ${prev.label}`); await reload(); buildNav('sessione', String(s.id)); }
      catch (e) { toast(e.message, true); }
    };
    if ($('#zipbtn')) $('#zipbtn').onclick = async () => {
      const url = `/api/admin/sessions/${s.id}/pdfs.zip`;
      const res = await fetch(url);
      if (res.status === 409) { const e = await res.json(); if (await ask(`${e.error}\n\nScaricare comunque?`)) location.href = `${url}?force=1`; return; }
      if (!res.ok) { const e = await res.json().catch(() => ({})); toast(e.error || 'Errore', true); return; }
      const name = (res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'AITO_Map_report.zip';
      const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = name; a.click();
    };
    if ($('#freeze')) $('#freeze').onclick = async () => {
      if (!await ask('Congelare una nuova versione del benchmark con i dati consolidati attuali? Le versioni già usate nei report non cambiano.')) return;
      try { const r = await api(`/api/admin/benchmark/${s.base}/freeze`, { method: 'POST' }); toast(`Congelata: ${r.label} (N=${r.n})`); await reload(); } catch (e) { toast(e.message, true); }
    };
    $$('[data-release]').forEach((b) => b.onclick = async () => { b.disabled = true; await releaseReport(s.id, Number(b.dataset.release)); await reload(); });
    $$('[data-note]').forEach((b) => b.onclick = async () => { if (await noteCall(s.id, C.companies.find((x) => x.id === Number(b.dataset.note)))) await reload(); });
    $$('[data-transcript]').forEach((b) => b.onclick = async () => { if (await transcriptDialog(s.id, C.companies.find((x) => x.id === Number(b.dataset.transcript)))) await reload(); });
  };
  // una riga per azienda: segni compatti (data nel titolo), azioni raggruppate a fine riga
  const yes = (when) => `<span class="tag ok" title="${when ? `Fatto il ${esc(fmtDate(when))}` : 'Fatto'}">${icon('check')}<span class="sr-only">sì</span></span>`;
  const row = (c) => `<tr>
    <td><b>${esc(c.name)}</b> ${c.kind !== 'REALE' ? `<span class="tag outline warn">${esc(c.kind)}</span>` : ''}<div class="small">${c.referents.map((r) => `<a href="/r/${r.token}" target="_blank">referente: ${esc(r.name)}</a>`).join('<br>') || '<span class="muted">nessun referente</span>'}</div></td>
    <td class="num">${c.participants}${c.participants ? `<span class="muted small"> · ${c.submitted} ${c.submitted === 1 ? 'inviato' : 'inviati'}</span>` : ''}</td>
    <td class="small">${c.expected ? `${c.answered}/${c.expected}` : '<span class="muted">—</span>'}</td>
    <td class="small">${c.functions.length || '<span class="muted">—</span>'}${c.participants && c.functions.length < 2 ? ' <span class="tag warn">1 sola</span>' : ''}</td>
    <td>${c.consolidated_at ? yes(c.consolidated_at) : '<span class="muted">—</span>'}</td>
    <td>${c.commitment ? yes() : '<span class="muted">—</span>'}${c.report_released_at ? ` <span class="tag ok">report</span>` : ''}${c.leader_call_note ? ' <span class="tag ok">call</span>' : ''}</td>
    <td class="actions"><a class="btn sm ${C.session.phase === 'consolidamento' && !c.consolidated_at ? '' : 'ghost'}" href="/tavolo-elis/${c.id}#/sessione/${C.session.id}" target="_blank" title="Partecipanti, confronto e consolidamento di ${esc(c.name)}">Apri il tavolo<span class="sr-only"> di ${esc(c.name)} (si apre in una nuova scheda)</span></a>${c.consolidated_at ? `<a class="btn sm ghost" href="/report/${c.id}" target="_blank">Report</a><a class="btn sm ghost" href="/api/admin/pdf/${c.id}">PDF</a>` : ''}<a class="btn sm ghost" href="#/tavolo/${C.session.id}:${c.id}">QR</a></td></tr>`;
  draw();
  stopPoll = poll(async () => {
    const n = await api(`/api/admin/sessions/${id}/control`);
    if (JSON.stringify(n) !== JSON.stringify(C)) { C = n; const a = document.activeElement; if (!confirming && (!a || a === document.body || a.dataset?.step)) draw(); }
  }, 4000);
}

// Un QR per azienda: chi lo inquadra è già abbinato alla sua azienda. Il nome è scritto sotto il QR.
const qrFile = (C, c) => {
  const n = c.name.normalize('NFD').replace(/[^\w-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return `QR_${C.session.base}_${n || c.joinCode}.png`;
};
const tableCard = (C, c, size) => {
  const url = `${C.joinUrl}?c=${c.joinCode}`;
  return `<div class="tablecard"><div class="small muted">AI Transformation & Adoption Map · ${esc(C.session.title)}</div>${qrLabeled(url, c.name, size)}
    <p>Inquadra il QR con la fotocamera: entri già nella tua azienda.</p>
    <p class="small tcode">Codice azienda: <b class="mono">${esc(c.joinCode)}</b></p>
    <p class="small tfallback">Se il QR non si apre: vai su <span class="mono">${esc(C.joinUrl.replace(/^https?:\/\//, ''))}</span> e inserisci il codice.</p>
    <p class="noprint"><button class="sm ghost" data-png="${c.id}">Scarica il QR (immagine PNG)</button></p></div>`;
};
const bindPng = (C, cs) => $$('[data-png]').forEach((b) => b.onclick = async () => {
  const c = cs.find((x) => x.id === Number(b.dataset.png));
  b.disabled = true;
  try { await downloadQrPng(`${C.joinUrl}?c=${c.joinCode}`, c.name, `AI Transformation & Adoption Map · ${C.session.title} · codice ${c.joinCode}`, qrFile(C, c)); }
  catch { toast('Immagine non generata: riprova', true); }
  finally { b.disabled = false; }
});

// Tutti i QR delle aziende di una sessione, da stampare in una volta o scaricare uno per uno
async function viewTables(sid) {
  const C = await api(`/api/admin/sessions/${sid}/control`);
  const all = C.companies.filter((c) => c.kind !== 'DEMO' || C.session.seeded);
  const cs = all.filter((c) => c.qr_generated_at), missing = all.filter((c) => !c.qr_generated_at);
  app.innerHTML = `<p class="noprint"><a class="back" href="#/sessione/${sid}">${icon('back')} Control room</a></p>
    <div class="pagehead noprint"><div><h1>QR delle aziende</h1><p>Un QR per azienda, con il nome scritto sotto: chi lo inquadra è già abbinato alla sua azienda e non deve scegliere né digitare nulla. Mettilo sul tavolo o mandalo al referente come immagine.</p></div></div>
    ${missing.length ? `<div class="banner warn noprint">QR non ancora generati per: ${missing.map((c) => esc(c.name)).join(', ')}. Si generano dalla <a href="#/sessione/${sid}/prima">control room</a> (passo 4), dopo aver indicato il referente.</div>` : ''}
    ${cs.length ? `<div class="row noprint" style="margin-bottom:16px"><button onclick="print()">Stampa ${cs.length} ${cs.length === 1 ? 'cartoncino' : 'cartoncini'}</button></div>
      <div class="tablecards">${cs.map((c) => tableCard(C, c, 220)).join('')}</div>` : '<div class="card"><p class="muted" style="margin:0">Nessun QR generato per questa sessione.</p></div>'}`;
  bindPng(C, cs);
}

async function viewQr(id) {
  const C = await api(`/api/admin/sessions/${id}/control`);
  app.innerHTML = `<div class="qrfull"><div><h1>${esc(C.session.title)}</h1>
    <p style="font-size:1.2rem">Se sul tavolo c'è il QR della tua azienda, usa quello.<br>Altrimenti inquadra questo e inserisci il codice della tua azienda.</p>
    <div style="margin:18px auto">${qrImg(C.joinUrl, 420)}</div><div class="url">${esc(C.joinUrl)}</div>
    <p><a href="#/sessione/${id}">chiudi</a></p></div></div>`;
}

async function viewTableCard(arg) {
  const [sid, cid] = arg.split(':').map(Number);
  const C = await api(`/api/admin/sessions/${sid}/control`);
  const c = C.companies.find((x) => x.id === cid);
  if (!c || !c.qr_generated_at) { app.innerHTML = `<p><a href="#/tavoli/${sid}">${icon('back')} QR delle aziende</a></p><div class="card"><p>${c ? 'Il QR di questa azienda non è ancora stato generato: si genera dalla control room (passo 4).' : 'Azienda non trovata in questa sessione.'}</p></div>`; return; }
  app.innerHTML = `<p class="noprint"><a href="#/tavoli/${sid}">${icon('back')} QR delle aziende</a> · <button class="sm" onclick="print()">Stampa</button></p>
    <div class="single">${tableCard(C, c, 280)}</div>`;
  bindPng(C, [c]);
}

// ---------- Aziende ----------
// Elenchi per perimetro e settore; "Altro" apre un campo libero. I nomi dei settori sono quelli dei dati DEMO.
const PERIMETERS = ['Gruppo', 'Società', 'Business unit / divisione'];
const SECTORS = ['Assicurazioni', 'Banche', 'Consulenza', 'Difesa', 'Energia', 'Farmaceutico', 'ICT e digitale', 'Infrastrutture', 'Logistica',
  'Manifattura', 'Media', 'Pubblica amministrazione', 'Retail', 'Sanità', 'Servizi', 'Telecomunicazioni', 'Trasporti', 'Utility'];
const pick = (id, label, list, value = '') => {
  const other = value && !list.includes(value);
  return `<div><label class="f" for="${id}">${label}</label><select id="${id}" data-pick>
      <option value="">— Seleziona —</option>${list.map((x) => `<option ${x === value ? 'selected' : ''}>${esc(x)}</option>`).join('')}<option value="__altro" ${other ? 'selected' : ''}>Altro…</option></select>
    <input type="text" id="${id}_altro" class="${other ? '' : 'hidden'}" style="margin-top:6px" maxlength="100" placeholder="Scrivi ${label.toLowerCase()}" aria-label="${label}: altro" value="${other ? esc(value) : ''}"></div>`;
};
const pickValue = (id) => ($(`#${id}`).value === '__altro' ? $(`#${id}_altro`).value.trim() : $(`#${id}`).value);
const bindPick = () => $$('[data-pick]').forEach((sel) => sel.onchange = () => {
  const t = $(`#${sel.id}_altro`); t.classList.toggle('hidden', sel.value !== '__altro'); if (sel.value === '__altro') t.focus();
});

async function viewCompanies() {
  const cs = await api('/api/admin/companies');
  app.innerHTML = `<div class="pagehead"><div><h1>Aziende e referenti</h1><p>${PROVA ? 'Aziende dell\'ambiente DEMO: le nuove aziende create qui sono di tipo TEST e si cancellano con i dati DEMO.' : 'Le aziende del programma. Le aziende TEST seguono il flusso vero ma restano sempre fuori dal benchmark.'}</p></div></div>
    <div class="card"><h2>Nuova azienda</h2><div class="grid c4">
      <div><label class="f" for="n_name">Nome *</label><input type="text" id="n_name"></div>
      ${pick('n_per', 'Perimetro valutato', PERIMETERS)}
      ${pick('n_sec', 'Settore', SECTORS)}
      <div><label class="f" for="n_kind">Tipo</label><select id="n_kind" aria-describedby="n_kind_h" ${PROVA ? 'disabled' : ''}>${PROVA ? '<option value="TEST">TEST (ambiente DEMO)</option>' : '<option value="REALE">REALE</option><option value="TEST">TEST (prova del flusso, fuori benchmark)</option>'}</select></div></div>
      <div class="kind-help" id="n_kind_h">${PROVA ? '<p><span class="chip chip-off">TEST</span> In DEMO le aziende nuove sono sempre di prova: restano separate dalla Produzione e non entrano mai nel benchmark ufficiale.</p>'
        : `<p><span class="chip chip-done">REALE</span> Un'azienda del programma AITO 2026-27. Con il suo consenso, i suoi dati entrano nel benchmark della community.</p>
        <p><span class="chip chip-off">TEST</span> Un'azienda per provare il flusso (per esempio un'azienda amica). Usa le stesse pagine, ma non entra mai nel benchmark.</p>`}</div>
      <div style="margin-top:12px"><button id="n_go">Aggiungi</button></div></div>
    ${cs.length > 5 ? `<div class="tablesearch"><label class="sr-only" for="q_az">Cerca un'azienda</label><input type="search" id="q_az" placeholder="Cerca per nome, perimetro o referente"><span class="small muted" id="q_az_n" aria-live="polite">${cs.length} aziende</span></div>` : ''}
    <div class="card"><div class="tablewrap"><table><thead><tr><th>Azienda</th><th>Tipo</th><th>Perimetro</th><th>Consensi</th><th>Referenti</th></tr></thead><tbody>
      ${cs.length ? '' : '<tr><td colspan="5" class="muted">Nessuna azienda: aggiungila qui sopra.</td></tr>'}
      ${cs.map((c) => `<tr data-q="${esc(`${c.name} ${c.perimeter || ''} ${c.sector || ''} ${c.kind} ${c.referents.map((r) => r.name).join(' ')} ${c.join_code || ''}`.toLowerCase())}"><td><a href="#/azienda/${c.id}"><b>${esc(c.name)}</b></a></td><td><span class="tag outline ${c.kind === 'REALE' ? 'ok' : 'warn'}">${esc(c.kind)}</span></td><td class="small">${esc(c.perimeter || '—')}</td>
        <td><div class="consents">${[['benchmark', 'Benchmark'], ['peer', 'Peer matching'], ['testimonianza', 'Testimonianza'], ['followup', 'Follow-up']].map(([k, l]) => `<span class="cdot ${c.consents[k]?.granted ? 'yes' : ''}" title="${l}: ${c.consents[k]?.granted ? 'sì' : 'no'}">${l.charAt(0)}<span class="sr-only">${l}: ${c.consents[k]?.granted ? 'sì' : 'no'}</span></span>`).join('')}</div></td>
        <td class="small">${c.referents.map((r) => esc(r.name)).join('<br>') || '<span class="muted">nessun referente</span>'}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  bindPick();
  bindSearch('#q_az', '#q_az_n', 'aziende');
  $('#n_go').onclick = async () => {
    try { const r = await api('/api/admin/companies', { method: 'POST', body: { name: $('#n_name').value, perimeter: pickValue('n_per'), sector: pickValue('n_sec'), kind: $('#n_kind').value } }); location.hash = `#/azienda/${r.id}`; }
    catch (e) { toast(e.message, true); }
  };
}

async function viewCompany(id) {
  const cs = await api('/api/admin/companies');
  const c = cs.find((x) => x.id === Number(id));
  const R = await api(`/api/admin/report/${id}`);
  const J = await api(`/api/admin/companies/${id}/journey`);
  const lock = J.find((x) => x.qr_generated_at && x.phase !== 'chiusa'); // referente bloccato dai QR della sessione
  const stp = (ok, label, title = '') => `<li class="${ok ? 'ok' : ''}" title="${esc(title)}"><span aria-hidden="true">${ok ? icon('check') : ''}</span>${label}</li>`;
  const journey = `<div class="card"><h2>Percorso nelle sessioni</h2><div class="journey">${J.filter((x) => x.mode === 'workshop' || x.consolidated_at || x.participants).map((x) => `<div class="jcol ph-${x.phase}">
      <a href="#/sessione/${x.id}"><b>${esc(INST.sessions.find((k) => k.id === x.base).name)}</b></a><small>${esc(x.mode === 'adhoc' ? 'ad hoc · ' : '')}${esc(shortDate(x.date))}</small>
      <ul>${stp(x.participants, `Partecipanti${x.participants ? `: ${x.participants}` : ''}`)}${stp(x.consolidated_at, 'Consolidamento')}${stp(x.commitment, `Commitment${x.commitment ? `: ${esc(x.commitment.priority_item)} · ${esc(x.commitment.status)}` : ''}`)}${stp(x.report_released_at, 'Report rilasciato')}${stp(x.leader_call_note, 'Call con il leader', x.leader_call_note)}</ul></div>`).join('')}</div></div>`;
  app.innerHTML = `<a class="back" href="#/aziende">${icon('back')} Aziende e referenti</a>
    <div class="pagehead"><div><h1>${esc(c.name)}</h1><p>${esc(c.perimeter || 'Perimetro non indicato')} · ${esc(c.sector || 'settore non indicato')} · <span class="tag ${c.kind === 'REALE' ? 'ok' : 'warn'}">${esc(c.kind)}</span> · codice <span class="mono">${esc(c.join_code)}</span></p></div>
      <a class="btn sm ghost" href="/report/${c.id}" target="_blank">Report</a></div>
    ${journey}
    <details class="card"><summary>Dati dell'azienda</summary><div class="grid c4" style="margin-top:8px">
      <div><label class="f" for="e_name">Nome</label><input type="text" id="e_name" value="${esc(c.name)}"></div>
      ${pick('e_per', 'Perimetro', PERIMETERS, c.perimeter || '')}
      ${pick('e_sec', 'Settore', SECTORS, c.sector || '')}
      <div><label class="f" for="e_kind">Tipo</label><select id="e_kind" ${PROVA ? 'disabled' : ''}>${(c.kind === 'DEMO' ? ['DEMO'] : PROVA ? [c.kind] : ['REALE', 'TEST']).map((k) => `<option ${c.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div></div>
      <div style="margin-top:12px"><button id="e_save">Salva</button></div></details>
    <div class="grid c2">
      <div class="card"><h2>Consensi</h2><p class="small muted">Distinti e revocabili. Alla creazione dell'azienda sono tutti concessi: togli la spunta solo se l'azienda ne nega uno. Senza consenso al benchmark l'azienda riceve comunque il proprio report ma non entra nelle distribuzioni.</p>
        ${['benchmark', 'peer', 'testimonianza', 'followup'].map((k) => `<label class="check"><input type="checkbox" data-consent="${k}" ${c.consents[k]?.granted ? 'checked' : ''}> ${{ benchmark: 'Benchmark anonimo', peer: 'Peer matching', testimonianza: 'Testimonianza', followup: 'Follow-up' }[k]} <span class="small muted">${c.consents[k] ? fmtDate(c.consents[k].at) : ''}</span></label>`).join('')}</div>
      <div class="card"><h2>Referenti</h2>
        ${lock ? `<div class="banner info">Referente bloccato: i QR di <b>${esc(lock.title)}</b> sono stati generati il ${fmtDate(lock.qr_generated_at)}. Fino alla chiusura della sessione il referente si cambia, o il link si revoca, solo come eccezione con un motivo scritto nel registro modifiche. L'email si può sempre correggere.
          <div style="margin-top:8px"><button class="sm ghost" id="undoqr">QR generato per errore? Annullalo</button></div></div>` : ''}
        ${c.referents.map((r) => `<div class="card flat"><div class="row between"><b>${esc(r.name)}</b><div class="row"><button class="sm ghost" data-email="${r.id}" data-cur="${esc(r.email || '')}">${r.email ? 'Correggi email' : 'Aggiungi email'}</button><button class="sm ghost" data-regen="${r.id}" title="Disattiva il link attuale e ne crea uno nuovo">Rigenera link</button><button class="sm danger" data-delref="${r.id}">Elimina</button></div></div>
          <div class="small muted">${esc(r.role || '')} ${esc(r.email || '')}</div>
          <div class="row" style="margin-top:6px"><input type="text" readonly value="${esc(NET.baseUrl)}/r/${esc(r.token)}" class="mono small"><button class="sm ghost" data-copy="${esc(NET.baseUrl)}/r/${esc(r.token)}">Copia link</button></div>
          <details><summary class="small">QR del link referente</summary>${qrImg(`${NET.baseUrl}/r/${r.token}`, 160)}</details></div>`).join('') || '<p class="muted">Nessun referente.</p>'}
        <div class="grid c2"><div><label class="f" for="r_name">Nome e cognome *</label><input type="text" id="r_name" maxlength="120"></div><div><label class="f" for="r_func">Funzione *</label><select id="r_func"><option value="">— Scegli —</option>${INST.functions.map((f) => `<option value="${f.id}">${esc(f.label)}</option>`).join('')}</select></div><div><label class="f" for="r_role">Ruolo (facoltativo)</label><input type="text" id="r_role" maxlength="120"></div><div><label class="f" for="r_email">Email</label><input type="email" id="r_email" maxlength="200"></div></div>
        <div style="margin-top:8px"><button class="sm" id="r_add">Aggiungi referente</button></div>
        <p class="small muted">Il referente entra anche tra le persone iscritte, con la sua funzione: in sala risponde come gli altri, scegliendo il suo nome. Il link è personale: chi lo possiede vede le domande, consolida per l'azienda e legge i report.</p></div>
    </div>
    <div class="card"><h2>Persone iscritte <span class="muted" style="font-family:var(--font);font-weight:600">${c.roster.length}</span></h2>
      <p class="small ink2">Chi partecipa alle sessioni per l'azienda, referente compreso se risponde anche lui. In sala, dopo il QR, ognuno sceglie il proprio nome da questo elenco; chi manca si aggiunge dal telefono. Solo nome e funzione.</p>
      ${c.roster.length ? `<table><tbody>${c.roster.map((r) => `<tr><td><b>${esc(r.name)}</b>${c.referents.some((x) => x.name.trim().toLowerCase() === r.name.trim().toLowerCase()) ? ' <span class="tag navy">referente</span>' : ''}</td>
        <td class="small muted">${esc(INST.functions.find((f) => f.id === r.func)?.label || r.func)}</td><td class="num"><button class="sm ghost" data-delroster="${r.id}" aria-label="Togli ${esc(r.name)} dall'elenco">Togli</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nessuna persona iscritta.</p>'}
      <div class="grid c3" style="margin-top:12px;align-items:end"><div><label class="f" for="p_name">Nome e cognome</label><input type="text" id="p_name" maxlength="120"></div>
        <div><label class="f" for="p_func">Funzione</label><select id="p_func"><option value="">— Scegli —</option>${INST.functions.map((f) => `<option value="${f.id}">${esc(f.label)}</option>`).join('')}</select></div>
        <div><button class="sm" id="p_add">Aggiungi persona</button></div></div></div>
    <div class="card"><h2>Commitment e verifica</h2><p class="small muted">Lo stato si aggiorna nella call con il leader e con l'item pulse della sessione successiva.</p><div id="commits"><p class="muted small">Caricamento…</p></div></div>
    <div class="card"><h2>Report rilasciati</h2><div id="snaps"><p class="muted small">Caricamento…</p></div></div>
    <div class="card"><h2>Valori consolidati correnti</h2>
      ${R.items.length ? `<table><thead><tr><th>Item</th><th>Livello</th><th class="num">Score</th><th>Affidabilità del dato</th><th></th></tr></thead><tbody>
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
  bindPick();
  $('#e_save').onclick = async () => { try { await api(`/api/admin/companies/${id}`, { method: 'PUT', body: { name: $('#e_name').value, perimeter: pickValue('e_per'), sector: pickValue('e_sec'), kind: $('#e_kind').value } }); toast('Salvato'); } catch (e) { toast(e.message, true); } };
  $$('[data-consent]').forEach((b) => b.onchange = async () => {
    const reason = await askText('Riferimento o motivo del cambio di consenso (es. "modulo firmato il 10/11", "revoca via email del 3/12")', '', { label: 'Motivo (resta nel registro modifiche)', required: true, ok: 'Conferma' });
    if (!reason) { b.checked = !b.checked; return; }
    try { await api(`/api/admin/companies/${id}/consent`, { method: 'PUT', body: { type: b.dataset.consent, granted: b.checked, reason } }); toast('Consenso aggiornato'); }
    catch (e) { b.checked = !b.checked; toast(e.message, true); }
  });
  // durante il blocco ogni cambio del referente è un'eccezione: si chiede il motivo, che resta nel registro modifiche
  const why = async () => { if (!lock) return ''; const m = await askText('Il referente è bloccato dai QR della sessione. Motivo dell\'eccezione (resta nel registro modifiche):', '', { label: 'Motivo (resta nel registro modifiche)', required: true, ok: 'Conferma' }); return m && m.trim() ? m.trim() : null; };
  $('#r_add').onclick = async () => { const reason = await why(); if (reason === null) return; try { await api(`/api/admin/companies/${id}/referents`, { method: 'POST', body: { name: $('#r_name').value, func: $('#r_func').value, role: $('#r_role').value, email: $('#r_email').value, reason } }); viewCompany(id); } catch (e) { toast(e.message, true); } };
  $('#p_add').onclick = async () => { try { await api(`/api/admin/companies/${id}/roster`, { method: 'POST', body: { name: $('#p_name').value, func: $('#p_func').value } }); viewCompany(id); } catch (e) { toast(e.message, true); } };
  $$('[data-delroster]').forEach((b) => b.onclick = async () => { const m = await askText('Togliere questa persona dall\'elenco? Le risposte già date restano. Motivo (resta nel registro modifiche):', '', { label: 'Motivo (resta nel registro modifiche)', required: true, ok: 'Conferma' }); if (!m || !m.trim()) return; try { await api(`/api/admin/roster/${b.dataset.delroster}`, { method: 'DELETE', body: { reason: m.trim() } }); viewCompany(id); } catch (e) { toast(e.message, true); } });
  $$('[data-email]').forEach((b) => b.onclick = async () => { const v = await askText('Un solo indirizzo: il referente riceve qui il suo link personale.', b.dataset.cur, { label: 'Email del referente', ok: 'Salva' }); if (v === null) return; try { await api(`/api/admin/referents/${b.dataset.email}/email`, { method: 'PUT', body: { email: v.trim() } }); viewCompany(id); } catch (e) { toast(e.message, true); } });
  if ($('#undoqr')) $('#undoqr').onclick = async () => { const m = await askText(`Annullare il QR di ${lock.title}? Si può solo se nessuno si è ancora registrato. Motivo (resta nel registro modifiche):`, '', { label: 'Motivo (resta nel registro modifiche)', required: true, ok: 'Conferma' }); if (!m || !m.trim()) return; try { await api(`/api/admin/sessions/${lock.id}/companies/${id}/qr`, { method: 'DELETE', body: { reason: m.trim() } }); toast('QR annullato: il referente si può di nuovo cambiare'); viewCompany(id); } catch (e) { toast(e.message, true); } };
  $$('[data-regen]').forEach((b) => b.onclick = async () => { if (!await ask('Il link attuale smetterà di funzionare. Creare un nuovo link per questo referente?')) return; const reason = await why(); if (reason === null) return; try { await api(`/api/admin/referents/${b.dataset.regen}/regenerate`, { method: 'POST', body: { reason } }); viewCompany(id); } catch (e) { toast(e.message, true); } });
  $$('[data-delref]').forEach((b) => b.onclick = async () => { if (!await ask('Eliminare il referente? Il suo link smetterà di funzionare.')) return; const reason = await why(); if (reason === null) return; try { await api(`/api/admin/referents/${b.dataset.delref}`, { method: 'DELETE', body: { reason } }); viewCompany(id); } catch (e) { toast(e.message, true); } });
  $$('[data-copy]').forEach((b) => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Link copiato'); } catch { await askText('Seleziona il testo e copialo.', b.dataset.copy, { label: 'Link', ok: 'Chiudi' }); } });
  $$('[data-fix]').forEach((b) => b.onclick = async () => {
    const it = b.dataset.fix;
    const lv = await askText('Scrivi un numero da 1 a 5; lascia vuoto per N.D. Il valore precedente resta nello storico.', '', { label: `${it}: nuovo livello`, ok: 'Avanti' }); if (lv === null) return;
    const subs = lv ? INST.items[it].levels.find((l) => l.level === Number(lv))?.sub : null;
    const sub = subs ? await askText(`Sotto-opzioni possibili: ${subs.map((s) => s.key).join(', ')}.`, subs[0].key, { label: 'Sotto-opzione', ok: 'Avanti' }) : null;
    const reason = await askText('Motivo della correzione (obbligatorio)', '', { label: 'Motivo (resta nel registro modifiche)', required: true, ok: 'Conferma' }); if (!reason) return;
    try { await api('/api/admin/correct', { method: 'POST', body: { companyId: Number(id), itemId: it, level: lv || null, sub, reason } }); toast('Valore corretto'); viewCompany(id); } catch (e) { toast(e.message, true); }
  });
}

// ---------- Benchmark ----------
async function viewBenchmark() {
  const vs = await api('/api/admin/benchmark');
  app.innerHTML = `<h1>Benchmark</h1>
    <div class="card"><p class="ink2">Ogni sessione produce una versione datata del benchmark che non cambia più. Un'azienda recuperata con una sessione ad hoc entra nella versione successiva. Mediana come centro, Q1–Q3 come fascia centrale, N sempre visibile: sotto ${SC.benchmark.minN} aziende non si mostra, tra ${SC.benchmark.minN} e ${SC.benchmark.stableN - 1} è "indicativo".</p>
      <div class="row">${INST.sessions.map((s) => `<button class="sm" data-freeze="${s.id}">Congela ${esc(s.name)}</button><a class="btn sm ghost" href="/plenaria/${s.id}" target="_blank">Plenaria ${esc(s.name)}</a>`).join('')}</div></div>
    <div class="card"><table><thead><tr><th>Versione</th><th class="num">N aziende</th><th>Strumento</th><th>Scoring</th><th>Creata</th></tr></thead><tbody>
      ${vs.map((v) => `<tr><td>${esc(v.label)}</td><td class="num">${v.n_companies}</td><td>${esc(v.instrument_version)}</td><td>${esc(v.scoring_version)}</td><td>${fmtDate(v.created_at)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nessuna versione.</td></tr>'}
    </tbody></table></div>`;
  $$('[data-freeze]').forEach((b) => b.onclick = async () => { if (!await ask('Congelare una nuova versione?')) return; const r = await api(`/api/admin/benchmark/${b.dataset.freeze}/freeze`, { method: 'POST' }); toast(`${r.label} · N=${r.n}`); viewBenchmark(); });
}

// ---------- Mappe a quadranti ----------
async function viewMaps() {
  const vs = await api('/api/admin/benchmark');
  app.innerHTML = `<h1>Mappe a quadranti</h1>
    <p class="lede" style="margin-bottom:20px">Una pagina per sessione con le tre mappe della nota: dove intervenire, se il bisogno è individuale o condiviso, con chi accelerare. Usano l'ultima versione congelata del benchmark (nell'ambiente DEMO, i dati dimostrativi). I nomi delle aziende sono nascosti finché non li mostri.</p>
    <div class="grid c2">${INST.sessions.map((s) => { const v = vs.find((x) => x.base === s.id); const dims = s.dimensions.map((d) => INST.dimensions.find((x) => x.id === d));
      return `<div class="card sesscard"><h2 style="margin:0">${esc(s.name)}</h2>
        <p class="small muted" style="margin:4px 0 12px">${dims.map((d) => `${d.id} ${esc(d.name)}`).join(' · ')}</p>
        <p class="small" style="margin:0 0 14px">${v ? `Benchmark: <b>${esc(v.label)}</b>, ${v.n_companies} aziende` : '<span class="muted">Benchmark non ancora congelato: per ora solo anteprima</span>'}</p>
        <div class="row" style="margin-top:auto">${v ? `<a class="btn sm" href="/mappe/${s.id}" target="_blank">Apri le mappe</a>` : ''}</div></div>`; }).join('')}</div>`;
}

// ---------- Audit ----------
async function viewAudit() {
  const rows = await api('/api/admin/audit');
  // cronologia: quando, chi, cosa; prima e dopo si aprono solo se servono
  const who = (a) => (String(a).startsWith('admin') ? (a === 'admin' ? 'Team ELIS' : 'Facilitatore ELIS') : String(a).startsWith('referente:') ? `Referente ${String(a).split(':').slice(2).join(':')}` : a);
  const detail = (r) => (r.before_json || r.after_json ? `<details class="audit-d"><summary>Prima e dopo</summary>${r.before_json ? `<div><b>Prima</b><code>${esc(r.before_json.slice(0, 2000))}</code></div>` : ''}${r.after_json ? `<div><b>Dopo</b><code>${esc(r.after_json.slice(0, 2000))}</code></div>` : ''}</details>` : '');
  app.innerHTML = `<div class="pagehead"><div><h1>Registro modifiche</h1><p>Ogni modifica con autore, data, prima e dopo e motivo: lo storico non si sovrascrive (regola 1). Sono mostrate le modifiche più recenti.</p></div></div>
    <div class="tablesearch"><label class="sr-only" for="q_au">Cerca nel registro</label><input type="search" id="q_au" placeholder="Cerca per autore, oggetto, azione o motivo"><span class="small muted" id="q_au_n" aria-live="polite">${rows.length} modifiche</span></div>
    <div class="card"><div class="tablewrap"><table class="audit"><thead><tr><th>Quando</th><th>Chi</th><th>Oggetto e azione</th><th>Motivo</th></tr></thead><tbody>
    ${rows.map((r) => `<tr data-q="${esc(`${who(r.actor)} ${r.entity} ${r.entity_id} ${r.action} ${r.reason || ''}`.toLowerCase())}"><td class="small nowrap">${fmtDate(r.ts)}</td><td class="small">${esc(who(r.actor))}</td>
      <td><span class="small"><b>${esc(r.entity)}</b> <span class="muted">${esc(r.entity_id)}</span></span> <span class="tag">${esc(r.action)}</span>${detail(r)}</td><td class="small">${esc(r.reason || '')}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  bindSearch('#q_au', '#q_au_n', 'modifiche');
}

// Ricerca nelle tabelle: filtra le righe già caricate (nessuna nuova richiesta al server)
function bindSearch(input, counter, noun) {
  const box = $(input); if (!box) return;
  box.oninput = () => {
    const t = box.value.trim().toLowerCase(); let n = 0;
    $$('tr[data-q]').forEach((tr) => { const hit = !t || tr.dataset.q.includes(t); tr.hidden = !hit; if (hit) n++; });
    $(counter).textContent = t ? `${n} ${n === 1 ? 'risultato' : 'risultati'}` : `${n} ${noun}`;
  };
}

// ---------- Impostazioni ----------
async function viewSettings() {
  if (ROLE === 'demo') { location.hash = '#/programma'; return; }
  NET = await api('/api/admin/network');
  const DA = await api('/api/admin/demo-access');
  app.innerHTML = `<div class="pagehead"><div><h1>Impostazioni</h1></div></div>
    <h2 class="sethead">Per la sala</h2>
    <div class="card"><h3>Rete</h3>
      <p>Indirizzo usato nei QR: <b class="mono">${esc(NET.baseUrl)}</b></p>
      <p class="small ink2">I telefoni devono raggiungere questo indirizzo. In locale devono essere sulla stessa rete Wi-Fi del computer: se il computer ha più indirizzi, scegli quello della rete della sala. Alcune reti aziendali o per ospiti isolano i dispositivi: in quel caso usa l'hotspot del telefono o un router dedicato.</p>
      <table><tbody>${NET.addresses.map((a) => `<tr><td class="mono">http://${esc(a.address)}:${NET.port}</td><td class="small muted">${esc(a.name)}</td><td><button class="sm ghost" data-url="http://${esc(a.address)}:${NET.port}">Usa questo</button></td></tr>`).join('') || '<tr><td class="muted">Nessuna rete trovata</td></tr>'}</tbody></table>
      <div class="row" style="margin-top:10px"><label class="f" for="custom" style="flex-basis:100%;margin:0">Oppure un indirizzo manuale</label><input type="text" id="custom" placeholder="es. http://192.168.1.20:3000" value="${esc(NET.custom || '')}" style="max-width:420px"><button class="sm" id="savecustom">Salva</button><button class="sm ghost" id="auto">Automatico</button></div></div>
    <div class="card"><h3>Registrazione dei partecipanti</h3>
      <label class="f" for="o_mode">Come il partecipante indica la sua azienda</label>
      <select id="o_mode" style="max-width:560px"><option value="codice">Con il codice azienda (QR del tavolo o codice comunicato), consigliato</option><option value="elenco">Scegliendo dall'elenco delle aziende (chiunque abbia il QR di sala vede l'elenco)</option></select>
      <label class="f" for="o_priv">Indirizzo dell'informativa privacy ELIS (https://…)</label>
      <input type="text" id="o_priv" style="max-width:560px" placeholder="https://www.elis.org/...">
      <p class="small muted">Il link compare nella pagina di registrazione, accanto alla spiegazione di chi vede le risposte.</p>
      <button class="sm" id="o_save">Salva</button></div>
    <h2 class="sethead">Sistema</h2>
    <div class="grid c2">
      <div class="card"><h3>Dati ed export</h3><p class="small">Database: <span class="mono">${esc(NET.db)}</span>. Per un backup basta copiare la cartella dei dati a server fermo. L'export contiene solo i dati di produzione.</p>
        <a class="btn sm" href="/api/admin/export.xlsx">Scarica export Excel</a></div>
      <div class="card"><h3>Ambiente DEMO</h3><p class="small ink2">I dati dimostrativi vivono in un ambiente separato. Per vederli, caricarli o cancellarli scegli <b>DEMO</b> nel selettore in alto; per tornare ai dati reali scegli <b>Produzione</b>.</p></div>
      <div class="card"><h3>Accesso DEMO per il comitato scientifico</h3>
        <p class="small ink2">Una password che apre solo l'ambiente DEMO: chi entra con questa vede ed esplora la DEMO (percorso guidato, mappe, report, allineamento) ma non può vedere né raggiungere la Produzione, le impostazioni o l'export. Il comitato entra da un indirizzo proprio: <a href="/demo" target="_blank" class="mono">${esc(NET.baseUrl)}/demo</a> <button type="button" class="sm ghost" id="dcopy">Copia l'indirizzo</button></p>
        ${DA.stablePassword ? `<div class="stablepw"><p class="small" style="margin:0 0 6px"><b>Password del comitato, sempre valida</b> (resta uguale dopo ogni riavvio e aggiornamento):</p>
          <div class="row" style="margin:0"><span class="mono stablepw-code" id="dstable">${esc(DA.stablePassword)}</span><button type="button" class="sm ghost" id="dstcopy">Copia la password</button></div>
          <p class="small muted" style="margin:6px 0 0">Comunicala per un canale riservato. Per cambiarla: su Render genera un nuovo valore di SESSION_SECRET (escono tutti), oppure imposta la variabile DEMO_PASSWORD con una password scelta da voi.</p></div>` : ''}
        <p class="small"><b>Stato:</b> ${!DA.hasPassword ? 'nessuna password valida (accesso non attivo)' : DA.enabled ? 'attivo' : 'disattivato'}<br>
          <b>Variabile DEMO_PASSWORD sul server:</b> ${DA.envStatus === 'attiva' ? 'letta, valida' : DA.envStatus === 'troppo corta' ? 'presente ma con meno di 8 caratteri: non vale' : 'non presente (su Render: Environment, poi «Save, rebuild and deploy»)'}<br>
          ${DA.envStatus !== 'attiva' ? `<b>Variabili con nomi simili lette dal server:</b> ${DA.envNames?.length ? DA.envNames.map((n) => `<code>${esc(n)}</code>`).join(', ') : 'nessuna'}<br>` : ''}
          <b>Variabile SESSION_SECRET:</b> ${DA.sessionSecret ? 'letta: chi entra resta dentro dopo i riavvii' : 'non presente: dopo ogni riavvio bisogna rientrare'}<br>
          <b>Password impostata da qui:</b> ${DA.fromSettings ? 'sì (vale insieme a quella della variabile)' : 'no'}</p>
        <div class="row"><label class="f" for="dpw" style="flex-basis:100%;margin:0">${DA.hasPassword ? 'Nuova password DEMO' : 'Password DEMO'} (almeno 8 caratteri)</label><input type="text" id="dpw" name="demo-access-code" autocomplete="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore maxlength="200" style="max-width:280px"><button class="sm" id="dpwgo">${DA.hasPassword ? 'Cambia' : 'Imposta e attiva'}</button></div>
        ${DA.hasPassword ? `<div class="row" style="margin-top:10px"><button class="sm ghost" id="dtoggle">${DA.enabled ? 'Disattiva l\'accesso DEMO' : 'Riattiva l\'accesso DEMO'}</button></div>` : ''}
        <p class="small muted">Cambiando la password o disattivando l'accesso, chi era entrato con la password DEMO esce. Sul piano gratuito di Render la password impostata qui si perde a ogni riavvio: per tenerla, impostala anche nella variabile DEMO_PASSWORD del servizio.</p></div>
      <div class="card"><h3>Password admin</h3><div class="row"><label class="f" for="pw1" style="flex-basis:100%;margin:0">Nuova password (almeno 8 caratteri)</label><input type="password" id="pw1" name="admin-new" autocomplete="new-password" data-lpignore="true" readonly style="max-width:280px"><button class="sm" id="pwgo">Cambia</button></div></div>
      <div class="card"><h3>Versioni</h3><p class="small" style="margin:0">Strumento <b>${esc(INST.version)}</b> (${esc(INST.status)}) · Scoring <b>${esc(SC.version)}</b></p></div></div>`;
  const O = await api('/api/admin/options');
  $('#o_mode').value = O.joinMode; $('#o_priv').value = O.privacyUrl;
  $('#o_save').onclick = async () => { try { await api('/api/admin/options', { method: 'PUT', body: { joinMode: $('#o_mode').value, privacyUrl: $('#o_priv').value } }); toast('Impostazioni salvate'); } catch (e) { toast(e.message, true); } };
  $$('[data-url]').forEach((b) => b.onclick = async () => { await api('/api/admin/network', { method: 'PUT', body: { url: b.dataset.url } }); toast('Indirizzo aggiornato'); viewSettings(); });
  $('#savecustom').onclick = async () => { await api('/api/admin/network', { method: 'PUT', body: { url: $('#custom').value } }); viewSettings(); };
  $('#auto').onclick = async () => { await api('/api/admin/network', { method: 'PUT', body: { url: '' } }); viewSettings(); };
  // i campi password partono in sola lettura: il browser non li riempie con la password salvata; al primo clic si sbloccano vuoti
  for (const id of ['#pw1']) { const el = $(id); const free = () => { if (el.readOnly) { el.readOnly = false; el.value = ''; } }; el.addEventListener('focus', free); el.addEventListener('pointerdown', free); }
  $('#dpwgo').onclick = async () => {
    const v = $('#dpw').value.trim();
    if (v.length < 8) return toast('Almeno 8 caratteri', true);
    if (!await ask('Comunicala al comitato scientifico per un canale riservato. Chi è entrato con la password precedente esce.', { title: 'Impostare la password DEMO?', ok: 'Imposta la password' })) return;
    try { await api('/api/admin/demo-access', { method: 'PUT', body: { password: v, enabled: true } }); toast(`Password DEMO impostata: «${v}». Accesso attivo`); viewSettings(); } catch (e) { toast(e.message, true); }
  };
  if ($('#dstcopy')) $('#dstcopy').onclick = async () => { try { await navigator.clipboard.writeText(DA.stablePassword); toast('Password copiata'); } catch { await askText('Seleziona il testo e copialo.', DA.stablePassword, { label: 'Password DEMO', ok: 'Chiudi' }); } };
  $('#dcopy').onclick = async () => { try { await navigator.clipboard.writeText(`${NET.baseUrl}/demo`); toast('Indirizzo copiato'); } catch { await askText('Seleziona il testo e copialo.', `${NET.baseUrl}/demo`, { label: 'Indirizzo', ok: 'Chiudi' }); } };
  if ($('#dtoggle')) $('#dtoggle').onclick = async () => {
    if (DA.enabled && !await ask('Chi è entrato con la password DEMO esce e non può rientrare finché non riattivi l\'accesso.', { title: 'Disattivare l\'accesso DEMO?', ok: 'Disattiva' })) return;
    try { await api('/api/admin/demo-access', { method: 'PUT', body: { enabled: !DA.enabled } }); toast(DA.enabled ? 'Accesso DEMO disattivato' : 'Accesso DEMO riattivato'); viewSettings(); } catch (e) { toast(e.message, true); }
  };
  $('#pwgo').onclick = async () => { try { await api('/api/admin/password', { method: 'PUT', body: { password: $('#pw1').value } }); toast('Password cambiata'); } catch (e) { toast(e.message, true); } };
}

boot();
