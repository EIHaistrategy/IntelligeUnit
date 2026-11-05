// Pomeriggio delle sessioni: votazione dei need (docs/REQUISITI_POMERIGGIO.md).
// Sezione a sé (R1): non legge e non scrive score, fasce, benchmark, priorità o commitment della Map.
// Fasi proprie della sessione (pm_phase), indipendenti da quelle della Map (R2). Nessuna classifica (R3).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q, tx, audit, token, shortCode } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const PM = JSON.parse(readFileSync(path.join(here, 'instrument/pomeriggio-1.0.json'), 'utf8'));
const PHASES = PM.phases.map((p) => p.id);
const LIM = PM.limits;
const txt = (v, max) => String(v ?? '').trim().slice(0, max);
const parse = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };
const err = (msg) => ({ ok: false, errors: [msg] });
export const priorityLabel = (v) => PM.priority.find((p) => p.value === v)?.label || '';
export const horizonLabel = (v) => PM.horizon.find((h) => h.value === v)?.label || '';
// stesso confronto dei nomi del mattino: maiuscole, accenti e spazi non contano
const normName = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();

const session = (id) => q.get('SELECT id, title, base, seeded, pm_phase, code FROM sessions WHERE id = ?', id);
export const tableRow = (id) => q.get('SELECT * FROM pm_tables WHERE id = ?', id);
const needsOf = (tableId) => q.all('SELECT id, code, title, descr FROM pm_needs WHERE table_id = ? ORDER BY CAST(substr(code, 2) AS INTEGER)', tableId);
const votersOf = (tableId) => q.get('SELECT COUNT(*) n FROM pm_votes WHERE table_id = ? AND is_current = 1', tableId).n;
// tavoli in ordine di etichetta: 1, 2, …, 4a, 4b, 10 (numero, poi lettera)
const byLabel = (a, b) => (parseInt(a.label, 10) || 0) - (parseInt(b.label, 10) || 0) || a.label.localeCompare(b.label);
export const needKey = (t, n) => `${t.label}-${n.code}`;

// ---------- Fasi ----------
export function setPhase(sessionId, to, reason, actor) {
  const s = session(sessionId);
  if (!s) return err('Sessione non trovata');
  const from = PHASES.indexOf(s.pm_phase), dest = PHASES.indexOf(to);
  if (dest < 0) return err('Fase non valida');
  if (Math.abs(dest - from) !== 1) return err('Le fasi del pomeriggio vanno avanti una alla volta');
  if (dest < from && !String(reason || '').trim()) return err('Per tornare indietro indica il motivo');
  tx(() => {
    // dalla plenaria in poi nessuno vota più: i tavoli con il voto aperto si chiudono
    if (to === 'plenaria') {
      for (const t of q.all("SELECT id FROM pm_tables WHERE session_id = ? AND status = 'voto'", sessionId)) {
        q.run("UPDATE pm_tables SET status = 'chiuso', closed_at = datetime('now') WHERE id = ?", t.id);
        audit(actor, 'pm_table', t.id, 'close', { status: 'voto' }, { status: 'chiuso' }, 'Passaggio alla plenaria');
      }
    }
    q.run('UPDATE sessions SET pm_phase = ? WHERE id = ?', to, sessionId);
    audit(actor, 'pm_phase', sessionId, dest > from ? 'forward' : 'back', { phase: s.pm_phase }, { phase: to }, txt(reason, 1000) || null);
  });
  return { ok: true };
}

