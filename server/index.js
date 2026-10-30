// AITO — AI Transformation & Adoption Map · server locale
import express from 'express';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { q, db, DB_PATH, token, shortCode, audit, getSetting, setSetting, envStore, setRequestEnv } from './db.js';
import * as L from './logic.js';
import * as E from './engine/index.js';
import { buildExport } from './export.js';
import { pdfBuffer, pdfFileName } from './pdf.js';
import * as AL from './alignment.js';
import { liveDashboard } from './live.js';
import JSZip from 'jszip';
import compression from 'compression';
import { seedDemo, removeDemo, hasDemo, resetDemo, advanceDemo, tourState, loadDemoComplete } from './demo.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, '../public');
const PORT = Number(process.env.PORT || 3000);
const I = E.INSTRUMENT;
const PHASES = ['preparazione', 'individuale', 'confronto', 'consolidamento', 'chiusa'];

// ---------- Primo avvio ----------
function hashPw(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
}
function checkPw(pw, stored) {
  const [salt, h] = String(stored).split(':');
  return new Promise((resolve) => crypto.scrypt(pw, salt, 32, (err, key) => {
    if (err) return resolve(false);
    const x = key.toString('hex');
    resolve(x.length === h.length && crypto.timingSafeEqual(Buffer.from(x), Buffer.from(h)));
  }));
}
let firstPassword = null;
if (!getSetting('admin_pw')) {
  firstPassword = process.env.ADMIN_PASSWORD || shortCode(8);
  setSetting('admin_pw', hashPw(firstPassword));
}
if (!q.get('SELECT 1 FROM sessions LIMIT 1')) {
  for (const s of I.sessions) {
    q.run('INSERT INTO sessions (base, title, date, mode, channel, code, instrument_version, scoring_version) VALUES (?,?,?,?,?,?,?,?)',
      s.id, `${s.name} · ${s.date.split('-').reverse().join('/')}`, s.date, 'workshop', 'presenza', shortCode(5), I.version, E.SCORING.version);
  }
}

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address });
  }
  const priv = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  return out.sort((a, b) => Number(priv(b.address)) - Number(priv(a.address)));
}
function baseUrl() {
  const env = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '');
  if (env) return env.replace(/\/$/, '');
  const s = getSetting('public_url');
  if (s) return s.replace(/\/$/, '');
  const ip = lanAddresses()[0]?.address || 'localhost';
  return `http://${ip}:${PORT}`;
}

// ---------- App ----------
const app = express();
// L'indirizzo del client da X-Forwarded-For vale solo dietro un proxy noto (Render): in locale non si fida.
if (process.env.RENDER || process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('Referrer-Policy', 'no-referrer'); // i link personali dei referenti non escono verso altri siti
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // le pagine si possono mostrare solo dentro questo stesso sito (anteprima del telefono nel percorso guidato DEMO)
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
  next();
});
app.use(compression());
// ogni richiesta porta con sé il suo ambiente, per il registro modifiche (Produzione o DEMO)
app.use((req, res, next) => envStore.run({ seeded: isProva(req) ? 1 : 0 }, next));
// Le azioni della console su una sessione o un'azienda valgono per l'ambiente del dato, non del cookie:
// se in un'altra scheda si è cambiato ambiente, la modifica si ferma (regola 6) e il registro resta coerente.
const entityEnv = (table) => (req, res, next) => {
  const row = /^\d+$/.test(req.params.id) ? q.get(`SELECT seeded FROM ${table} WHERE id = ?`, req.params.id) : null;
  if (!row) return next();
  if (isDemoViewer(req) && !row.seeded) return res.status(404).json({ error: 'Non trovato' });
  if (req.method !== 'GET' && row.seeded !== (isProva(req) ? 1 : 0)) return res.status(409).json({ error: 'Hai cambiato ambiente (DEMO/Produzione) in un\'altra scheda: ricarica la pagina e riprova.' });
  setRequestEnv(row.seeded); next();
};
app.use('/api/admin/sessions/:id', entityEnv('sessions'));
app.use('/api/admin/companies/:id', entityEnv('companies'));
// referenti e commitment: l'ambiente è quello dell'azienda a cui appartengono
const ownerEnv = (sql) => (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  const row = q.get(sql, req.params.id);
  if (!row) return res.status(404).json({ error: 'Non trovato' });
  if (row.seeded !== (isProva(req) ? 1 : 0)) return res.status(409).json({ error: 'Hai cambiato ambiente (DEMO/Produzione) in un\'altra scheda: ricarica la pagina e riprova.' });
  setRequestEnv(row.seeded); next();
};
app.use('/api/admin/referents/:id', ownerEnv('SELECT c.seeded FROM referents r JOIN companies c ON c.id = r.company_id WHERE r.id = ?'));
app.use('/api/admin/roster/:id', ownerEnv('SELECT c.seeded FROM roster r JOIN companies c ON c.id = r.company_id WHERE r.id = ?'));
app.use('/api/admin/live/:id', entityEnv('sessions'));
app.use('/api/admin/commitments/:id', ownerEnv('SELECT c.seeded FROM commitments m JOIN companies c ON c.id = m.company_id WHERE m.id = ?'));
// azienda dentro una sessione: deve esistere ed essere dello stesso ambiente della sessione
app.use('/api/admin/sessions/:sid/companies/:cid', (req, res, next) => {
  const s = q.get('SELECT seeded FROM sessions WHERE id = ?', req.params.sid), c = q.get('SELECT seeded FROM companies WHERE id = ?', req.params.cid);
  if (!s || !c) return res.status(404).json({ error: 'Non trovato' });
  if (s.seeded !== c.seeded) return res.status(409).json({ error: 'Azienda e sessione appartengono ad ambienti diversi' });
  next();
});
// lettura per azienda (versioni dei report, percorso): solo dell'ambiente corrente
app.use('/api/admin/companies/:cid/:what(reports|journey|commitments)', (req, res, next) => (q.get('SELECT 1 FROM companies WHERE id = ? AND seeded = ?', req.params.cid, isProva(req) ? 1 : 0) ? next() : res.status(404).json({ error: 'Azienda non trovata' })));
app.get('/healthz', (req, res) => res.send('ok'));
// la trascrizione di una call Teams può essere lunga: solo quella rotta accetta fino a 1 MB
const jsonSmall = express.json({ limit: '200kb' }), jsonBig = express.json({ limit: '1mb' });
app.use((req, res, next) => (/^\/api\/admin\/sessions\/\d+\/companies\/\d+\/transcript$/.test(req.path) ? jsonBig : jsonSmall)(req, res, next));
// Protezione CSRF: le richieste che modificano dati devono arrivare da questo stesso sito.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const site = req.headers['sec-fetch-site'];
  if (site && !['same-origin', 'none'].includes(site)) return res.status(403).json({ error: 'Richiesta non consentita' });
  const origin = req.headers.origin;
  if (!origin && !site) return res.status(403).json({ error: 'Richiesta non consentita' });
  if (origin) { let host = null; try { host = new URL(origin).host; } catch { /* origin non valido */ } if (host !== req.headers.host) return res.status(403).json({ error: 'Richiesta non consentita' }); }
  next();
});
app.use('/static', express.static(PUBLIC, { maxAge: 0 }));
const page = (f) => (req, res) => res.sendFile(path.join(PUBLIC, f));
app.get('/', page('index.html'));
app.get('/admin', page('admin.html'));
// indirizzo del comitato scientifico: entra solo nella DEMO
app.get('/demo', page('demo.html'));
app.get('/j/:code', page('join.html'));
app.get('/r/:token', page('ref.html'));
// tavolo del facilitatore ELIS: la vista del referente per un'azienda, aperta dalla console (serve l'accesso admin)
app.get('/tavolo-elis/:c', (req, res) => (isAdmin(req) ? page('ref.html')(req, res) : res.redirect('/admin')));
app.get('/report/:companyId', page('report.html'));
app.get('/plenaria/:base', page('plenaria.html'));
app.get('/mappe/:base', page('mappe.html'));
app.get('/live/:sid', page('live.html'));
app.get('/anteprima/:base', page('anteprima.html'));

const wrap = (fn) => async (req, res) => {
  try { const r = await fn(req, res); if (r !== undefined && !res.headersSent) res.json(r); }
  catch (e) { console.error(e); if (!res.headersSent) res.status(500).json({ error: 'Errore interno: riprova. Se si ripete, avvisa il facilitatore ELIS.' }); }
};
const txt = (v, max) => String(v ?? '').trim().slice(0, max);
const bad = (res, msg, code = 400) => { res.status(code).json({ error: msg }); };

app.get('/api/instrument', wrap(() => ({ instrument: I, scoring: E.SCORING })));
app.get('/api/qr.svg', async (req, res) => {
  try {
    const text = String(req.query.text || '');
    if (!text || text.length > 512) return res.status(400).send('Testo non valido');
    const svg = await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    res.type('image/svg+xml').send(svg);
  } catch { res.status(400).send('QR non generabile'); }
});

// ---------- Partecipanti ----------
// Confronto dei nomi: maiuscole, spazi doppi, accenti e punteggiatura non contano ("Anna Bianchi." = "anna  bianchi").
const normName = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
// Limite ai codici azienda sbagliati: indovinarne uno permetterebbe di leggere l'elenco dei nomi.
// Largo (60 ogni 15 minuti per indirizzo) perché in sala molti telefoni escono dallo stesso indirizzo della rete Wi-Fi.
const joinFails = new Map();
const joinBlocked = (req) => { const now = Date.now(); const f = (joinFails.get(req.ip) || []).filter((t) => now - t < 15 * 60 * 1000); joinFails.set(req.ip, f); return f.length >= 60; };
const joinFail = (req) => { if (joinFails.size > 5000) joinFails.clear(); if (!joinFails.has(req.ip)) joinFails.set(req.ip, []); joinFails.get(req.ip).push(Date.now()); };
const TOO_MANY = 'Troppi tentativi con codici azienda sbagliati: riprova tra qualche minuto o chiedi aiuto al facilitatore ELIS';
// Azienda ammessa alla sessione: stesso ambiente; nelle sessioni ad hoc solo le aziende per cui ELIS l'ha aperta (riga in session_company).
function joinCompany(s, where, val) {
  const c = q.get(`SELECT * FROM companies WHERE ${where === 'id' ? 'id' : 'join_code'} = ? AND seeded = ?`, val, s.seeded ? 1 : 0);
  if (!c) return null;
  if (s.mode !== 'workshop' && !q.get('SELECT 1 FROM session_company WHERE session_id = ? AND company_id = ?', s.id, c.id)) return null;
  return c;
}
// Elenco delle persone iscritte: solo durante la registrazione e solo se ELIS ha generato il QR dell'azienda per questa sessione.
// Un nome è "preso" se un partecipante attivo l'ha scelto o si è registrato con lo stesso nome.
// il nome conta solo per chi si è aggiunto a mano: due omonimi iscritti (funzioni diverse) restano distinti
const takenFor = (active, r) => active.some((p) => p.roster_id === r.id || (!p.roster_id && normName(p.name) === normName(r.name)));
function rosterFor(s, c) {
  const sc = q.get('SELECT qr_generated_at FROM session_company WHERE session_id = ? AND company_id = ?', s.id, c.id);
  if (!['preparazione', 'individuale'].includes(s.phase) || !sc?.qr_generated_at) return [];
  const active = L.activeParticipants(s.id, c.id);
  const refs = q.all('SELECT name FROM referents WHERE company_id = ?', c.id).map((r) => normName(r.name));
  return q.all('SELECT id, name, func FROM roster WHERE company_id = ? ORDER BY name', c.id)
    .map((r) => ({ ...r, taken: takenFor(active, r), referent: refs.includes(normName(r.name)) }));
}

