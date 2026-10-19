// AITO — AI Transformation & Adoption Map · server locale
import express from 'express';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { q, db, DB_PATH, token, shortCode, audit, getSetting, setSetting } from './db.js';
import * as L from './logic.js';
import * as E from './engine/index.js';
import { buildExport } from './export.js';

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
  const x = crypto.scryptSync(pw, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(x), Buffer.from(h));
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
app.set('trust proxy', 1);
app.get('/healthz', (req, res) => res.send('ok'));
app.use(express.json({ limit: '1mb' }));
app.use('/static', express.static(PUBLIC, { maxAge: 0 }));
const page = (f) => (req, res) => res.sendFile(path.join(PUBLIC, f));
app.get('/', page('index.html'));
app.get('/admin', page('admin.html'));
app.get('/j/:code', page('join.html'));
app.get('/r/:token', page('ref.html'));
app.get('/report/:companyId', page('report.html'));
app.get('/plenaria/:base', page('plenaria.html'));

const wrap = (fn) => (req, res) => {
  try { const r = fn(req, res); if (r !== undefined) res.json(r); }
  catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
};
const bad = (res, msg, code = 400) => { res.status(code).json({ error: msg }); };

app.get('/api/instrument', wrap(() => ({ instrument: I, scoring: E.SCORING })));
app.get('/api/qr.svg', async (req, res) => {
  const svg = await QRCode.toString(String(req.query.text || ''), { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  res.type('image/svg+xml').send(svg);
});

// ---------- Partecipanti ----------
app.get('/api/join/:code', wrap((req, res) => {
  const s = q.get('SELECT id, title, base, phase FROM sessions WHERE code = ?', req.params.code);
  if (!s) return bad(res, 'Sessione non trovata', 404);
  const companies = q.all("SELECT id, name, join_code FROM companies WHERE kind != 'DEMO' ORDER BY name");
  return { session: s, companies: companies.map((c) => ({ id: c.id, name: c.name, code: c.join_code })), functions: I.functions };
}));

app.post('/api/join/:code', wrap((req, res) => {
  const s = q.get('SELECT * FROM sessions WHERE code = ?', req.params.code);
  if (!s) return bad(res, 'Sessione non trovata', 404);
  if (!['preparazione', 'individuale'].includes(s.phase)) return bad(res, 'La fase individuale è chiusa: non è più possibile registrarsi a questa sessione.');
  const { companyId, name, func, email } = req.body || {};
  const c = q.get("SELECT * FROM companies WHERE id = ? AND kind != 'DEMO'", companyId);
  if (!c) return bad(res, 'Selezionare un\'azienda');
  if (!String(name || '').trim()) return bad(res, 'Inserire nome e cognome');
  if (!I.functions.some((f) => f.id === func)) return bad(res, 'Selezionare la funzione');
  const t = token();
  q.run('INSERT INTO participants (session_id, company_id, name, func, email, token) VALUES (?,?,?,?,?,?)', s.id, c.id, String(name).trim(), func, email || null, t);
  L.ensureSessionCompany(s.id, c.id);
  return { token: t };
}));

function participant(req, res) {
  const p = q.get('SELECT * FROM participants WHERE token = ?', req.params.t);
  if (!p) { bad(res, 'Partecipante non riconosciuto', 404); return null; }
  if (p.removed) { bad(res, 'La registrazione è stata annullata dal referente aziendale', 403); return null; }
  return p;
}

app.get('/api/p/:t', wrap((req, res) => {
  const p = participant(req, res); if (!p) return;
  const st = L.participantState(p);
  const company = q.get('SELECT name FROM companies WHERE id = ?', p.company_id);
  const out = { participant: { name: p.name, func: p.func, submitted_at: p.submitted_at }, company: company.name,
    session: { id: st.session.id, title: st.session.title, base: st.session.base, phase: st.session.phase },
    items: st.def.items.map((id) => ({ id, ...I.items[id] })), pairs: st.def.pairs, pairQuestion: I.pairQuestion,
    answers: st.answers, answered: st.answered, pairAnswers: st.pairs };
  if (['confronto', 'consolidamento', 'chiusa'].includes(st.session.phase)) out.comparison = L.companyComparison(p.session_id, p.company_id);
  return out;
}));

app.put('/api/p/:t/answer', wrap((req, res) => {
  const p = participant(req, res); if (!p) return;
  const s = L.getSession(p.session_id);
  if (s.phase !== 'individuale') return bad(res, 'La fase individuale non è aperta');
  const { itemId, level } = req.body;
  if (!L.baseDef(s).items.includes(itemId)) return bad(res, 'Item non previsto');
  const lv = level == null ? null : Number(level);
  if (lv != null && !(lv >= 1 && lv <= 5)) return bad(res, 'Livello non valido');
  q.run(`INSERT INTO answers (participant_id, item_id, level, updated_at) VALUES (?,?,?,datetime('now'))
         ON CONFLICT(participant_id, item_id) DO UPDATE SET level = excluded.level, updated_at = excluded.updated_at`, p.id, itemId, lv);
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
  return { ok: true };
}));

app.post('/api/p/:t/submit', wrap((req, res) => {
  const p = participant(req, res); if (!p) return;
  const s = L.getSession(p.session_id);
  const def = L.baseDef(s);
  const n = q.get('SELECT COUNT(*) n FROM answers WHERE participant_id = ?', p.id).n;
  const np = q.get('SELECT COUNT(*) n FROM pair_answers WHERE participant_id = ?', p.id).n;
  if (n < def.items.length || np < def.pairs.length) return bad(res, 'Rispondere a tutti gli item (anche con N.D.) e ai confronti a coppie');
  q.run("UPDATE participants SET submitted_at = datetime('now') WHERE id = ?", p.id);
  return { ok: true };
}));

// ---------- Referente aziendale ----------
function referent(req, res) {
  const r = q.get('SELECT r.*, c.name company_name, c.kind company_kind, c.perimeter FROM referents r JOIN companies c ON c.id = r.company_id WHERE r.token = ?', req.params.t);
  if (!r) { bad(res, 'Link referente non valido', 404); return null; }
  return r;
}
const refActor = (r) => `referente:${r.id}:${r.name}`;

app.get('/api/r/:t', wrap((req, res) => {
  const r = referent(req, res); if (!r) return;
  const sessions = q.all('SELECT * FROM sessions ORDER BY date, id').map((s) => {
    const sc = q.get('SELECT * FROM session_company WHERE session_id = ? AND company_id = ?', s.id, r.company_id);
    const pre = L.getPresession(r.company_id, s.base);
    return { ...s, consolidated_at: sc?.consolidated_at || null, report_released_at: sc?.report_released_at || null,
      presession_updated_at: pre.updated_at, participants: L.activeParticipants(s.id, r.company_id).length };
  }).filter((s) => s.mode === 'workshop' || s.participants > 0 || s.consolidated_at || q.get('SELECT 1 FROM session_company WHERE session_id = ? AND company_id = ?', s.id, r.company_id));
  return { referent: { name: r.name, companyId: r.company_id, company: r.company_name, perimeter: r.perimeter, kind: r.company_kind }, sessions,
    reportAvailable: !!q.get('SELECT 1 FROM session_company WHERE company_id = ? AND report_released_at IS NOT NULL', r.company_id) };
}));

app.get('/api/r/:t/presession/:base', wrap((req, res) => {
  const r = referent(req, res); if (!r) return;
  if (!E.sessionDef(req.params.base)) return bad(res, 'Sessione non valida');
  return { fields: L.presessionFields(req.params.base), saved: L.getPresession(r.company_id, req.params.base), session: E.sessionDef(req.params.base) };
}));
app.put('/api/r/:t/presession/:base', wrap((req, res) => {
  const r = referent(req, res); if (!r) return;
  if (!E.sessionDef(req.params.base)) return bad(res, 'Sessione non valida');
  L.savePresession(r.company_id, req.params.base, req.body.data || {}, refActor(r));
  return { ok: true };
}));

app.get('/api/r/:t/session/:sid', wrap((req, res) => {
  const r = referent(req, res); if (!r) return;
  const s = L.getSession(req.params.sid); if (!s) return bad(res, 'Sessione non trovata', 404);
  const parts = L.activeParticipants(s.id, r.company_id).map((p) => ({ id: p.id, name: p.name, func: p.func, submitted: !!p.submitted_at }));
  const out = { session: s, participants: parts, joinUrl: `${baseUrl()}/j/${s.code}?c=${q.get('SELECT join_code FROM companies WHERE id = ?', r.company_id).join_code}` };
  if (['confronto', 'consolidamento', 'chiusa'].includes(s.phase)) out.consolidation = L.consolidationView(s.id, r.company_id);
  return out;
}));
app.delete('/api/r/:t/session/:sid/participant/:pid', wrap((req, res) => {
  const r = referent(req, res); if (!r) return;
  const p = q.get('SELECT * FROM participants WHERE id = ? AND company_id = ? AND session_id = ?', req.params.pid, r.company_id, req.params.sid);
  if (!p) return bad(res, 'Partecipante non trovato', 404);
  q.run('UPDATE participants SET removed = 1 WHERE id = ?', p.id);
  audit(refActor(r), 'participant', p.id, 'remove', { name: p.name }, null, req.body?.reason || 'Rimosso dal referente');
  return { ok: true };
}));
app.put('/api/r/:t/session/:sid/draft', wrap((req, res) => {
  const r = referent(req, res); if (!r) return;
  L.saveDraft(Number(req.params.sid), r.company_id, req.body || {});
  return { ok: true };
}));
app.post('/api/r/:t/session/:sid/confirm', wrap((req, res) => {
  const r = referent(req, res); if (!r) return;
  const s = L.getSession(req.params.sid);
  if (s.phase !== 'consolidamento') return bad(res, 'Il consolidamento è aperto solo nella fase di consolidamento');
  const out = L.confirmConsolidation(s.id, r.company_id, req.body || {}, refActor(r));
  if (!out.ok) return bad(res, out.errors.join(' · '));
  return out;
}));
app.put('/api/r/:t/session/:sid/commitment', wrap((req, res) => {
  const r = referent(req, res); if (!r) return;
  const out = L.saveCommitment(Number(req.params.sid), r.company_id, req.body || {}, refActor(r));
  if (!out.ok) return bad(res, out.errors.join(' · '));
  return out;
}));
app.get('/api/r/:t/report', wrap((req, res) => {
  const r = referent(req, res); if (!r) return;
  if (!q.get('SELECT 1 FROM session_company WHERE company_id = ? AND report_released_at IS NOT NULL', r.company_id)) return bad(res, 'Il report non è ancora stato rilasciato da ELIS', 403);
  return L.companyReport(r.company_id);
}));

// ---------- Admin ELIS ----------
function cookie(req, name) {
  const m = (req.headers.cookie || '').split(';').map((x) => x.trim().split('=')).find(([k]) => k === name);
  return m ? decodeURIComponent(m[1]) : null;
}
function isAdmin(req) {
  const t = cookie(req, 'aito_admin');
  return t && q.get('SELECT 1 FROM admin_tokens WHERE token = ?', t);
}
function requireAdmin(req, res, next) { if (isAdmin(req)) return next(); bad(res, 'Accesso admin richiesto', 401); }
const ADMIN = 'admin';

const loginFails = new Map(); // limite ai tentativi: 10 errori ogni 15 minuti per indirizzo
app.post('/api/admin/login', wrap((req, res) => {
  const now = Date.now();
  const f = (loginFails.get(req.ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (f.length >= 10) return bad(res, 'Troppi tentativi: riprova tra qualche minuto', 429);
  if (!checkPw(String(req.body?.password || ''), getSetting('admin_pw'))) { f.push(now); loginFails.set(req.ip, f); return bad(res, 'Password errata', 401); }
  loginFails.delete(req.ip);
  const t = token(24);
  q.run('INSERT INTO admin_tokens (token) VALUES (?)', t);
  res.setHeader('Set-Cookie', `aito_admin=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 14}${req.secure ? '; Secure' : ''}`);
  return { ok: true };
}));
app.post('/api/admin/logout', wrap((req, res) => {
  q.run('DELETE FROM admin_tokens WHERE token = ?', cookie(req, 'aito_admin') || '');
  res.setHeader('Set-Cookie', 'aito_admin=; Path=/; Max-Age=0');
  return { ok: true };
}));
app.get('/api/admin/me', wrap((req) => ({ admin: !!isAdmin(req) })));
app.use('/api/admin', requireAdmin);

app.put('/api/admin/password', wrap((req, res) => {
  const pw = String(req.body?.password || '');
  if (pw.length < 8) return bad(res, 'Almeno 8 caratteri');
  setSetting('admin_pw', hashPw(pw)); audit(ADMIN, 'settings', 'admin_pw', 'change', null, null);
  return { ok: true };
}));
app.get('/api/admin/network', wrap(() => ({ baseUrl: baseUrl(), custom: getSetting('public_url') || null, addresses: lanAddresses(), port: PORT, db: DB_PATH })));
app.put('/api/admin/network', wrap((req) => { setSetting('public_url', String(req.body?.url || '')); return { ok: true, baseUrl: baseUrl() }; }));

// Aziende
app.get('/api/admin/companies', wrap(() => q.all('SELECT * FROM companies ORDER BY kind, name').map((c) => ({
  ...c,
  consents: Object.fromEntries(q.all('SELECT type, granted, updated_at FROM consents WHERE company_id = ?', c.id).map((k) => [k.type, { granted: !!k.granted, at: k.updated_at }])),
  referents: q.all('SELECT id, name, email, role, token FROM referents WHERE company_id = ?', c.id),
}))));
app.post('/api/admin/companies', wrap((req, res) => {
  const { name, perimeter, sector, kind } = req.body || {};
  if (!String(name || '').trim()) return bad(res, 'Nome obbligatorio');
  const k = ['REALE', 'TEST', 'DEMO'].includes(kind) ? kind : 'REALE';
  const r = q.run('INSERT INTO companies (name, perimeter, sector, kind, join_code) VALUES (?,?,?,?,?)', name.trim(), perimeter || '', sector || '', k, shortCode(4));
  audit(ADMIN, 'company', r.lastInsertRowid, 'create', null, req.body);
  return { id: Number(r.lastInsertRowid) };
}));
app.put('/api/admin/companies/:id', wrap((req, res) => {
  const before = q.get('SELECT * FROM companies WHERE id = ?', req.params.id); if (!before) return bad(res, 'Non trovata', 404);
  const { name, perimeter, sector, kind } = { ...before, ...req.body };
  q.run('UPDATE companies SET name = ?, perimeter = ?, sector = ?, kind = ? WHERE id = ?', name, perimeter, sector, kind, before.id);
  audit(ADMIN, 'company', before.id, 'update', before, { name, perimeter, sector, kind }, req.body?.reason || null);
  return { ok: true };
}));
app.put('/api/admin/companies/:id/consent', wrap((req, res) => {
  const { type, granted } = req.body || {};
  if (!['benchmark', 'peer', 'testimonianza', 'followup'].includes(type)) return bad(res, 'Tipo di consenso non valido');
  const before = q.get('SELECT * FROM consents WHERE company_id = ? AND type = ?', req.params.id, type);
  q.run(`INSERT INTO consents (company_id, type, granted, updated_at) VALUES (?,?,?,datetime('now'))
         ON CONFLICT(company_id, type) DO UPDATE SET granted = excluded.granted, updated_at = excluded.updated_at`, req.params.id, type, granted ? 1 : 0);
  audit(ADMIN, 'consent', `${req.params.id}/${type}`, granted ? 'grant' : 'revoke', before, { granted: !!granted });
  return { ok: true };
}));
app.post('/api/admin/companies/:id/referents', wrap((req, res) => {
  const { name, email, role } = req.body || {};
  if (!String(name || '').trim()) return bad(res, 'Nome obbligatorio');
  const t = token();
  q.run('INSERT INTO referents (company_id, name, email, role, token) VALUES (?,?,?,?,?)', req.params.id, name.trim(), email || '', role || '', t);
  audit(ADMIN, 'referent', req.params.id, 'create', null, { name, email, role });
  return { token: t };
}));
app.delete('/api/admin/referents/:id', wrap((req) => {
  const r = q.get('SELECT * FROM referents WHERE id = ?', req.params.id);
  q.run('DELETE FROM referents WHERE id = ?', req.params.id);
  audit(ADMIN, 'referent', req.params.id, 'delete', r, null);
  return { ok: true };
}));

// Sessioni
app.get('/api/admin/sessions', wrap(() => q.all('SELECT * FROM sessions ORDER BY date, id')));
app.post('/api/admin/sessions', wrap((req, res) => {
  const { base, date, channel, title } = req.body || {};
  const def = E.sessionDef(base); if (!def) return bad(res, 'Sessione base non valida');
  const r = q.run('INSERT INTO sessions (base, title, date, mode, channel, code, instrument_version, scoring_version) VALUES (?,?,?,?,?,?,?,?)',
    base, title || `${def.name} · ad hoc · ${(date || '').split('-').reverse().join('/')}`, date || null, 'adhoc', channel === 'remoto' ? 'remoto' : 'presenza', shortCode(5), I.version, E.SCORING.version);
  audit(ADMIN, 'session', r.lastInsertRowid, 'create', null, req.body);
  return { id: Number(r.lastInsertRowid) };
}));
app.put('/api/admin/sessions/:id/phase', wrap((req, res) => {
  const s = L.getSession(req.params.id); if (!s) return bad(res, 'Non trovata', 404);
  if (!PHASES.includes(req.body?.phase)) return bad(res, 'Fase non valida');
  q.run('UPDATE sessions SET phase = ? WHERE id = ?', req.body.phase, s.id);
  audit(ADMIN, 'session', s.id, 'phase', { phase: s.phase }, { phase: req.body.phase });
  return { ok: true };
}));
app.get('/api/admin/sessions/:id/control', wrap((req, res) => {
  const s = L.getSession(req.params.id); if (!s) return bad(res, 'Non trovata', 404);
  const def = L.baseDef(s);
  const comps = q.all("SELECT * FROM companies WHERE kind != 'DEMO' ORDER BY name").map((c) => {
    const parts = L.activeParticipants(s.id, c.id);
    const sc = q.get('SELECT * FROM session_company WHERE session_id = ? AND company_id = ?', s.id, c.id);
    const ids = parts.map((p) => p.id);
    const answered = ids.length ? q.get(`SELECT COUNT(*) n FROM answers WHERE participant_id IN (${ids.map(() => '?').join(',')})`, ...ids).n : 0;
    const pre = L.getPresession(c.id, s.base);
    return { id: c.id, name: c.name, kind: c.kind, joinCode: c.join_code, participants: parts.length, submitted: parts.filter((p) => p.submitted_at).length,
      answered, expected: parts.length * def.items.length, functions: [...new Set(parts.map((p) => p.func))],
      presession: pre.updated_at, consolidated_at: sc?.consolidated_at || null, report_released_at: sc?.report_released_at || null,
      commitment: !!q.get('SELECT 1 FROM commitments WHERE session_id = ? AND company_id = ?', s.id, c.id),
      referents: q.all('SELECT id, name, token FROM referents WHERE company_id = ?', c.id), leader_call_note: sc?.leader_call_note || '' };
  });
  return { session: s, def, baseUrl: baseUrl(), joinUrl: `${baseUrl()}/j/${s.code}`, companies: comps,
    benchmark: q.all('SELECT id, label, n_companies, created_at FROM benchmark_versions WHERE base = ? ORDER BY id DESC', s.base) };
}));
app.post('/api/admin/sessions/:sid/companies/:cid/release', wrap((req) => {
  L.ensureSessionCompany(req.params.sid, req.params.cid);
  q.run("UPDATE session_company SET report_released_at = datetime('now') WHERE session_id = ? AND company_id = ?", req.params.sid, req.params.cid);
  audit(ADMIN, 'report', `${req.params.sid}/${req.params.cid}`, 'release', null, null);
  return { ok: true };
}));
app.put('/api/admin/sessions/:sid/companies/:cid/note', wrap((req) => {
  L.ensureSessionCompany(req.params.sid, req.params.cid);
  q.run('UPDATE session_company SET leader_call_note = ? WHERE session_id = ? AND company_id = ?', req.body?.note || '', req.params.sid, req.params.cid);
  audit(ADMIN, 'leader_call', `${req.params.sid}/${req.params.cid}`, 'note', null, { note: req.body?.note });
  return { ok: true };
}));

// Benchmark, plenaria, report
app.post('/api/admin/benchmark/:base/freeze', wrap((req, res) => {
  if (!E.sessionDef(req.params.base)) return bad(res, 'Sessione non valida');
  return L.freezeBenchmark(req.params.base, ADMIN);
}));
app.get('/api/admin/benchmark', wrap(() => q.all('SELECT id, base, kind, label, n_companies, instrument_version, scoring_version, created_at FROM benchmark_versions ORDER BY id DESC')));
app.get('/api/admin/plenaria/:base', wrap((req) => L.plenaria(req.params.base, { preview: req.query.preview === '1' })));
app.get('/api/admin/report/:cid', wrap((req) => L.companyReport(Number(req.params.cid), { preview: req.query.preview === '1' })));
app.post('/api/admin/correct', wrap((req, res) => {
  const { companyId, itemId, level, sub, reason } = req.body || {};
  const out = L.adminCorrect(companyId, itemId, level, sub, reason, ADMIN);
  if (!out.ok) return bad(res, out.errors.join(' · '));
  return out;
}));
app.get('/api/admin/audit', wrap(() => q.all('SELECT * FROM audit ORDER BY id DESC LIMIT 500')));
app.get('/api/admin/export.xlsx', async (req, res) => {
  try {
    const buf = await buildExport();
    res.setHeader('Content-Disposition', `attachment; filename="AITO_Map_export_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(buf));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// Report e plenaria richiamabili anche dal referente (solo report rilasciato)
app.get('/api/report/:cid', wrap((req, res) => {
  if (isAdmin(req)) return L.companyReport(Number(req.params.cid), { preview: req.query.preview === '1' });
  const r = q.get('SELECT * FROM referents WHERE token = ?', String(req.query.t || ''));
  if (!r || r.company_id !== Number(req.params.cid)) return bad(res, 'Non autorizzato', 401);
  if (!q.get('SELECT 1 FROM session_company WHERE company_id = ? AND report_released_at IS NOT NULL', r.company_id)) return bad(res, 'Report non ancora rilasciato', 403);
  return L.companyReport(r.company_id);
}));

export function start(port = PORT) {
  return app.listen(port, '0.0.0.0', () => {
    console.log('\n  AITO — AI Transformation & Adoption Map');
    console.log('  ─────────────────────────────────────────');
    console.log(`  Su questo computer:   http://localhost:${port}/admin`);
    console.log(`  Dai telefoni (Wi-Fi): ${baseUrl()}`);
    console.log(`  Database:             ${DB_PATH}`);
    if (firstPassword) console.log(`\n  Password admin iniziale: ${firstPassword}   (cambiala da Impostazioni)`);
    console.log('\n  Per fermare il server: Ctrl+C\n');
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();
export { app, db };