// ---------- Tavoli (regia) ----------
export function tablesOf(sessionId) {
  return q.all('SELECT * FROM pm_tables WHERE session_id = ?', sessionId).sort(byLabel).map((t) => ({
    id: t.id, label: t.label, title: t.title, theme: t.morning_theme, status: t.status, code: t.code, facToken: t.fac_token,
    needs: needsOf(t.id).length, voters: votersOf(t.id), frozenAt: t.frozen_at, closedAt: t.closed_at,
  }));
}
function tableFields(body) {
  const label = txt(body.label, LIM.tableLabel), title = txt(body.title, LIM.tableTitle), theme = txt(body.theme, LIM.theme) || null;
  if (!/^[0-9]{1,3}[a-z]?$/i.test(label)) return { error: 'Numero del tavolo non valido: per esempio 4, oppure 4a e 4b per un tavolo replicato' };
  if (!title) return { error: 'Indica il titolo del tavolo' };
  return { label: label.toLowerCase(), title, theme };
}
const editable = (s) => s && s.pm_phase !== 'chiuso_def';
export function createTable(sessionId, body, actor) {
  const s = session(sessionId);
  if (!editable(s)) return err('Il pomeriggio di questa sessione è concluso');
  const f = tableFields(body || {}); if (f.error) return err(f.error);
  if (q.get('SELECT 1 FROM pm_tables WHERE session_id = ? AND label = ?', sessionId, f.label)) return err(`Il tavolo ${f.label} esiste già`);
  let code; do code = shortCode(6); while (q.get('SELECT 1 FROM pm_tables WHERE code = ?', code));
  const r = q.run('INSERT INTO pm_tables (session_id, label, title, morning_theme, code, fac_token) VALUES (?,?,?,?,?,?)', sessionId, f.label, f.title, f.theme, code, token());
  audit(actor, 'pm_table', r.lastInsertRowid, 'create', null, f);
  return { ok: true, id: Number(r.lastInsertRowid) };
}
// numero e titolo si cambiano fino all'apertura del voto (TAV-02)
export function updateTable(tableId, body, actor) {
  const t = tableRow(tableId); if (!t) return err('Tavolo non trovato');
  if (t.status !== 'bozza') return err('Il voto di questo tavolo è già aperto: numero e titolo non si cambiano più');
  const f = tableFields(body || {}); if (f.error) return err(f.error);
  if (f.label !== t.label && q.get('SELECT 1 FROM pm_tables WHERE session_id = ? AND label = ?', t.session_id, f.label)) return err(`Il tavolo ${f.label} esiste già`);
  q.run('UPDATE pm_tables SET label = ?, title = ?, morning_theme = ? WHERE id = ?', f.label, f.title, f.theme, tableId);
  audit(actor, 'pm_table', tableId, 'update', { label: t.label, title: t.title, theme: t.morning_theme }, f);
  return { ok: true };
}
export function deleteTable(tableId, actor) {
  const t = tableRow(tableId); if (!t) return err('Tavolo non trovato');
  if (t.status !== 'bozza') return err('Il voto di questo tavolo è già aperto: il tavolo non si toglie più');
  tx(() => {
    q.run('DELETE FROM pm_needs WHERE table_id = ?', tableId);
    q.run('DELETE FROM pm_tables WHERE id = ?', tableId);
    audit(actor, 'pm_table', tableId, 'delete', { label: t.label, title: t.title }, null);
  });
  return { ok: true };
}
// link del facilitatore perso o finito nelle mani sbagliate: quello vecchio smette di funzionare
export function regenFacToken(tableId, reason, actor) {
  const t = tableRow(tableId); if (!t) return err('Tavolo non trovato');
  if (!String(reason || '').trim()) return err('Indica il motivo');
  q.run('UPDATE pm_tables SET fac_token = ? WHERE id = ?', token(), tableId);
  audit(actor, 'pm_table', tableId, 'regen_fac_link', null, null, txt(reason, 1000));
  return { ok: true };
}