app.get('/api/join/:code', wrap((req, res) => {
  const s = q.get('SELECT id, title, base, phase, seeded, mode FROM sessions WHERE code = ?', req.params.code);
  if (!s) return bad(res, 'Sessione non trovata', 404);
  if (req.query.c && joinBlocked(req)) return bad(res, TOO_MANY, 429);
  // Di default l'azienda si sceglie con il suo codice (QR del tavolo o codice comunicato dal referente):
  // chi ha il QR di sessione non vede l'elenco delle aziende partecipanti. In modalità "elenco" si mostra la lista.
  const mode = getSetting('join_mode') || 'codice';
  let pre = null;
  if (req.query.c) { pre = joinCompany(s, 'code', String(req.query.c).toUpperCase().slice(0, 10)); if (!pre) joinFail(req); }
  const companies = mode === 'elenco' ? q.all('SELECT id, name, join_code FROM companies WHERE seeded = ? ORDER BY name', s.seeded ? 1 : 0).filter((c) => joinCompany(s, 'id', c.id)) : [];
  return { session: { id: s.id, title: s.title, base: s.base, phase: s.phase, demo: !!s.seeded }, mode, preselected: pre ? { id: pre.id, name: pre.name, code: pre.join_code } : null,
    roster: pre ? rosterFor(s, pre) : [],
    companies: companies.map((c) => ({ id: c.id, name: c.name, code: c.join_code })), functions: I.functions,
    privacyUrl: getSetting('privacy_url') || null };
}));

app.post('/api/join/:code', wrap((req, res) => {
  const s = q.get('SELECT * FROM sessions WHERE code = ?', req.params.code);
  if (!s) return bad(res, 'Sessione non trovata', 404);
  setRequestEnv(s.seeded);
  if (!['preparazione', 'individuale'].includes(s.phase)) return bad(res, 'La fase individuale è chiusa: non è più possibile registrarsi a questa sessione.');
  if (joinBlocked(req)) return bad(res, TOO_MANY, 429);
  const { companyId, companyCode, privacyAck, rosterId } = req.body || {};
  let { name, func } = req.body || {};
  const c = companyCode ? joinCompany(s, 'code', txt(companyCode, 10).toUpperCase())
    : (getSetting('join_mode') === 'elenco' ? joinCompany(s, 'id', Number(companyId)) : null);
  if (!c) { if (companyCode) joinFail(req); return bad(res, companyCode ? 'Codice azienda non riconosciuto: controlla il cartoncino del tavolo o chiedilo al referente' : 'Inserire il codice azienda'); }
  const roster = q.all('SELECT * FROM roster WHERE company_id = ?', c.id);
  const active = L.activeParticipants(s.id, c.id);
  const takenBy = (r) => takenFor(active, r);
  const BUSY = 'Questo nome è già registrato su un altro telefono. Se sei tu, chiedi al referente di toccare «Rimuovi» accanto al tuo nome, poi ricarica la pagina.';
  let rid = null;
  if (rosterId != null) {
    const r = roster.find((x) => x.id === Number(rosterId));
    if (!r) return bad(res, 'Nome non trovato nell\'elenco: scegline un altro o aggiungiti');
    if (takenBy(r)) return bad(res, BUSY, 409);
    ({ name, func } = r); rid = r.id;
  } else if (txt(name, 120)) {
    const n = normName(name);
    const same = roster.filter((r) => normName(r.name) === n);
    if (same.length && rosterFor(s, c).length) return bad(res, 'C\'è già una persona iscritta con questo nome: se sei tu, sceglila nell\'elenco; altrimenti aggiungi l\'iniziale del secondo nome.');
    if (same.length === 1) { // elenco non ancora mostrato (QR non generato): chi scrive il nome di un iscritto viene collegato a lui
      if (takenBy(same[0])) return bad(res, BUSY, 409);
      ({ name, func } = same[0]); rid = same[0].id;
    } else if (same.length > 1) return bad(res, 'Ci sono più persone iscritte con questo nome: chiedi al facilitatore ELIS');
    else if (q.all('SELECT name FROM referents WHERE company_id = ?', c.id).some((r) => normName(r.name) === n)) return bad(res, 'Il referente si registra scegliendo il suo nome tra le persone iscritte. Se non c\'è, chiedi al facilitatore ELIS di aggiungerlo.');
    else if (active.some((p) => normName(p.name) === n)) return bad(res, BUSY.replace('Questo nome', 'Una persona con questo nome'), 409);
  }
  if (!txt(name, 120)) return bad(res, 'Scegli il tuo nome dall\'elenco o inserisci nome e cognome');
  if (!I.functions.some((f) => f.id === func)) return bad(res, rid ? 'La funzione di questa persona non è più valida: chiedi al facilitatore ELIS' : 'Selezionare la funzione');
  if (!privacyAck) return bad(res, 'Per proseguire conferma di aver letto come vengono usate le risposte');
  const t = token();
  q.run('INSERT INTO participants (session_id, company_id, name, func, email, token, roster_id) VALUES (?,?,?,?,NULL,?,?)', s.id, c.id, txt(name, 120), func, t, rid);
  L.invalidateComparison(s.id, c.id);
  L.ensureSessionCompany(s.id, c.id);
  return { token: t };
}));

function participant(req, res) {
  const p = q.get('SELECT * FROM participants WHERE token = ?', req.params.t);
  if (!p) { bad(res, 'Partecipante non riconosciuto', 404); return null; }
  if (p.removed) { bad(res, 'La registrazione è stata annullata dal referente aziendale', 403); return null; }
  setRequestEnv(q.get('SELECT seeded FROM sessions WHERE id = ?', p.session_id)?.seeded);
  return p;
}

app.get('/api/p/:t', wrap((req, res) => {
  const p = participant(req, res); if (!p) return;
  const st = L.participantState(p);
  const company = q.get('SELECT name FROM companies WHERE id = ?', p.company_id);
  const out = { participant: { name: p.name, func: p.func, submitted_at: p.submitted_at }, company: company.name,
    session: { id: st.session.id, title: st.session.title, base: st.session.base, phase: st.session.phase, demo: !!st.session.seeded },
    answers: st.answers, answered: st.answered, pairAnswers: st.pairs };
  // ?lite=1: il telefono ha già le definizioni degli item, si inviano solo fase e dati
  if (req.query.lite !== '1') Object.assign(out, { items: st.def.items.map((id) => ({ id, ...I.items[id] })), pairs: st.def.pairs, pairQuestion: I.pairQuestion });
  if (['confronto', 'consolidamento', 'chiusa'].includes(st.session.phase)) out.comparison = L.participantComparison(p.session_id, p.company_id);
  return out;
}));

// Nome scelto per errore: finché non ha dato risposte, il partecipante annulla da solo la registrazione e il nome torna libero.
app.post('/api/p/:t/leave', wrap((req, res) => {
  const p = participant(req, res); if (!p) return;
  const s = L.getSession(p.session_id);
  if (!['preparazione', 'individuale'].includes(s.phase)) return bad(res, 'La registrazione non si può più cambiare: chiedi al referente');
  const n = q.get('SELECT (SELECT COUNT(*) FROM answers WHERE participant_id = ?) + (SELECT COUNT(*) FROM pair_answers WHERE participant_id = ?) n', p.id, p.id).n;
  if (n) return bad(res, 'Hai già dato delle risposte: per cambiare nome chiedi al referente');
  q.run('UPDATE participants SET removed = 1 WHERE id = ?', p.id);
  L.invalidateComparison(p.session_id, p.company_id);
  audit(`partecipante:${p.id}`, 'participant', p.id, 'leave', { name: p.name }, null, 'Nome scelto per errore: registrazione annullata dal partecipante');
  return { ok: true };
}));
app.put('/api/p/:t/answer', wrap((req, res) => {
  const p = participant(req, res); if (!p) return;
  const s = L.getSession(p.session_id);
  if (s.phase !== 'individuale') return bad(res, 'La fase individuale non è aperta');
  const { itemId, level } = req.body;
  if (!L.baseDef(s).items.includes(itemId)) return bad(res, 'Item non previsto');
  const lv = level == null ? null : Number(level);
  if (lv != null && !(Number.isInteger(lv) && lv >= 1 && lv <= 5)) return bad(res, 'Livello non valido');
  q.run(`INSERT INTO answers (participant_id, item_id, level, updated_at) VALUES (?,?,?,datetime('now'))
         ON CONFLICT(participant_id, item_id) DO UPDATE SET level = excluded.level, updated_at = excluded.updated_at`, p.id, itemId, lv);
  L.invalidateComparison(p.session_id, p.company_id);
  return { ok: true };
}));

app.put('/api/p/:t/pair', wrap((req, res) => {
  const p = participant(req, res); if (!p) return;
  const s = L.getSession(p.session_id);
  if (s.phase !== 'individuale') return bad(res, 'La fase individuale non è aperta');
  const { a, b, answer } = req.body;
  if (!L.baseDef(s).pairs.some(([x, y]) => x === a && y === b)) return bad(res, 'Confronto non previsto');
  if (!['A', 'B', 'ND'].includes(answer)) return bad(res, 'Risposta non valida');
  q.run(`INSERT INTO pair_answers (participant_id, item_a, item_b, answer, updated_at) VALUES (?,?,?,?,datetime('now'))
         ON CONFLICT(participant_id, item_a, item_b) DO UPDATE SET answer = excluded.answer, updated_at = excluded.updated_at`, p.id, a, b, answer);
  L.invalidateComparison(p.session_id, p.company_id);
  return { ok: true };
}));