// ---------- Need (facilitatore) ----------
export function facTable(tok) {
  const t = q.get('SELECT * FROM pm_tables WHERE fac_token = ?', String(tok || ''));
  if (!t) return null;
  const s = session(t.session_id);
  if (s.pm_phase === 'chiuso_def') return { expired: true }; // il link scade alla chiusura del pomeriggio (TAV-03)
  return { t, s };
}
export function facView(t, s) {
  return { session: { id: s.id, title: s.title, demo: !!s.seeded, pmPhase: s.pm_phase },
    table: { label: t.label, title: t.title, theme: t.morning_theme, status: t.status }, needs: needsOf(t.id), voters: votersOf(t.id), maxNeeds: PM.maxNeeds, limits: LIM };
}
// in bozza l'elenco si riscrive per intero: i codici T1…T5 seguono l'ordine (NEED-01)
export function setNeeds(tableId, list, actor) {
  const t = tableRow(tableId);
  if (t.status !== 'bozza') return err('I need sono già confermati: per correggere un errore chiedi alla regia ELIS');
  if (!Array.isArray(list)) return err('Elenco non valido');
  if (list.length > PM.maxNeeds) return err(`Al massimo ${PM.maxNeeds} need per tavolo`);
  const rows = list.map((n) => ({ title: txt(n?.title, LIM.needTitle), descr: txt(n?.descr, LIM.needDescr) || null }));
  if (rows.some((r) => !r.title)) return err('Ogni need deve avere un titolo');
  const before = needsOf(tableId).map((n) => ({ code: n.code, title: n.title }));
  tx(() => {
    q.run('DELETE FROM pm_needs WHERE table_id = ?', tableId);
    rows.forEach((r, i) => q.run('INSERT INTO pm_needs (table_id, code, title, descr) VALUES (?,?,?,?)', tableId, `T${i + 1}`, r.title, r.descr));
    audit(actor, 'pm_needs', tableId, 'save', before, rows.map((r, i) => ({ code: `T${i + 1}`, title: r.title })));
  });
  return { ok: true };
}
// «Conferma e apri il voto»: i need si congelano (NEED-03)
export function openVote(tableId, actor) {
  const t = tableRow(tableId), s = session(t.session_id);
  if (t.status !== 'bozza') return err('Il voto di questo tavolo è già aperto');
  if (s.pm_phase !== 'tavoli') return err('Il voto si apre quando la regia ELIS avvia la fase dei tavoli');
  if (!needsOf(tableId).length) return err('Inserisci almeno un need');
  q.run("UPDATE pm_tables SET status = 'voto', frozen_at = datetime('now') WHERE id = ?", tableId);
  audit(actor, 'pm_table', tableId, 'freeze_open_vote', { status: 'bozza' }, { status: 'voto', needs: needsOf(tableId).map((n) => n.code) });
  return { ok: true };
}
export function closeVote(tableId, actor) {
  const t = tableRow(tableId);
  if (t.status !== 'voto') return err(t.status === 'chiuso' ? 'Il voto di questo tavolo è già chiuso' : 'Il voto di questo tavolo non è ancora aperto');
  q.run("UPDATE pm_tables SET status = 'chiuso', closed_at = datetime('now') WHERE id = ?", tableId);
  audit(actor, 'pm_table', tableId, 'close', { status: 'voto' }, { status: 'chiuso', voters: votersOf(tableId) });
  return { ok: true };
}
// dopo il congelamento solo la regia corregge il testo, con un motivo; i voti restano (NEED-04)
export function correctNeed(needId, body, reason, actor) {
  const n = q.get('SELECT * FROM pm_needs WHERE id = ?', needId); if (!n) return err('Need non trovato');
  const t = tableRow(n.table_id);
  if (t.status === 'bozza') return err('Il tavolo è ancora in bozza: il facilitatore modifica i need dal suo telefono');
  if (!String(reason || '').trim()) return err('Indica il motivo della correzione');
  const title = txt(body?.title, LIM.needTitle), descr = txt(body?.descr, LIM.needDescr) || null;
  if (!title) return err('Il titolo non può essere vuoto');
  q.run('UPDATE pm_needs SET title = ?, descr = ? WHERE id = ?', title, descr, needId);
  audit(actor, 'pm_need', needId, 'correct', { title: n.title, descr: n.descr }, { title, descr }, txt(reason, 1000));
  return { ok: true };
}