app.post('/api/p/:t/submit', wrap((req, res) => {
  const p = participant(req, res); if (!p) return;
  const s = L.getSession(p.session_id);
  if (s.phase !== 'individuale') return bad(res, 'La fase individuale non è aperta');
  const def = L.baseDef(s);
  const n = q.get('SELECT COUNT(*) n FROM answers WHERE participant_id = ?', p.id).n;
  const np = q.get('SELECT COUNT(*) n FROM pair_answers WHERE participant_id = ?', p.id).n;
  if (n < def.items.length || np < def.pairs.length) return bad(res, 'Rispondere a tutti gli item (anche con N.D.) e ai confronti a coppie');
  q.run("UPDATE participants SET submitted_at = datetime('now') WHERE id = ?", p.id);
  L.invalidateComparison(p.session_id, p.company_id);
  return { ok: true };
}));

// ---------- Referente aziendale ----------
function referent(req, res) {
  // Il facilitatore ELIS conduce confronto e consolidamento (nota, ruoli): usa le stesse API del referente, con l'accesso della console.
  if (req.params.c) {
    if (!isAdmin(req)) { bad(res, 'Accesso admin richiesto', 401); return null; }
    const c = q.get('SELECT * FROM companies WHERE id = ? AND seeded = ?', req.params.c, envOf(req));
    if (!c) { bad(res, 'Azienda non trovata', 404); return null; }
    return { id: 0, facilitator: true, name: 'Facilitatore ELIS', company_id: c.id, company_name: c.name, company_kind: c.kind, perimeter: c.perimeter, company_seeded: c.seeded };
  }
  const r = q.get('SELECT r.*, c.name company_name, c.kind company_kind, c.perimeter, c.seeded company_seeded FROM referents r JOIN companies c ON c.id = r.company_id WHERE r.token = ?', req.params.t);
  if (!r) { bad(res, 'Link referente non valido', 404); return null; }
  setRequestEnv(r.company_seeded);
  return r;
}
// Il referente vede solo le sessioni del suo ambiente: azienda reale → sessioni di produzione, azienda di prova → sessioni di prova.
function refSession(r, sid, res) {
  const s = L.getSession(sid);
  // una sessione ad hoc è visibile solo all'azienda per cui è stata aperta
  if (!s || (s.seeded ? 1 : 0) !== (r.company_seeded ? 1 : 0)
    || (s.mode !== 'workshop' && !q.get('SELECT 1 FROM session_company WHERE session_id = ? AND company_id = ?', s.id, r.company_id))) { bad(res, 'Sessione non trovata', 404); return null; }
  return s;
}
const refActor = (r) => (r.facilitator ? `${ADMIN}:facilitatore` : `referente:${r.id}:${r.name}`);

app.get(['/api/r/:t', '/api/f/:c'], wrap((req, res) => {
  const r = referent(req, res); if (!r) return;
  const sessions = q.all('SELECT * FROM sessions WHERE seeded = ? ORDER BY date, id', r.company_seeded ? 1 : 0).map((s) => {
    const sc = q.get('SELECT * FROM session_company WHERE session_id = ? AND company_id = ?', s.id, r.company_id);
    const pre = L.getPresession(r.company_id, s.base);
    // della call con il leader il referente vede solo se è stata fatta, non la nota interna di ELIS
    return { ...s, consolidated_at: sc?.consolidated_at || null, report_released_at: sc?.report_released_at || null,
      presession_updated_at: pre.updated_at, participants: L.activeParticipants(s.id, r.company_id).length,
      commitment: !!q.get('SELECT 1 FROM commitments WHERE session_id = ? AND company_id = ?', s.id, r.company_id), leader_call: !!sc?.leader_call_note };
  }).filter((s) => s.mode === 'workshop' || s.participants > 0 || s.consolidated_at || q.get('SELECT 1 FROM session_company WHERE session_id = ? AND company_id = ?', s.id, r.company_id));
  return { referent: { name: r.name, companyId: r.company_id, company: r.company_name, perimeter: r.perimeter, kind: r.company_kind, demo: !!r.company_seeded }, sessions,
    reports: L.listSnapshots(r.company_id), alignment: alignSummary(r) };
}));
function alignSummary(r) {
  const st = AL.alignmentState(r.company_id, r.company_seeded);
  return { open: st.open, reviewed: st.reviewed, total: st.total, changed: st.changed, confirmedAt: st.confirmedAt };
}

app.get(['/api/r/:t/presession/:base', '/api/f/:c/presession/:base'], wrap((req, res) => {
  const r = referent(req, res); if (!r) return;
  if (!E.sessionDef(req.params.base)) return bad(res, 'Sessione non valida');
  return { fields: L.presessionFields(req.params.base), saved: L.getPresession(r.company_id, req.params.base), session: E.sessionDef(req.params.base) };
}));
app.put('/api/r/:t/presession/:base', wrap((req, res) => {
  const r = referent(req, res); if (!r) return;
  // decisione del team (20/10/2026): la scheda pre-sessione si consulta soltanto; si risponde in sala
  return bad(res, 'La scheda si consulta soltanto: le risposte si danno in sala, il giorno della sessione', 403);
}));

app.get(['/api/r/:t/session/:sid', '/api/f/:c/session/:sid'], wrap((req, res) => {
  const r = referent(req, res); if (!r) return;
  const s = refSession(r, req.params.sid, res); if (!s) return;
  const parts = L.activeParticipants(s.id, r.company_id).map((p) => ({ id: p.id, name: p.name, func: p.func, submitted: !!p.submitted_at }));
  const out = { session: s, participants: parts, joinUrl: `${baseUrl()}/j/${s.code}?c=${q.get('SELECT join_code FROM companies WHERE id = ?', r.company_id).join_code}` };
  if (['confronto', 'consolidamento', 'chiusa'].includes(s.phase)) out.consolidation = L.consolidationView(s.id, r.company_id);
  return out;
}));
app.delete(['/api/r/:t/session/:sid/participant/:pid', '/api/f/:c/session/:sid/participant/:pid'], wrap((req, res) => {
  const r = referent(req, res); if (!r) return;
  const s = refSession(r, req.params.sid, res); if (!s) return;
  if (s.phase === 'chiusa') return bad(res, 'La sessione è chiusa: per correggere i partecipanti contatta ELIS');
  const p = q.get('SELECT * FROM participants WHERE id = ? AND company_id = ? AND session_id = ?', req.params.pid, r.company_id, s.id);
  if (!p) return bad(res, 'Partecipante non trovato', 404);
  q.run('UPDATE participants SET removed = 1 WHERE id = ?', p.id);
  L.invalidateComparison(p.session_id, p.company_id);
  audit(refActor(r), 'participant', p.id, 'remove', { name: p.name }, null, txt(req.body?.reason, 1000) || (r.facilitator ? 'Rimosso dal facilitatore ELIS' : 'Rimosso dal referente'));
  return { ok: true };
}));
// Il facilitatore corregge nome o funzione di un partecipante (es. funzione sbagliata scelta dal telefono).
app.put('/api/f/:c/session/:sid/participant/:pid', wrap((req, res) => {
  const r = referent(req, res); if (!r) return;
  const s = refSession(r, req.params.sid, res); if (!s) return;
  if (s.phase === 'chiusa') return bad(res, 'La sessione è chiusa: i partecipanti non si correggono più da qui');
  const p = q.get('SELECT * FROM participants WHERE id = ? AND company_id = ? AND session_id = ? AND removed = 0', req.params.pid, r.company_id, s.id);
  if (!p) return bad(res, 'Partecipante non trovato', 404);
  const name = txt(req.body?.name, 120).replace(/\s+/g, ' '), func = req.body?.func;
  if (!name) return bad(res, 'Scrivi nome e cognome');
  if (!I.functions.some((f) => f.id === func)) return bad(res, 'Scegli la funzione');
  if (name === p.name && func === p.func) return { ok: true }; // nessun cambiamento: niente da registrare
  // il nome resta legato all'elenco delle persone iscritte: niente doppioni, e il collegamento segue il nuovo nome
  const others = L.activeParticipants(s.id, r.company_id).filter((x) => x.id !== p.id);
  if (others.some((x) => normName(x.name) === normName(name))) return bad(res, 'C\'è già un partecipante con questo nome in questa sessione', 409);
  const ros = q.all('SELECT * FROM roster WHERE company_id = ?', r.company_id).filter((x) => normName(x.name) === normName(name));
  if (ros.length && others.some((x) => ros.some((y) => x.roster_id === y.id))) return bad(res, 'Questa persona iscritta è già registrata su un altro telefono', 409);
  const rid = ros.length === 1 ? ros[0].id : null;
  q.run('UPDATE participants SET name = ?, func = ?, roster_id = ? WHERE id = ?', name, func, rid, p.id);
  L.invalidateComparison(p.session_id, p.company_id); // il numero di funzioni presenti entra nella confidence
  audit(refActor(r), 'participant', p.id, 'update', { name: p.name, func: p.func }, { name, func }, txt(req.body?.reason, 1000) || 'Correzione del facilitatore ELIS');
  return { ok: true };
}));
app.put(['/api/r/:t/session/:sid/draft', '/api/f/:c/session/:sid/draft'], wrap((req, res) => {
  const r = referent(req, res); if (!r) return;
  const s = refSession(r, req.params.sid, res); if (!s) return;
  if (s.phase !== 'consolidamento') return bad(res, 'Il consolidamento non è aperto');
  if (JSON.stringify(req.body || {}).length > 20000) return bad(res, 'Bozza troppo grande');
  // solo gli item della sessione, uno o più per volta
  const items = Object.fromEntries(Object.entries(req.body?.items || {}).filter(([k, v]) => (E.sessionDef(s.base)?.items || []).includes(k) && v && typeof v === 'object'));
  return { ok: true, rev: L.saveDraft(s.id, r.company_id, { items }, refActor(r)) };
}));
app.post(['/api/r/:t/session/:sid/confirm', '/api/f/:c/session/:sid/confirm'], wrap((req, res) => {
  const r = referent(req, res); if (!r) return;
  const s = refSession(r, req.params.sid, res); if (!s) return;
  if (s.phase !== 'consolidamento') return bad(res, 'Il consolidamento è aperto solo nella fase di consolidamento');
  const out = L.confirmConsolidation(s.id, r.company_id, req.body || {}, refActor(r));
  if (out.conflict) return bad(res, out.errors.join(' · '), 409);
  if (!out.ok) return bad(res, out.errors.join(' · '));
  return out;
}));
app.put(['/api/r/:t/session/:sid/commitment', '/api/f/:c/session/:sid/commitment'], wrap((req, res) => {
  const r = referent(req, res); if (!r) return;
  const s = refSession(r, req.params.sid, res); if (!s) return;
  if (!['consolidamento', 'chiusa'].includes(s.phase)) return bad(res, 'Priorità e commitment si registrano dalla fase di consolidamento');
  const out = L.saveCommitment(Number(req.params.sid), r.company_id, req.body || {}, refActor(r));
  if (!out.ok) return bad(res, out.errors.join(' · '));
  return out;
}));
app.get('/api/r/:t/report', wrap((req, res) => {
  const r = referent(req, res); if (!r) return;
  const R = L.getSnapshot(r.company_id, req.query.snap ? Number(req.query.snap) : null);
  if (!R) return bad(res, 'Il report non è ancora stato rilasciato da ELIS', 403);
  return R;
}));