// ---------- Chi vota ----------
export const tableByCode = (code) => q.get('SELECT * FROM pm_tables WHERE code = ?', String(code || '').toUpperCase());
export const personByToken = (tok) => (tok ? q.get('SELECT * FROM pm_people WHERE token = ?', String(tok)) : null);
const companyName = (id) => q.get('SELECT name FROM companies WHERE id = ?', id)?.name || '';
function linkParticipant(p) {
  const ex = q.get('SELECT * FROM pm_people WHERE participant_id = ?', p.id);
  if (ex) return ex;
  const tk = token();
  q.run('INSERT INTO pm_people (session_id, company_id, participant_id, name, func, token) VALUES (?,?,?,?,?,?)', p.session_id, p.company_id, p.id, p.name, p.func, tk);
  return q.get('SELECT * FROM pm_people WHERE token = ?', tk);
}
// telefono del mattino: il codice del partecipante salvato sul telefono basta a riconoscerlo (VOT-01)
export function identify(t, { pmToken, morningToken }) {
  const me = personByToken(pmToken);
  if (me && me.session_id === t.session_id) return me;
  if (morningToken) {
    const p = q.get('SELECT * FROM participants WHERE token = ? AND removed = 0', String(morningToken));
    if (p && p.session_id === t.session_id) return linkParticipant(p);
  }
  return null;
}
export function currentVote(personId) {
  return q.get('SELECT v.*, t.label, t.title FROM pm_votes v JOIN pm_tables t ON t.id = v.table_id WHERE v.person_id = ? AND v.is_current = 1', personId) || null;
}
// persone dell'azienda tra cui scegliere il proprio nome: profili del mattino, iscritti da ELIS, chi si è già aggiunto al pomeriggio
export function peopleFor(sessionId, companyId) {
  const out = [], seen = new Set();
  const push = (key, name, func, personId) => { const n = normName(name); if (seen.has(n)) return; seen.add(n); out.push({ key, name, func, voted: personId ? !!currentVote(personId) : false }); };
  for (const p of q.all('SELECT * FROM participants WHERE session_id = ? AND company_id = ? AND removed = 0 ORDER BY name', sessionId, companyId))
    push(`p${p.id}`, p.name, p.func, q.get('SELECT id FROM pm_people WHERE participant_id = ?', p.id)?.id);
  for (const x of q.all('SELECT * FROM pm_people WHERE session_id = ? AND company_id = ? AND participant_id IS NULL ORDER BY name', sessionId, companyId)) push(`x${x.id}`, x.name, x.func, x.id);
  for (const r of q.all('SELECT * FROM roster WHERE company_id = ? ORDER BY name', companyId)) push(`r${r.id}`, r.name, r.func, null);
  return out.sort((a, b) => a.name.localeCompare(b.name, 'it'));
}
// ripiego «Chi sei?»: se il nome aveva un profilo del mattino il voto si collega a quello, senza un secondo profilo (VOT-01).
// Chi si registra al pomeriggio non entra tra i partecipanti della Map (VOT-02): sta solo in pm_people.
export function joinPerson(sessionId, companyId, { key, name, func }, validFunc) {
  const parts = q.all('SELECT * FROM participants WHERE session_id = ? AND company_id = ? AND removed = 0', sessionId, companyId);
  const pmOnly = q.all('SELECT * FROM pm_people WHERE session_id = ? AND company_id = ? AND participant_id IS NULL', sessionId, companyId);
  const byName = (n) => { const k = normName(n); return parts.find((p) => normName(p.name) === k) || null; };
  const pmByName = (n) => { const k = normName(n); return pmOnly.find((p) => normName(p.name) === k) || null; };
  const m = /^([prx])(\d+)$/.exec(String(key || ''));
  if (m) {
    const id = Number(m[2]);
    if (m[1] === 'p') { const p = parts.find((x) => x.id === id); return p ? linkParticipant(p) : err('Nome non trovato: sceglilo di nuovo'); }
    if (m[1] === 'x') { const x = pmOnly.find((y) => y.id === id); return x || err('Nome non trovato: sceglilo di nuovo'); }
    const r = q.get('SELECT * FROM roster WHERE id = ? AND company_id = ?', id, companyId);
    if (!r) return err('Nome non trovato: sceglilo di nuovo');
    const p = parts.find((x) => x.roster_id === r.id) || byName(r.name);
    if (p) return linkParticipant(p);
    ({ name, func } = r);
  }
  name = txt(name, 120);
  if (!name) return err('Scegli il tuo nome dall\'elenco o scrivi nome e cognome');
  const p = byName(name); if (p) return linkParticipant(p);
  const x = pmByName(name); if (x) return x;
  if (!validFunc(func)) return err('Seleziona la funzione');
  const tk = token();
  q.run('INSERT INTO pm_people (session_id, company_id, participant_id, name, func, token) VALUES (?,?,NULL,?,?,?)', sessionId, companyId, name, func, tk);
  return q.get('SELECT * FROM pm_people WHERE token = ?', tk);
}

// ---------- Voto ----------
export function voterView(t, s, me) {
  const v = me ? currentVote(me.id) : null;
  return {
    session: { title: s.title, code: s.code, demo: !!s.seeded, pmPhase: s.pm_phase },
    table: { label: t.label, title: t.title, status: t.status },
    needs: t.status === 'bozza' ? [] : needsOf(t.id),
    me: me ? { token: me.token, name: me.name, company: companyName(me.company_id), votedAt: v?.created_at || null, votedTable: v ? `${v.label} · ${v.title}` : null, votedHere: v ? v.table_id === t.id : false } : null,
    texts: { choose: PM.texts.choose, none: PM.texts.none, priority: PM.texts.priority, horizon: PM.texts.horizon }, priority: PM.priority, horizon: PM.horizon, maxChoices: PM.maxChoices,
  };
}
export function castVote(me, t, body) {
  const s = session(t.session_id);
  if (me.session_id !== t.session_id) return err('Questo QR è di un\'altra sessione');
  if (s.pm_phase !== 'tavoli' || t.status !== 'voto') return err(t.status === 'chiuso' ? 'Il voto di questo tavolo è chiuso' : 'Il voto di questo tavolo non è ancora aperto');
  const prev = currentVote(me.id);
  if (prev) return { ok: false, conflict: true, errors: [`Hai già votato al tavolo ${prev.label}`] };
  const needs = needsOf(t.id);
  const none = !!body?.none;
  const items = none ? [] : (Array.isArray(body?.items) ? body.items : []);
  if (!none && !items.length) return err('Scegli fino a due need oppure «Non scelgo nessun need»');
  if (items.length > PM.maxChoices) return err(`Puoi scegliere al massimo ${PM.maxChoices} need`);
  const seen = new Set();
  for (const it of items) {
    if (!needs.some((n) => n.id === Number(it.needId)) || seen.has(Number(it.needId))) return err('Need non valido');
    seen.add(Number(it.needId));
    if (!PM.priority.some((p) => p.value === Number(it.priority))) return err('Indica la priorità per ogni need scelto');
    if (!PM.horizon.some((h) => h.value === it.horizon)) return err('Indica l\'orizzonte per ogni need scelto');
  }
  tx(() => {
    const r = q.run('INSERT INTO pm_votes (person_id, table_id, none, created_by) VALUES (?,?,?,?)', me.id, t.id, none ? 1 : 0, `pm_persona:${me.id}`);
    for (const it of items) q.run('INSERT INTO pm_vote_items (vote_id, need_id, priority, horizon) VALUES (?,?,?,?)', r.lastInsertRowid, Number(it.needId), Number(it.priority), it.horizon);
  });
  return { ok: true };
}
// voti per tavolo per la regia: solo chi ha votato, mai che cosa (R4)
export function votersList(tableId) {
  return q.all(`SELECT v.id, v.created_at, p.name, c.name company FROM pm_votes v JOIN pm_people p ON p.id = v.person_id JOIN companies c ON c.id = p.company_id
    WHERE v.table_id = ? AND v.is_current = 1 ORDER BY p.name`, tableId);
}
// voto da annullare o persona da spostare: lo fa la regia con un motivo, il voto resta nello storico (R5, VOT-06)
export function cancelVote(voteId, reason, actor) {
  const v = q.get('SELECT * FROM pm_votes WHERE id = ? AND is_current = 1', voteId); if (!v) return err('Voto non trovato');
  if (!String(reason || '').trim()) return err('Indica il motivo');
  const p = q.get('SELECT name FROM pm_people WHERE id = ?', v.person_id);
  q.run('UPDATE pm_votes SET is_current = 0, cancel_reason = ? WHERE id = ?', txt(reason, 1000), voteId);
  audit(actor, 'pm_vote', voteId, 'cancel', { persona: p?.name, tavolo: tableRow(v.table_id)?.label }, null, txt(reason, 1000));
  return { ok: true };
}