// ---------- Allineamento finale (§14.1): referente dal suo link, facilitatore ELIS dal tavolo ----------
// il facilitatore ELIS può preparare l'allineamento anche prima di aprirlo alle aziende
const alignGate = (r, res) => { if (!r.facilitator && !AL.isOpen(r.company_seeded)) { bad(res, 'L\'allineamento finale non è ancora aperto', 403); return false; } return true; };
app.get(['/api/r/:t/alignment', '/api/f/:c/alignment'], wrap((req, res) => {
  const r = referent(req, res); if (!r) return;
  return AL.alignmentState(r.company_id, r.company_seeded);
}));
app.put(['/api/r/:t/alignment/item/:item', '/api/f/:c/alignment/item/:item'], wrap((req, res) => {
  const r = referent(req, res); if (!r || !alignGate(r, res)) return;
  const out = AL.saveItem(r.company_id, req.params.item, req.body || {}, refActor(r));
  return out.ok ? AL.alignmentState(r.company_id, r.company_seeded) : bad(res, out.errors.join(' · '));
}));
app.put(['/api/r/:t/alignment/priorities', '/api/f/:c/alignment/priorities'], wrap((req, res) => {
  const r = referent(req, res); if (!r || !alignGate(r, res)) return;
  const out = AL.savePriorities(r.company_id, req.body?.priorities, req.body?.note, refActor(r));
  return out.ok ? AL.alignmentState(r.company_id, r.company_seeded) : bad(res, out.errors.join(' · '));
}));
app.post(['/api/r/:t/alignment/confirm', '/api/f/:c/alignment/confirm'], wrap((req, res) => {
  const r = referent(req, res); if (!r || !alignGate(r, res)) return;
  const out = AL.confirm(r.company_id, r.company_seeded, refActor(r));
  return out.ok ? AL.alignmentState(r.company_id, r.company_seeded) : bad(res, out.errors.join(' · '));
}));

// ---------- Admin ELIS ----------
function cookie(req, name) {
  const m = (req.headers.cookie || '').split(';').map((x) => x.trim().split('=')).find(([k]) => k === name);
  return m ? decodeURIComponent(m[1]) : null;
}
// Accesso firmato: il cookie porta ruolo e data, firmati con un segreto casuale (variabile SESSION_SECRET).
// Sul piano gratuito di Render ogni pubblicazione svuota il database: con SESSION_SECRET e le password nelle
// variabili la chiave resta uguale, quindi chi è entrato resta dentro. Cambiare la password su Render fa uscire tutti.
// Senza la variabile (uso locale) il segreto sta nel database: vale finché il database c'è.
const SESSION_DAYS = 14;
const envSecret = String(process.env.SESSION_SECRET || '').trim();
if (envSecret.length < 16 && !getSetting('session_secret')) setSetting('session_secret', token(32));
const sessionSecret = () => (envSecret.length >= 16 ? envSecret : getSetting('session_secret'));
function sessionKey(role) {
  const src = role === 'admin' ? (process.env.ADMIN_PASSWORD || getSetting('admin_pw'))
    : role === 'demo' ? (envDemoPw().length >= 8 ? envDemoPw() : stableDemoPw() || getSetting('demo_pw')) : null;
  if (!src) return null;
  // la password e l'epoca entrano nella chiave: cambiare la password, o l'epoca da Impostazioni, annulla i cookie firmati prima
  return crypto.createHmac('sha256', sessionSecret()).update(`${role}|${src}|${getSetting(`sess_epoch_${role}`) || ''}`).digest();
}
function signSession(role) {
  const body = `${role}.${Date.now()}.${token(12)}`;
  return `${body}.${crypto.createHmac('sha256', sessionKey(role)).update(body).digest('base64url')}`;
}
const newEpoch = (role) => setSetting(`sess_epoch_${role}`, token(12));
const sessionCookie = (req, role) => `aito_admin=${signSession(role)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * SESSION_DAYS}${req.secure ? '; Secure' : ''}`;
// Ruolo dell'accesso: "admin" (team ELIS) oppure "demo" (comitato scientifico: vede e usa solo l'ambiente DEMO)
function sessionOf(req) {
  const m = /^(admin|demo)\.(\d{1,15})\.([\w-]{16})\.([\w-]{43})$/.exec(cookie(req, 'aito_admin') || '');
  if (!m || Date.now() - Number(m[2]) > SESSION_DAYS * 864e5 || Number(m[2]) > Date.now() + 6e4) return null;
  const role = m[1], key = sessionKey(role);
  if (!key || (role === 'demo' && !demoActive())) return null;
  const want = Buffer.from(crypto.createHmac('sha256', key).update(`${role}.${m[2]}.${m[3]}`).digest('base64url'));
  const got = Buffer.from(m[4]);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  // dopo «Esci» quel cookie resta rifiutato (fino al riavvio; il browser l'ha comunque cancellato)
  return q.get('SELECT 1 FROM admin_tokens WHERE token = ?', m[3]) ? null : { role, id: m[3] };
}
// il ruolo si calcola una volta per richiesta
const roleCache = new WeakMap();
function roleOf(req) {
  if (!roleCache.has(req)) roleCache.set(req, sessionOf(req)?.role || null);
  return roleCache.get(req);
}
const isAdmin = (req) => !!roleOf(req);
const isDemoViewer = (req) => roleOf(req) === 'demo';
// Ambiente della console: "prova" (dati dimostrativi) o produzione. Si sceglie nel browser con un cookie;
// con l'accesso DEMO è sempre DEMO, qualunque sia il cookie.
const isProva = (req) => isDemoViewer(req) || cookie(req, 'aito_mode') === 'prova';
const envOf = (req) => (isProva(req) ? 1 : 0);
function requireAdmin(req, res, next) { if (isAdmin(req)) return next(); bad(res, 'Accesso admin richiesto', 401); }
const ADMIN = 'admin';