// ---------- Mappe in plenaria (solo conteggi, nessuna azienda né persona: MAP-06) ----------
export function tableResults(tableId) {
  const t = tableRow(tableId);
  const needs = needsOf(tableId);
  const voters = votersOf(tableId);
  const none = q.get('SELECT COUNT(*) n FROM pm_votes WHERE table_id = ? AND is_current = 1 AND none = 1', tableId).n;
  const M = PM.map;
  const xThreshold = needs.length ? PM.maxChoices / needs.length : null; // quota media attesa: 2 voti diviso il numero di need
  const rows = needs.map((n) => {
    const its = q.all('SELECT i.priority, i.horizon FROM pm_vote_items i JOIN pm_votes v ON v.id = i.vote_id WHERE i.need_id = ? AND v.is_current = 1', n.id);
    const priority = Object.fromEntries(PM.priority.map((p) => [p.value, its.filter((i) => i.priority === p.value).length]));
    const horizon = Object.fromEntries(PM.horizon.map((h) => [h.value, its.filter((i) => i.horizon === h.value).length]));
    const high = its.filter((i) => i.priority >= M.highPriorityMin).length;
    const x = voters ? its.length / voters : 0, y = its.length ? high / its.length : null;
    const quad = y == null ? null : `${x >= xThreshold ? 'H' : 'L'}${y >= M.yThreshold ? 'H' : 'L'}`; // sulla soglia conta a destra o in alto
    return { id: n.id, code: n.code, key: needKey(t, n), title: n.title, descr: n.descr, votes: its.length, high, x, y, quadrant: quad, quadrantName: quad ? M.quadrants[quad] : null, few: its.length > 0 && its.length < M.fewVotes, priority, horizon };
  });
  return { table: { id: t.id, label: t.label, title: t.title, theme: t.morning_theme, status: t.status }, voters, none, xThreshold, yThreshold: M.yThreshold, needs: rows };
}
// la mappa di un tavolo si vede solo a voto chiuso (R4, MAP-07)
export function plenary(sessionId) {
  const s = session(sessionId);
  const tables = q.all('SELECT * FROM pm_tables WHERE session_id = ?', sessionId).sort(byLabel);
  return { session: { id: s.id, title: s.title, demo: !!s.seeded, pmPhase: s.pm_phase }, config: { map: PM.map, priority: PM.priority, horizon: PM.horizon },
    tables: tables.map((t) => (t.status === 'chiuso' ? tableResults(t.id) : { table: { id: t.id, label: t.label, title: t.title, theme: t.morning_theme, status: t.status }, pending: true })) };
}

// ---------- Scelta finale dei 3 need (referente o facilitatore) ----------
// need votati dalle persone dell'azienda, per tavolo, con chi li ha votati (SCE-02): nessun dato della Map
export function companyVotes(sessionId, companyId) {
  const rows = q.all(`SELECT n.id need_id, n.code, n.title, n.descr, t.id table_id, t.label, t.title table_title, p.name, i.priority, i.horizon
    FROM pm_vote_items i JOIN pm_votes v ON v.id = i.vote_id AND v.is_current = 1 JOIN pm_people p ON p.id = v.person_id
    JOIN pm_needs n ON n.id = i.need_id JOIN pm_tables t ON t.id = n.table_id
    WHERE p.session_id = ? AND p.company_id = ? ORDER BY p.name`, sessionId, companyId);
  const tables = new Map();
  for (const r of rows) {
    if (!tables.has(r.table_id)) tables.set(r.table_id, { label: r.label, title: r.table_title, needs: new Map() });
    const T = tables.get(r.table_id);
    if (!T.needs.has(r.need_id)) T.needs.set(r.need_id, { needId: r.need_id, code: r.code, key: `${r.label}-${r.code}`, title: r.title, descr: r.descr, voters: [] });
    T.needs.get(r.need_id).voters.push({ name: r.name, priority: r.priority, priorityLabel: priorityLabel(r.priority), horizon: r.horizon, horizonLabel: horizonLabel(r.horizon) });
  }
  return [...tables.values()].sort(byLabel).map((T) => ({ label: T.label, title: T.title, needs: [...T.needs.values()].sort((a, b) => a.code.localeCompare(b.code, 'it', { numeric: true })) }));
}
const choiceRow = (sessionId, companyId) => q.get('SELECT * FROM pm_choices WHERE session_id = ? AND company_id = ? AND is_current = 1', sessionId, companyId) || null;
export function choiceState(sessionId, companyId) {
  const s = session(sessionId);
  const groups = companyVotes(sessionId, companyId);
  const available = groups.reduce((n, g) => n + g.needs.length, 0);
  const c = choiceRow(sessionId, companyId);
  return { session: { id: s.id, title: s.title, pmPhase: s.pm_phase, demo: !!s.seeded }, open: s.pm_phase === 'scelta',
    groups, available, required: Math.min(PM.finalChoices, available), items: parse(c?.items_json, []), confirmedAt: c?.confirmed_at || null,
    texts: { ask: PM.texts.ask, askNote: PM.texts.askNote }, limits: { ask: LIM.ask }, finalChoices: PM.finalChoices };
}
// ogni salvataggio è una riga nuova; «Conferma i 3 need» chiude la scelta (SCE-03, SCE-05)
export function saveChoice(sessionId, companyId, body, actor, confirm = false) {
  const st = choiceState(sessionId, companyId);
  if (!st.open) return err('La scelta dei need si fa nella fase «Scelta dei 3 need», a fine pomeriggio');
  if (st.confirmedAt) return err('La scelta è già confermata: per cambiarla chiedi alla regia ELIS di riaprirla');
  const allowed = new Set(st.groups.flatMap((g) => g.needs.map((n) => n.needId)));
  const list = Array.isArray(body?.items) ? body.items : [];
  const items = [];
  for (const it of list) {
    const id = Number(it?.needId);
    if (!allowed.has(id)) return err('Si scelgono solo need votati dalle persone dell\'azienda');
    if (items.some((x) => x.needId === id)) continue;
    items.push({ needId: id, ask: txt(it.ask, LIM.ask) });
  }
  if (items.length > PM.finalChoices) return err(`Al massimo ${PM.finalChoices} need`);
  if (confirm && items.length !== st.required) return err(st.required < PM.finalChoices ? `Le persone dell'azienda hanno votato ${st.available} need: sceglili tutti` : `Scegli ${PM.finalChoices} need`);
  const prev = choiceRow(sessionId, companyId);
  tx(() => {
    if (prev) q.run('UPDATE pm_choices SET is_current = 0 WHERE id = ?', prev.id);
    q.run(`INSERT INTO pm_choices (session_id, company_id, items_json, confirmed_at, created_by) VALUES (?,?,?,${confirm ? "datetime('now')" : 'NULL'},?)`, sessionId, companyId, JSON.stringify(items), actor);
    if (confirm) audit(actor, 'pm_choice', `${sessionId}/${companyId}`, 'confirm', null, { need: items.map((x) => x.needId) });
  });
  return { ok: true };
}
export function reopenChoice(sessionId, companyId, reason, actor) {
  const c = choiceRow(sessionId, companyId);
  if (!c?.confirmed_at) return err('La scelta non è confermata');
  if (!String(reason || '').trim()) return err('Indica il motivo');
  tx(() => {
    q.run('UPDATE pm_choices SET is_current = 0 WHERE id = ?', c.id);
    q.run('INSERT INTO pm_choices (session_id, company_id, items_json, confirmed_at, created_by) VALUES (?,?,?,NULL,?)', sessionId, companyId, c.items_json, actor);
    audit(actor, 'pm_choice', `${sessionId}/${companyId}`, 'reopen', { confermata: c.confirmed_at }, null, txt(reason, 1000));
  });
  return { ok: true };
}
// stato della scelta per azienda, per la regia (SCE-06)
export function choicesOverview(sessionId) {
  const s = session(sessionId);
  const comps = q.all(`SELECT DISTINCT c.id, c.name FROM companies c WHERE c.seeded = ? AND (c.id IN (SELECT company_id FROM pm_people WHERE session_id = ?) OR c.id IN (SELECT company_id FROM pm_choices WHERE session_id = ?)) ORDER BY c.name`, s.seeded ? 1 : 0, sessionId, sessionId);
  return comps.map((c) => {
    const ch = choiceRow(sessionId, c.id);
    const voted = q.get('SELECT COUNT(*) n FROM pm_votes v JOIN pm_people p ON p.id = v.person_id WHERE p.session_id = ? AND p.company_id = ? AND v.is_current = 1', sessionId, c.id).n;
    return { id: c.id, name: c.name, voted, status: ch?.confirmed_at ? 'confermata' : ch ? 'in corso' : 'non iniziata', confirmedAt: ch?.confirmed_at || null, chosen: parse(ch?.items_json, []).length };
  });
}