// valore della variabile DEMO_PASSWORD senza spazi e virgolette messi per errore nel pannello di Render
const envDemoPw = () => String(process.env.DEMO_PASSWORD || '').trim().replace(/^(["'])(.*)\1$/, '$2').trim();
// Password DEMO stabile: ricavata da SESSION_SECRET (che sta su Render, non nel codice), quindi uguale dopo ogni
// riavvio senza bisogno di altre variabili. Vale quando DEMO_PASSWORD non c'è; il team ELIS la legge in Impostazioni.
const STABLE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const stableDemoPw = () => {
  if (envSecret.length < 16 || envDemoPw().length >= 8) return '';
  const b = crypto.createHmac('sha256', envSecret).update('aito-demo-password').digest();
  const c = [...b.subarray(0, 12)].map((x) => STABLE_ALPHABET[x % 32]).join('');
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
};
const demoActive = () => getSetting('demo_access') !== '0' && (!!getSetting('demo_pw') || envDemoPw().length >= 8 || !!stableDemoPw());
async function demoPwOk(pw) {
  pw = String(pw || '').trim(); // uno spazio copiato per errore insieme alla password non deve bloccare il comitato
  if (!pw || getSetting('demo_access') === '0') return false;
  // valgono sia la password impostata da Impostazioni sia quella della variabile (che resta dopo i riavvii)
  const h = getSetting('demo_pw');
  if (h && await checkPw(pw, h)) return true;
  const env = envDemoPw();
  const sha = (x) => crypto.createHash('sha256').update(x).digest();
  if (env.length >= 8 && crypto.timingSafeEqual(sha(pw), sha(env))) return true;
  // password stabile: maiuscole o minuscole e trattini indifferenti
  const st = stableDemoPw(), norm = (x) => x.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return !!st && crypto.timingSafeEqual(sha(norm(pw)), sha(norm(st)));
}
const loginFails = new Map(); // limite ai tentativi: 10 errori ogni 15 minuti per indirizzo e 50 in totale
let globalFails = [];
app.post('/api/admin/login', wrap(async (req, res) => {
  const now = Date.now(), win = 15 * 60 * 1000;
  globalFails = globalFails.filter((t) => now - t < win);
  const f = (loginFails.get(req.ip) || []).filter((t) => now - t < win);
  if (f.length >= 10 || globalFails.length >= 50) return bad(res, 'Troppi tentativi: riprova tra qualche minuto', 429);
  const pw = String(req.body?.password || '').slice(0, 200);
  // /admin accetta solo la password admin; il comitato entra da /demo con la password DEMO
  const role = req.body?.demo ? ((await demoPwOk(pw)) ? 'demo' : null) : (await checkPw(pw, getSetting('admin_pw'))) ? 'admin' : null;
  if (req.body?.demo && !demoActive()) return bad(res, 'L\'accesso DEMO non è attivo: chiedi al team ELIS di impostare la password', 403);
  if (!role) {
    f.push(now); globalFails.push(now);
    if (loginFails.size > 1000) loginFails.clear();
    loginFails.set(req.ip, f);
    return bad(res, 'Password errata', 401);
  }
  loginFails.delete(req.ip);
  const sec = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', [sessionCookie(req, role),
    ...(role === 'demo' ? [`aito_mode=prova; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * SESSION_DAYS}${sec}`] : [])]);
  if (role === 'demo') audit('demo:comitato', 'access', '', 'login', null, null);
  return { ok: true, role };
}));
app.post('/api/admin/logout', wrap((req, res) => {
  // si annota solo un cookie valido (niente scritture da richieste anonime); le annotazioni scadute si cancellano
  const s = sessionOf(req);
  if (s) {
    q.run(`DELETE FROM admin_tokens WHERE created_at < datetime('now', '-${SESSION_DAYS} days')`);
    q.run("INSERT OR IGNORE INTO admin_tokens (token, role) VALUES (?, 'uscito')", s.id);
  }
  res.setHeader('Set-Cookie', `aito_admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${req.secure ? '; Secure' : ''}`);
  return { ok: true };
}));
// pagina /demo: dice solo se l'accesso del comitato è attivo (nessun altro dettaglio)
app.get('/api/demo/status', wrap(() => ({ active: demoActive() })));
app.get('/api/admin/me', wrap((req) => ({ admin: isAdmin(req), role: roleOf(req) })));
app.use('/api/admin', requireAdmin);
// Accesso DEMO: niente Produzione, niente impostazioni di sistema, niente export (che è solo di Produzione)
app.use('/api/admin', (req, res, next) => {
  if (!isDemoViewer(req)) return next();
  if (/^\/(export|password|network|options|demo-access)/.test(req.path) && !(req.method === 'GET' && /^\/(network|options)/.test(req.path))) return bad(res, 'Non disponibile con l\'accesso DEMO', 403);
  next();
});
// Password dell'accesso DEMO: la imposta il team ELIS da Impostazioni (riserva: variabile DEMO_PASSWORD)
app.get('/api/admin/demo-access', wrap(() => {
  const env = envDemoPw();
  return { enabled: getSetting('demo_access') !== '0', hasPassword: !!getSetting('demo_pw') || env.length >= 8 || !!stableDemoPw(), fromSettings: !!getSetting('demo_pw'),
    stablePassword: stableDemoPw() || null, // solo per il team ELIS: il ruolo demo non raggiunge questa API
    envStatus: !process.env.DEMO_PASSWORD ? 'assente' : env.length < 8 ? 'troppo corta' : 'attiva',
    sessionSecret: envSecret.length >= 16,
    // solo i nomi (mai i valori) delle variabili simili: rivela un errore di battitura nel pannello di Render
    envNames: Object.keys(process.env).filter((k) => /demo|session_?secret/i.test(k)).sort() };
}));
app.put('/api/admin/demo-access', wrap(async (req, res) => {
  const { password, enabled } = req.body || {};
  if (password != null && password !== '') {
    const pw = String(password).trim();
    if (pw.length < 8) return bad(res, 'Almeno 8 caratteri');
    if (pw.length > 200) return bad(res, 'Al massimo 200 caratteri');
    // spesso il browser riempie da solo il campo con la password admin salvata: non deve diventare la password del comitato
    if (await checkPw(pw, getSetting('admin_pw'))) return bad(res, 'La password DEMO deve essere diversa da quella admin (forse il browser ha riempito il campo da solo): scrivila di nuovo');
    setSetting('demo_pw', hashPw(pw));
    newEpoch('demo'); // la vecchia password non vale più: si esce dagli accessi DEMO aperti
    audit(ADMIN, 'settings', 'demo_pw', 'change', null, null);
  }
  if (enabled != null) {
    setSetting('demo_access', enabled ? '1' : '0');
    if (!enabled) newEpoch('demo');
    audit(ADMIN, 'settings', 'demo_access', enabled ? 'enable' : 'disable', null, null);
  }
  return { ok: true };
}));

app.put('/api/admin/password', wrap((req, res) => {
  const pw = String(req.body?.password || '');
  if (pw.length < 8) return bad(res, 'Almeno 8 caratteri');
  setSetting('admin_pw', hashPw(pw)); audit(ADMIN, 'settings', 'admin_pw', 'change', null, null);
  // chiude le altre sessioni aperte; chi ha cambiato la password resta dentro con un cookie nuovo
  newEpoch('admin');
  res.setHeader('Set-Cookie', sessionCookie(req, 'admin'));
  return { ok: true };
}));
app.get('/api/admin/network', wrap(() => ({ baseUrl: baseUrl(), custom: getSetting('public_url') || null, addresses: lanAddresses(), port: PORT, db: DB_PATH })));
app.put('/api/admin/network', wrap((req) => { setSetting('public_url', txt(req.body?.url, 300)); return { ok: true, baseUrl: baseUrl() }; }));
app.get('/api/admin/options', wrap(() => ({ joinMode: getSetting('join_mode') || 'codice', privacyUrl: getSetting('privacy_url') || '' })));
app.put('/api/admin/options', wrap((req, res) => {
  const mode = req.body?.joinMode === 'elenco' ? 'elenco' : 'codice';
  const url = txt(req.body?.privacyUrl, 300);
  if (url && !/^https:\/\//.test(url)) return bad(res, 'L\'indirizzo dell\'informativa deve iniziare con https://');
  setSetting('join_mode', mode); setSetting('privacy_url', url);
  audit(ADMIN, 'settings', 'options', 'update', null, { mode, url });
  return { ok: true };
}));

// Aziende
app.get('/api/admin/companies', wrap((req) => q.all('SELECT * FROM companies WHERE seeded = ? ORDER BY kind, name', envOf(req)).map((c) => ({
  ...c,
  consents: Object.fromEntries(q.all('SELECT type, granted, updated_at FROM consents WHERE company_id = ?', c.id).map((k) => [k.type, { granted: !!k.granted, at: k.updated_at }])),
  referents: q.all('SELECT id, name, email, role, token FROM referents WHERE company_id = ?', c.id),
  roster: q.all('SELECT id, name, func FROM roster WHERE company_id = ? ORDER BY name', c.id),
}))));
// Persone iscritte (solo nome e funzione): ELIS le inserisce prima della sessione
app.post('/api/admin/companies/:id/roster', wrap((req, res) => {
  const c = q.get('SELECT * FROM companies WHERE id = ? AND seeded = ?', req.params.id, envOf(req)); if (!c) return bad(res, 'Azienda non trovata', 404);
  const name = txt(req.body?.name, 120), func = req.body?.func;
  if (!name) return bad(res, 'Inserire nome e cognome');
  if (!I.functions.some((f) => f.id === func)) return bad(res, 'Selezionare la funzione');
  // due omonimi si distinguono dalla funzione; stesso nome e stessa funzione è un doppione
  if (q.all('SELECT name, func FROM roster WHERE company_id = ?', c.id).some((r) => normName(r.name) === normName(name) && r.func === func)) return bad(res, 'Questa persona è già nell\'elenco');
  const r = q.run('INSERT INTO roster (company_id, name, func) VALUES (?,?,?)', c.id, name, func);
  audit(ADMIN, 'roster', r.lastInsertRowid, 'create', null, { company: c.name, name, func });
  return { id: Number(r.lastInsertRowid) };
}));
app.delete('/api/admin/roster/:id', wrap((req, res) => {
  const r = q.get('SELECT r.* FROM roster r JOIN companies c ON c.id = r.company_id WHERE r.id = ? AND c.seeded = ?', req.params.id, envOf(req)); if (!r) return bad(res, 'Persona non trovata', 404);
  const reason = txt(req.body?.reason, 1000); if (!reason) return bad(res, 'Scrivi il motivo: resta nel registro modifiche');
  const open = q.get(`SELECT s.title FROM participants p JOIN sessions s ON s.id = p.session_id WHERE p.company_id = ? AND p.removed = 0 AND s.phase != 'chiusa'
    AND p.roster_id = ? LIMIT 1`, r.company_id, r.id);
  if (open) return bad(res, `${r.name} è registrata in ${open.title}, ancora aperta: il referente la rimuove prima dal suo pannello`, 409);
  q.run('DELETE FROM roster WHERE id = ?', r.id); // le risposte già date restano: il partecipante non viene toccato
  audit(ADMIN, 'roster', r.id, 'delete', { name: r.name, func: r.func }, null, reason);
  return { ok: true };
}));
const CONSENTS = ['benchmark', 'peer', 'testimonianza', 'followup'];
app.post('/api/admin/companies', wrap((req, res) => {
  const { name, perimeter, sector, kind } = req.body || {};
  if (!txt(name, 150)) return bad(res, 'Nome obbligatorio');
  // le aziende DEMO le crea solo il caricamento dei dati dimostrativi; nell'ambiente di prova ogni nuova azienda è TEST
  const k = isProva(req) ? 'TEST' : ['REALE', 'TEST'].includes(kind) ? kind : 'REALE';
  const r = q.run('INSERT INTO companies (name, perimeter, sector, kind, join_code, seeded) VALUES (?,?,?,?,?,?)', txt(name, 150), txt(perimeter, 200), txt(sector, 100), k, shortCode(4), envOf(req));
  audit(ADMIN, 'company', r.lastInsertRowid, 'create', null, req.body);
  // consensi concessi di default (decisione del team): se l'azienda ne nega uno, si toglie la spunta con il motivo
  for (const t of CONSENTS) q.run('INSERT INTO consents (company_id, type, granted) VALUES (?,?,1)', r.lastInsertRowid, t);
  audit(ADMIN, 'consent', `${r.lastInsertRowid}/*`, 'grant', null, { granted: CONSENTS }, 'Concessi di default alla creazione dell\'azienda');
  return { id: Number(r.lastInsertRowid) };
}));
app.put('/api/admin/companies/:id', wrap((req, res) => {
  const before = q.get('SELECT * FROM companies WHERE id = ?', req.params.id); if (!before) return bad(res, 'Non trovata', 404);
  const { kind } = { ...before, ...req.body };
  const name = txt(req.body?.name ?? before.name, 150), perimeter = txt(req.body?.perimeter ?? before.perimeter, 200), sector = txt(req.body?.sector ?? before.sector, 100);
  if (!['REALE', 'TEST', 'DEMO'].includes(kind)) return bad(res, 'Tipo non valido');
  if (kind === 'DEMO' && before.kind !== 'DEMO') return bad(res, 'Un\'azienda non può diventare DEMO: i dati dimostrativi si caricano dall\'ambiente DEMO (pagina Programma o Percorso guidato)');
  // un'azienda dell'ambiente DEMO non diventa mai REALE: entrerebbe nel benchmark ufficiale (regole 3 e 6)
  if (kind === 'REALE' && before.kind !== 'REALE' && (before.seeded || before.kind === 'DEMO')) return bad(res, 'Un\'azienda DEMO non può diventare REALE');
  if (!name) return bad(res, 'Nome obbligatorio');
  q.run('UPDATE companies SET name = ?, perimeter = ?, sector = ?, kind = ? WHERE id = ?', name, perimeter, sector, kind, before.id);
  audit(ADMIN, 'company', before.id, 'update', before, { name, perimeter, sector, kind }, txt(req.body?.reason, 1000) || null);
  return { ok: true };
}));
app.put('/api/admin/companies/:id/consent', wrap((req, res) => {
  const { type, granted } = req.body || {};
  if (!CONSENTS.includes(type)) return bad(res, 'Tipo di consenso non valido');
  if (!q.get('SELECT 1 FROM companies WHERE id = ?', req.params.id)) return bad(res, 'Azienda non trovata', 404);
  if (!String(req.body?.reason || '').trim()) return bad(res, 'Indicare il motivo o il riferimento del consenso (es. "modulo firmato il 10/11")');
  const before = q.get('SELECT * FROM consents WHERE company_id = ? AND type = ?', req.params.id, type);
  q.run(`INSERT INTO consents (company_id, type, granted, updated_at) VALUES (?,?,?,datetime('now'))
         ON CONFLICT(company_id, type) DO UPDATE SET granted = excluded.granted, updated_at = excluded.updated_at`, req.params.id, type, granted ? 1 : 0);
  audit(ADMIN, 'consent', `${req.params.id}/${type}`, granted ? 'grant' : 'revoke', before, { granted: !!granted }, txt(req.body.reason, 1000));
  return { ok: true };
}));
// Dopo che i QR di una sessione sono stati generati, il referente dell'azienda non si cambia fino alla chiusura della sessione.
function referentLock(companyId) {
  return q.get(`SELECT s.title FROM session_company sc JOIN sessions s ON s.id = sc.session_id
    WHERE sc.company_id = ? AND sc.qr_generated_at IS NOT NULL AND s.phase != 'chiusa' ORDER BY s.date IS NULL, s.date LIMIT 1`, companyId);
}
// Eccezione da ELIS: durante il blocco il referente si cambia (o il link si revoca) solo con un motivo, che resta nel registro.
function lockReason(req, res, companyId) {
  const lock = referentLock(companyId); if (!lock) return { ok: true, reason: null };
  const reason = txt(req.body?.reason, 1000);
  if (!reason) { bad(res, `Il referente è bloccato: i QR di ${lock.title} sono già stati generati. Per cambiarlo scrivi il motivo (resta nel registro modifiche).`, 409); return { ok: false }; }
  return { ok: true, reason: `Eccezione al blocco (${lock.title}): ${reason}` };
}
const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
app.post('/api/admin/companies/:id/referents', wrap((req, res) => {
  const { name, email, role, func } = req.body || {};
  if (!String(name || '').trim()) return bad(res, 'Nome obbligatorio');
  // il referente risponde anche lui in sala: entra tra le persone iscritte, con la sua funzione reale
  if (!I.functions.some((f) => f.id === func)) return bad(res, 'Scegli la funzione del referente: serve per iscriverlo tra le persone che rispondono');
  if (email && !EMAIL.test(txt(email, 200))) return bad(res, 'Email non valida: scrivi un solo indirizzo, ad esempio nome@azienda.it');
  const lk = lockReason(req, res, req.params.id); if (!lk.ok) return;
  const t = token();
  if (!q.get('SELECT 1 FROM companies WHERE id = ?', req.params.id)) return bad(res, 'Azienda non trovata', 404);
  q.run('INSERT INTO referents (company_id, name, email, role, token) VALUES (?,?,?,?,?)', req.params.id, txt(name, 120), txt(email, 200), txt(role, 120), t);
  audit(ADMIN, 'referent', req.params.id, 'create', null, { name: txt(name, 120), email: txt(email, 200), role: txt(role, 120), func }, lk.reason);
  if (!q.all('SELECT name FROM roster WHERE company_id = ?', req.params.id).some((r) => normName(r.name) === normName(name))) {
    const r = q.run('INSERT INTO roster (company_id, name, func) VALUES (?,?,?)', req.params.id, txt(name, 120), func);
    audit(ADMIN, 'roster', r.lastInsertRowid, 'create', null, { name: txt(name, 120), func }, 'Referente iscritto in automatico');
  }
  return { token: t };
}));
app.post('/api/admin/referents/:id/regenerate', wrap((req, res) => {
  const r = q.get('SELECT * FROM referents WHERE id = ?', req.params.id); if (!r) return bad(res, 'Referente non trovato', 404);
  const lk = lockReason(req, res, r.company_id); if (!lk.ok) return;
  q.run('UPDATE referents SET token = ? WHERE id = ?', token(), r.id);
  audit(ADMIN, 'referent', r.id, 'regenerate_link', null, null, lk.reason || 'Link precedente disattivato');
  return { ok: true };
}));
app.delete('/api/admin/referents/:id', wrap((req, res) => {
  const r = q.get('SELECT * FROM referents WHERE id = ?', req.params.id); if (!r) return bad(res, 'Referente non trovato', 404);
  const lk = lockReason(req, res, r.company_id); if (!lk.ok) return;
  q.run('DELETE FROM referents WHERE id = ?', req.params.id);
  audit(ADMIN, 'referent', req.params.id, 'delete', { name: r.name }, null, lk.reason);
  return { ok: true };
}));
// L'email si corregge sempre, anche durante il blocco: non cambia il link personale.
app.put('/api/admin/referents/:id/email', wrap((req, res) => {
  const r = q.get('SELECT * FROM referents WHERE id = ?', req.params.id); if (!r) return bad(res, 'Referente non trovato', 404);
  const email = txt(req.body?.email, 200);
  if (email && !EMAIL.test(email)) return bad(res, 'Email non valida: scrivi un solo indirizzo, ad esempio nome@azienda.it');
  q.run('UPDATE referents SET email = ? WHERE id = ?', email || null, r.id);
  audit(ADMIN, 'referent', r.id, 'email', { email: r.email }, { email: email || null });
  return { ok: true };
}));

// Sessioni
app.get('/api/admin/sessions', wrap((req) => q.all('SELECT * FROM sessions WHERE seeded = ? ORDER BY date, id', envOf(req))));
app.post('/api/admin/sessions', wrap((req, res) => {
  const { base, date, channel, title } = req.body || {};
  const def = E.sessionDef(base); if (!def) return bad(res, 'Sessione base non valida');
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return bad(res, 'Data non valida');
  const r = q.run('INSERT INTO sessions (base, title, date, mode, channel, code, instrument_version, scoring_version, seeded) VALUES (?,?,?,?,?,?,?,?,?)',
    base, txt(title, 150) || `${def.name} · ad hoc · ${(date || '').split('-').reverse().join('/')}${isProva(req) ? ' · prova' : ''}`, date || null, 'adhoc', channel === 'remoto' ? 'remoto' : 'presenza', shortCode(5), I.version, E.SCORING.version, envOf(req));
  audit(ADMIN, 'session', r.lastInsertRowid, 'create', null, { base, date: date || null, channel, title: txt(title, 150) || null });
  return { id: Number(r.lastInsertRowid) };
}));
app.put('/api/admin/sessions/:id/phase', wrap((req, res) => {
  const s = L.getSession(req.params.id); if (!s) return bad(res, 'Non trovata', 404);
  if (!PHASES.includes(req.body?.phase)) return bad(res, 'Fase non valida');
  const from = PHASES.indexOf(s.phase), to = PHASES.indexOf(req.body.phase);
  // §2 indipendenza iniziale: dopo il confronto le risposte individuali non si riaprono
  if (to < from && to <= PHASES.indexOf('individuale') && from >= PHASES.indexOf('confronto'))
    return bad(res, 'Dopo il confronto non si può tornare alla fase individuale: le risposte sarebbero influenzate dalla vista dell\'azienda. Per un\'azienda che deve rifare la rilevazione usa una sessione ad hoc.');
  if (to < from && !String(req.body?.reason || '').trim()) return bad(res, 'Per tornare a una fase precedente indica il motivo');
  if (to > from + 1) return bad(res, 'Le fasi si aprono una alla volta: passa prima alla fase successiva');
  q.run('UPDATE sessions SET phase = ? WHERE id = ?', req.body.phase, s.id);
  audit(ADMIN, 'session', s.id, 'phase', { phase: s.phase }, { phase: req.body.phase }, txt(req.body?.reason, 1000) || null);
  return { ok: true };
}));
// Passo 3 della preparazione: ELIS segna l'invito al referente come inviato (l'email parte dal programma di posta).
app.post('/api/admin/sessions/:sid/companies/:cid/invited', wrap((req, res) => {
  const s = L.getSession(req.params.sid); const c = q.get('SELECT * FROM companies WHERE id = ?', req.params.cid);
  if (!s || !c || (s.seeded ? 1 : 0) !== (c.seeded ? 1 : 0)) return bad(res, 'Non trovata', 404);
  const before = L.ensureSessionCompany(s.id, c.id).invited_at;
  q.run("UPDATE session_company SET invited_at = datetime('now') WHERE session_id = ? AND company_id = ?", s.id, c.id);
  const after = q.get('SELECT invited_at FROM session_company WHERE session_id = ? AND company_id = ?', s.id, c.id).invited_at;
  audit(ADMIN, 'invite', `${s.id}/${c.id}`, 'sent', { invited_at: before }, { invited_at: after, session: s.title, company: c.name });
  return { ok: true };
}));
// Passo 4: genera i QR della sessione. Solo per aziende con referente; da quel momento il referente è bloccato.
// Sessioni del calendario: tutte le aziende dell'ambiente; sessioni ad hoc: un'azienda alla volta (companyId).
app.post('/api/admin/sessions/:sid/qr', wrap((req, res) => {
  const s = L.getSession(req.params.sid); if (!s) return bad(res, 'Non trovata', 404);
  if (s.phase === 'chiusa') return bad(res, 'La sessione è chiusa');
  const one = req.body?.companyId != null ? Number(req.body.companyId) : null;
  if (one != null && !Number.isInteger(one)) return bad(res, 'Azienda non valida');
  if (s.mode !== 'workshop' && !one) return bad(res, 'Nelle sessioni ad hoc i QR si generano un\'azienda alla volta');
  const cs = q.all(`SELECT c.* FROM companies c WHERE c.seeded = ? ${one ? 'AND c.id = ?' : ''} AND EXISTS (SELECT 1 FROM referents r WHERE r.company_id = c.id)`,
    ...(one ? [s.seeded ? 1 : 0, one] : [s.seeded ? 1 : 0]));
  let n = 0;
  for (const c of cs) {
    const sc = L.ensureSessionCompany(s.id, c.id);
    if (sc.qr_generated_at) continue;
    q.run("UPDATE session_company SET qr_generated_at = datetime('now') WHERE session_id = ? AND company_id = ?", s.id, c.id);
    audit(ADMIN, 'qr', `${s.id}/${c.id}`, 'generate', null, { session: s.title, company: c.name }, 'Da ora il referente è bloccato fino alla chiusura della sessione');
    n++;
  }
  if (one && !cs.length) return bad(res, 'Per generare il QR serve prima un referente');
  return { ok: true, generated: n };
}));
// Annullare il QR di un'azienda (es. generato sulla sessione sbagliata): solo con motivo e se nessuno si è ancora registrato.
app.delete('/api/admin/sessions/:sid/companies/:cid/qr', wrap((req, res) => {
  const s = L.getSession(req.params.sid); const c = q.get('SELECT * FROM companies WHERE id = ?', req.params.cid);
  if (!s || !c || (s.seeded ? 1 : 0) !== (c.seeded ? 1 : 0)) return bad(res, 'Non trovata', 404);
  const sc = q.get('SELECT * FROM session_company WHERE session_id = ? AND company_id = ?', s.id, c.id);
  if (!sc?.qr_generated_at) return bad(res, 'Il QR di questa azienda non è stato generato');
  const reason = txt(req.body?.reason, 1000); if (!reason) return bad(res, 'Scrivi il motivo: resta nel registro modifiche');
  if (L.activeParticipants(s.id, c.id).length) return bad(res, 'Non si può annullare: ci sono già partecipanti registrati con questo QR');
  q.run('UPDATE session_company SET qr_generated_at = NULL WHERE session_id = ? AND company_id = ?', s.id, c.id);
  audit(ADMIN, 'qr', `${s.id}/${c.id}`, 'undo', { qr_generated_at: sc.qr_generated_at }, { qr_generated_at: null }, reason);
  return { ok: true };
}));
app.get('/api/admin/sessions/:id/control', wrap((req, res) => {
  const s = L.getSession(req.params.id); if (!s) return bad(res, 'Non trovata', 404);
  const def = L.baseDef(s);
  const comps = q.all('SELECT * FROM companies WHERE seeded = ? ORDER BY name', s.seeded ? 1 : 0).map((c) => {
    const parts = L.activeParticipants(s.id, c.id);
    const sc = q.get('SELECT * FROM session_company WHERE session_id = ? AND company_id = ?', s.id, c.id);
    const ids = parts.map((p) => p.id);
    const answered = ids.length ? q.get(`SELECT COUNT(*) n FROM answers WHERE participant_id IN (${ids.map(() => '?').join(',')})`, ...ids).n : 0;
    const pre = L.getPresession(c.id, s.base);
    return { id: c.id, name: c.name, kind: c.kind, joinCode: c.join_code, participants: parts.length, submitted: parts.filter((p) => p.submitted_at).length,
      answered, expected: parts.length * def.items.length, functions: [...new Set(parts.map((p) => p.func))],
      presession: pre.updated_at, consolidated_at: sc?.consolidated_at || null, report_released_at: sc?.report_released_at || null,
      commitment: !!q.get('SELECT 1 FROM commitments WHERE session_id = ? AND company_id = ?', s.id, c.id),
      referents: q.all('SELECT id, name, email, token FROM referents WHERE company_id = ?', c.id), leader_call_note: sc?.leader_call_note || '', transcript_chars: sc?.leader_call_transcript?.length || 0, transcript_date: sc?.leader_call_at || null,
      invited_at: sc?.invited_at || null, qr_generated_at: sc?.qr_generated_at || null,
      // tutte le capacità della sessione al livello 5: segnale per la call (chiedere esempi concreti), solo per il team ELIS
      allTop: (() => { const lv = q.all('SELECT level FROM consolidated WHERE session_id = ? AND company_id = ? AND is_current = 1 AND level IS NOT NULL', s.id, c.id);
        return lv.length >= 2 && lv.every((x) => x.level === 5); })(),
      roster: q.all('SELECT name, func FROM roster WHERE company_id = ? ORDER BY name', c.id) };
  });
  const phaseSince = q.get("SELECT ts FROM audit WHERE entity = 'session' AND entity_id = ? AND action = 'phase' ORDER BY id DESC LIMIT 1", String(s.id))?.ts || null;
  return { session: s, def, baseUrl: baseUrl(), joinUrl: `${baseUrl()}/j/${s.code}`, companies: comps, phaseSince,
    benchmark: s.seeded ? [] : q.all('SELECT id, label, n_companies, created_at FROM benchmark_versions WHERE base = ? ORDER BY id DESC', s.base) };
}));
app.post('/api/admin/sessions/:sid/companies/:cid/release', wrap((req, res) => {
  const sc = q.get('SELECT * FROM session_company WHERE session_id = ? AND company_id = ?', req.params.sid, req.params.cid);
  if (!sc?.consolidated_at) return bad(res, 'L\'azienda non ha consolidato in questa sessione: non c\'è un report da rilasciare');
  const s = L.getSession(req.params.sid);
  if (!q.get('SELECT 1 FROM benchmark_versions WHERE base = ?', s.base) && !req.body?.withoutBenchmark)
    return bad(res, 'Benchmark di questa sessione non ancora congelato: congelalo prima di rilasciare, così il report contiene il confronto', 409);
  return { ok: true, ...L.releaseReport(Number(req.params.sid), Number(req.params.cid), ADMIN) };
}));
app.put('/api/admin/commitments/:id/status', wrap((req, res) => {
  const out = L.setCommitmentStatus(Number(req.params.id), req.body?.status, req.body?.note, ADMIN);
  if (!out.ok) return bad(res, out.errors.join(' · '));
  return out;
}));
app.get('/api/admin/companies/:cid/reports', wrap((req) => L.listSnapshots(Number(req.params.cid))));
app.get('/api/admin/companies/:cid/commitments', wrap((req) => q.all(`SELECT c.*, s.title session_title FROM commitments c JOIN sessions s ON s.id = c.session_id WHERE c.company_id = ? ORDER BY s.date`, req.params.cid)));
app.put('/api/admin/sessions/:sid/companies/:cid/note', wrap((req) => {
  L.ensureSessionCompany(req.params.sid, req.params.cid);
  q.run('UPDATE session_company SET leader_call_note = ? WHERE session_id = ? AND company_id = ?', txt(req.body?.note, 4000), req.params.sid, req.params.cid);
  audit(ADMIN, 'leader_call', `${req.params.sid}/${req.params.cid}`, 'note', null, { note: txt(req.body?.note, 4000) });
  return { ok: true };
}));

// Trascrizione Teams della call con il leader: si salva e si rilascia subito una nuova versione del report con l'appendice.
// Le versioni già rilasciate non cambiano (regola 2); il testo precedente resta nel registro modifiche (regola 1).
app.put('/api/admin/sessions/:sid/companies/:cid/transcript', wrap((req, res) => {
  const s = L.getSession(req.params.sid);
  const c = q.get('SELECT * FROM companies WHERE id = ? AND seeded = ?', req.params.cid, envOf(req));
  if (!s || !c || (s.seeded ? 1 : 0) !== c.seeded) return bad(res, 'Sessione o azienda non trovata', 404);
  const sc = q.get('SELECT * FROM session_company WHERE session_id = ? AND company_id = ?', s.id, c.id);
  if (!sc?.report_released_at) return bad(res, 'Rilascia prima il report: la call con il leader lo discute', 409);
  const text = String(req.body?.text ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, 300000);
  if (!text) return bad(res, 'Incolla la trascrizione della call');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.date || '') ? req.body.date : null;
  q.run('UPDATE session_company SET leader_call_transcript = ?, leader_call_at = ? WHERE session_id = ? AND company_id = ?', text, date, s.id, c.id);
  audit(ADMIN, 'leader_call', `${s.id}/${c.id}`, sc.leader_call_transcript ? 'transcript_update' : 'transcript',
    sc.leader_call_transcript ? { date: sc.leader_call_at, transcript: sc.leader_call_transcript } : null, { date, chars: text.length }, txt(req.body?.reason, 1000) || null);
  return { ok: true, ...L.releaseReport(s.id, c.id, ADMIN) };
}));

// Benchmark, plenaria, report
app.post('/api/admin/benchmark/:base/freeze', wrap((req, res) => {
  if (!E.sessionDef(req.params.base)) return bad(res, 'Sessione non valida');
  if (isProva(req)) return bad(res, 'Il benchmark ufficiale si congela solo in Produzione', 403);
  return L.freezeBenchmark(req.params.base, ADMIN);
}));
app.get('/api/admin/benchmark', wrap((req) => (isProva(req) ? [] : q.all('SELECT id, base, kind, label, n_companies, instrument_version, scoring_version, created_at FROM benchmark_versions ORDER BY id DESC'))));
app.get('/api/admin/live/:sid', wrap((req, res) => liveDashboard(Number(req.params.sid)) || bad(res, 'Sessione non trovata', 404)));
async function sendPdf(res, R) {
  const buf = await pdfBuffer(R);
  const fn = pdfFileName(R);
  res.setHeader('Content-Disposition', `attachment; filename="${fn.normalize('NFD').replace(/[^\x20-\x7E]/g, '').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(fn)}`);
  res.type('application/pdf').send(buf);
}
app.get('/api/admin/pdf/:cid', async (req, res) => {
  try {
    if (!q.get('SELECT 1 FROM companies WHERE id = ? AND seeded = ?', req.params.cid, envOf(req))) return bad(res, 'Azienda non trovata', 404);
    await sendPdf(res, reportFor(Number(req.params.cid), req, true));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Errore interno: riprova.' }); }
});
app.get('/api/admin/sessions/:sid/pdfs.zip', async (req, res) => {
  try {
    const s = L.getSession(req.params.sid); if (!s) return bad(res, 'Sessione non trovata', 404);
    const comps = q.all('SELECT company_id FROM session_company WHERE session_id = ? AND consolidated_at IS NOT NULL', s.id);
    if (!comps.length) return bad(res, 'Nessuna azienda ha ancora consolidato in questa sessione');
    // generare molti PDF occupa il server per alcuni secondi: durante una sessione in corso si chiede conferma
    const live = q.get("SELECT title FROM sessions WHERE phase IN ('individuale', 'confronto', 'consolidamento') AND seeded = ? LIMIT 1", s.seeded);
    if (live && req.query.force !== '1') return bad(res, `C'è una sessione in corso (${live.title}): generare lo zip rallenterebbe i telefoni per alcuni secondi. Meglio scaricarlo a sessione chiusa.`, 409);
    const zip = new JSZip();
    for (const c of comps) {
      // versione rilasciata per questa sessione se esiste, altrimenti bozza marcata come tale
      const snap = q.get("SELECT id FROM report_snapshots WHERE session_id = ? AND company_id = ? AND kind = 'sessione' ORDER BY version DESC LIMIT 1", s.id, c.company_id);
      const R = snap ? L.getSnapshot(c.company_id, snap.id) : { ...L.companyReport(c.company_id), draft: true };
      zip.file((snap ? '' : 'BOZZA_') + pdfFileName(R), await pdfBuffer(R));
      await new Promise((r) => setImmediate(r)); // lascia passare le altre richieste tra un PDF e l'altro
    }
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    res.setHeader('Content-Disposition', `attachment; filename="AITO_Map_report_${s.base}_${new Date().toISOString().slice(0, 10)}.zip"`);
    res.type('application/zip').send(buf);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Errore interno: riprova.' }); }
});
app.get('/api/admin/plenaria/:base', wrap((req, res) => (E.sessionDef(req.params.base) ? L.plenaria(req.params.base, { preview: isProva(req) }) : bad(res, 'Sessione non trovata', 404))));
app.get('/api/admin/maps/:base', wrap((req, res) => (I.sessions.some((x) => x.id === req.params.base) ? L.sessionMaps(req.params.base, { preview: isProva(req) }) : bad(res, 'Sessione non trovata', 404))));
// Report per l'admin: una versione rilasciata (?snap=id) oppure la bozza corrente, marcata come tale.
function reportFor(cid, req, admin) {
  if (admin && !q.get('SELECT 1 FROM companies WHERE id = ? AND seeded = ?', cid, envOf(req))) return null;
  if (req.query.snap) { const R = L.getSnapshot(cid, Number(req.query.snap)); if (R) return R; }
  if (admin) return { ...L.companyReport(cid, { final: req.query.final === '1' }), draft: true };
  return L.getSnapshot(cid);
}
app.get('/api/admin/report/:cid', wrap((req, res) => reportFor(Number(req.params.cid), req, true) || bad(res, 'Azienda non trovata in questo ambiente', 404)));
app.post('/api/admin/correct', wrap((req, res) => {
  const { companyId, itemId, level, sub, reason } = req.body || {};
  const co = q.get('SELECT seeded FROM companies WHERE id = ?', companyId);
  if (co && co.seeded !== envOf(req)) return bad(res, 'Hai cambiato ambiente (DEMO/Produzione) in un\'altra scheda: ricarica la pagina e riprova.', 409);
  if (co) setRequestEnv(co.seeded);
  const out = L.adminCorrect(companyId, itemId, level, sub, reason, ADMIN);
  if (!out.ok) return bad(res, out.errors.join(' · '));
  return out;
}));
// Allineamento finale: vista d'insieme, apertura, riapertura con motivo, rilascio del report unificato
const envCompany = (req, res) => {
  const c = q.get('SELECT * FROM companies WHERE id = ? AND seeded = ?', req.params.cid, envOf(req));
  if (!c) bad(res, 'Azienda non trovata', 404);
  return c;
};
app.get('/api/admin/alignment', wrap((req) => AL.overview(envOf(req))));
// "Primi passi": le domande consultate valgono per tutto il team, non solo per il browser di chi le ha aperte
app.get('/api/admin/flags', wrap((req) => ({ questionsSeen: getSetting(`questions_seen_${envOf(req) ? 'demo' : 'prod'}`) === '1' })));
app.post('/api/admin/flags/questions-seen', wrap((req) => { setSetting(`questions_seen_${envOf(req) ? 'demo' : 'prod'}`, '1'); return { ok: true }; }));
app.post('/api/admin/alignment/open', wrap((req, res) => {
  if (req.body?.env != null && Number(req.body.env) !== envOf(req)) return bad(res, 'Hai cambiato ambiente (DEMO/Produzione) in un\'altra scheda: ricarica la pagina e riprova.', 409);
  AL.setOpen(envOf(req), !!req.body?.open, ADMIN, txt(req.body?.reason, 1000)); return AL.overview(envOf(req)); }));
app.post('/api/admin/alignment/:cid/reopen', wrap((req, res) => {
  const c = envCompany(req, res); if (!c) return;
  const out = AL.reopen(c.id, txt(req.body?.reason, 1000), ADMIN);
  return out.ok ? { ...out, closed: !AL.isOpen(c.seeded) } : bad(res, out.errors.join(' · '));
}));
app.post('/api/admin/alignment/:cid/release', wrap((req, res) => {
  const c = envCompany(req, res); if (!c) return;
  const out = L.releaseFinalReport(c.id, ADMIN);
  return out.ok ? out : bad(res, out.errors.join(' · '));
}));
// Ambiente DEMO: stato del percorso guidato, caricamento, avanzamento e reset. Mai in Produzione.
const onlyDemo = (req, res) => { if (isProva(req)) return true; bad(res, 'Disponibile solo nell\'ambiente DEMO', 403); return false; };
app.get('/api/admin/demo', wrap((req) => ({ ...(isProva(req) ? tourState() : { present: hasDemo() }), vetrina: isProva(req) ? q.get("SELECT id FROM companies WHERE seeded = 1 AND kind = 'TEST' ORDER BY id LIMIT 1")?.id || null : null })));
app.post('/api/admin/demo/advance', wrap((req, res) => (onlyDemo(req, res) ? advanceDemo(['step', 'session', 'end'].includes(req.body?.mode) ? req.body.mode : 'step') : undefined)));
app.post('/api/admin/demo/reset', wrap((req, res) => (onlyDemo(req, res) ? resetDemo() : undefined)));
// Elenco dei commitment dell'ambiente corrente, per la verifica dopo le sessioni (§11, §12)
app.get('/api/admin/commitments', wrap((req) => q.all(`SELECT m.*, c.name company_name, c.kind company_kind, s.title session_title, s.base, s.date session_date
  FROM commitments m JOIN companies c ON c.id = m.company_id JOIN sessions s ON s.id = m.session_id WHERE c.seeded = ? ORDER BY s.date, c.name`, envOf(req))));
// Percorso di un'azienda nelle sessioni dell'ambiente corrente
app.get('/api/admin/companies/:cid/journey', wrap((req) => {
  const c = q.get('SELECT * FROM companies WHERE id = ?', req.params.cid); if (!c) return [];
  return q.all('SELECT * FROM sessions WHERE seeded = ? ORDER BY date, id', c.seeded ? 1 : 0).map((s) => {
    const sc = q.get('SELECT * FROM session_company WHERE session_id = ? AND company_id = ?', s.id, c.id);
    const parts = L.activeParticipants(s.id, c.id);
    return { id: s.id, title: s.title, base: s.base, date: s.date, mode: s.mode, phase: s.phase,
      presession: L.getPresession(c.id, s.base).updated_at || null, participants: parts.length, submitted: parts.filter((p) => p.submitted_at).length,
      consolidated_at: sc?.consolidated_at || null, report_released_at: sc?.report_released_at || null, leader_call_note: sc?.leader_call_note || '', transcript_chars: sc?.leader_call_transcript?.length || 0, transcript_date: sc?.leader_call_at || null,
      qr_generated_at: sc?.qr_generated_at || null,
      commitment: q.get('SELECT priority_item, status FROM commitments WHERE session_id = ? AND company_id = ?', s.id, c.id) || null };
  });
}));
// carica = programma concluso; per vedere il processo dall'inizio c'è il reset
app.post('/api/admin/demo', wrap((req, res) => (onlyDemo(req, res) ? loadDemoComplete() : undefined)));
app.delete('/api/admin/demo', wrap((req, res) => (onlyDemo(req, res) ? removeDemo() : undefined)));
// registro modifiche dell'ambiente corrente
app.get('/api/admin/audit', wrap((req) => q.all('SELECT * FROM audit WHERE seeded = ? ORDER BY id DESC LIMIT 500', envOf(req))));
app.get('/api/admin/export.xlsx', async (req, res) => {
  try {
    const buf = await buildExport();
    res.setHeader('Content-Disposition', `attachment; filename="AITO_Map_export_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(buf));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Errore interno: riprova.' }); }
});

// Report e plenaria richiamabili anche dal referente (solo report rilasciato)
app.get('/api/report/:cid/pdf', async (req, res) => {
  try {
    const cid = Number(req.params.cid);
    if (isAdmin(req) && !req.query.t) { const R = reportFor(cid, req, true); return R ? await sendPdf(res, R) : bad(res, 'Azienda non trovata in questo ambiente', 404); }
    const r = q.get('SELECT * FROM referents WHERE token = ?', String(req.query.t || ''));
    if (!r || r.company_id !== cid) return bad(res, 'Non autorizzato', 401);
    const R = reportFor(cid, req, false);
    if (!R) return bad(res, 'Report non ancora rilasciato', 403);
    await sendPdf(res, R);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Errore interno: riprova.' }); }
});
app.get('/api/report/:cid', wrap((req, res) => {
  const cid = Number(req.params.cid);
  if (isAdmin(req) && !req.query.t) return reportFor(cid, req, true) || bad(res, 'Azienda non trovata in questo ambiente (controlla DEMO/Produzione)', 404);
  const r = q.get('SELECT * FROM referents WHERE token = ?', String(req.query.t || ''));
  if (!r || r.company_id !== cid) return bad(res, 'Non autorizzato', 401);
  const R = reportFor(cid, req, false);
  if (!R) return bad(res, 'Report non ancora rilasciato', 403);
  return R;
}));

process.on('unhandledRejection', (e) => console.error('Errore non gestito:', e));
process.on('uncaughtException', (e) => console.error('Eccezione non gestita:', e));

export function start(port = PORT) {
  console.log(`  Accesso DEMO: ${envDemoPw().length >= 8 ? 'variabile DEMO_PASSWORD letta' : 'variabile DEMO_PASSWORD assente o corta'} · SESSION_SECRET ${envSecret.length >= 16 ? 'letta' : 'assente'}`);
  if (process.env.DEMO_DATA === '1' && !hasDemo()) { try { const d = loadDemoComplete(); console.log(`  Dati DEMO caricati, programma concluso: ${d.company?.name}, ${d.sessions?.length} sessioni chiuse`); } catch (e) { console.error('Dati dimostrativi non caricati:', e.message); } }
  return app.listen(port, '0.0.0.0', () => {
    console.log('\n  AITO — AI Transformation & Adoption Map');
    console.log('  ─────────────────────────────────────────');
    console.log(`  Su questo computer:   http://localhost:${port}/admin`);
    console.log(`  Dai telefoni (Wi-Fi): ${baseUrl()}`);
    console.log(`  Database:             ${DB_PATH}`);
    if (firstPassword && !process.env.ADMIN_PASSWORD) console.log(`\n  Password admin iniziale: ${firstPassword}   (cambiala da Impostazioni)`);
    else if (firstPassword) console.log('\n  Password admin: quella impostata nella variabile ADMIN_PASSWORD');
    console.log('\n  Per fermare il server: Ctrl+C\n');
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();
export { app, db };