// ---------- Report: sezione «Dai tavoli» (REP-01…06) ----------
export function reportPart(companyId) {
  const company = q.get('SELECT seeded FROM companies WHERE id = ?', companyId);
  const sessions = q.all('SELECT id, title, base FROM sessions WHERE seeded = ? ORDER BY date, id', company?.seeded ? 1 : 0);
  const out = [];
  for (const s of sessions) {
    const people = q.all('SELECT * FROM pm_people WHERE session_id = ? AND company_id = ? ORDER BY name', s.id, companyId);
    const votes = people.map((p) => ({ p, v: currentVote(p.id) })).filter((x) => x.v);
    const ch = choiceRow(s.id, companyId);
    if (!votes.length && !ch?.confirmed_at) continue; // nessuno al pomeriggio: la sezione non compare
    const items = parse(ch?.confirmed_at ? ch.items_json : null, []);
    const chosen = items.map((it) => {
      const n = q.get('SELECT n.code, n.title, n.descr, t.label, t.title table_title FROM pm_needs n JOIN pm_tables t ON t.id = n.table_id WHERE n.id = ?', it.needId);
      return n ? { key: `${n.label}-${n.code}`, title: n.title, descr: n.descr, table: `${n.label} · ${n.table_title}`, ask: it.ask || '' } : null;
    }).filter(Boolean);
    const available = companyVotes(s.id, companyId).reduce((n, g) => n + g.needs.length, 0);
    out.push({
      session: { title: s.title, name: s.title.split(' · ')[0] }, intro: PM.texts.reportIntro, confirmed: !!ch?.confirmed_at,
      chosen, fewer: !!ch?.confirmed_at && chosen.length < PM.finalChoices, available,
      people: votes.map(({ p, v }) => {
        const mine = Object.fromEntries(q.all('SELECT need_id, priority, horizon FROM pm_vote_items WHERE vote_id = ?', v.id).map((i) => [i.need_id, i]));
        return { name: p.name, table: `${v.label} · ${v.title}`, none: !!v.none,
          needs: needsOf(v.table_id).map((n) => ({ code: n.code, title: n.title, chosen: !!mine[n.id], priority: mine[n.id] ? priorityLabel(mine[n.id].priority) : null, horizon: mine[n.id] ? horizonLabel(mine[n.id].horizon) : null })) };
      }),
    });
  }
  return out;
}

// ---------- Quadro della regia (TAV-04, SCE-06): conteggi, mai i contenuti dei voti ----------
export function consoleView(sessionId) {
  const s = session(sessionId);
  return { session: { id: s.id, title: s.title, base: s.base, demo: !!s.seeded }, pmPhase: s.pm_phase, phases: PM.phases,
    tables: tablesOf(sessionId).map((t) => ({ ...t, needList: needsOf(t.id), votersList: votersList(t.id) })), choices: choicesOverview(sessionId), limits: LIM, maxNeeds: PM.maxNeeds };
}
