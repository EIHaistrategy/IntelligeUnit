// Ambiente DEMO: il programma completo con dati inventati, per mostrarlo senza dati reali.
// - 4 sessioni DEMO con le date del calendario, che partono "in preparazione"
// - 14 aziende della community (consolidano a ogni sessione: benchmark, plenaria e mappe si riempiono man mano)
// - 1 azienda del percorso guidato (TEST: mai nel benchmark) con referenti, persone, risposte, consolidamento, report, call e commitment
// I dati sono nel file leggibile server/demo/percorso-guidato.json. Tutto è marcato seeded = 1: si vede solo in DEMO.
// L'avanzamento usa le funzioni vere della piattaforma (confronto, consolidamento, commitment, rilascio dei report).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q, tx, shortCode, token, audit, getSetting, setSetting } from './db.js';
import * as L from './logic.js';
import * as E from './engine/index.js';

const I = E.INSTRUMENT;
const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'demo', 'percorso-guidato.json');
const ACTOR = 'demo';
const PHASES = ['preparazione', 'individuale', 'confronto', 'consolidamento', 'chiusa'];
const FAC = 'demo:facilitatore';
export const loadScript = () => JSON.parse(fs.readFileSync(SCRIPT, 'utf8'));

// numeri "casuali" ma sempre uguali a ogni caricamento: la demo si ripete identica
function prng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (x) => Math.max(1, Math.min(5, x));

// I passi del percorso guidato, ripetuti per ogni sessione; poi l'allineamento finale (anteprima)
export const STEPS = [
  { id: 'prep', label: 'Preparazione', who: 'ELIS prepara la sessione e invia al referente il link con le domande' },
  { id: 'qr', label: 'QR e link', who: 'ELIS genera il QR dell\'azienda: in sala ognuno lo inquadra e sceglie il proprio nome' },
  { id: 'individuale', label: 'Risposte dal telefono', who: 'Le persone rispondono da sole, dieci minuti, senza vedere le risposte altrui' },
  { id: 'confronto', label: 'Confronto al tavolo', who: 'Il tavolo vede la distribuzione anonima delle risposte e discute le divergenze' },
  { id: 'consolidamento', label: 'Consolidamento', who: 'Il facilitatore ELIS registra con il tavolo la posizione ufficiale, poi priorità e commitment' },
  { id: 'report', label: 'Report e call con il leader', who: 'ELIS rilascia il report; nella call il leader lo discute e la trascrizione va in appendice' },
  { id: 'commitment', label: 'Commitment e verifica', who: 'Lo stato dei commitment si aggiorna e si verifica alla sessione successiva' },
];
const BASES = ['GOV', 'EFF', 'GROW', 'SCALE'];

// Il percorso si riconosce dal suo stato salvato (azienda e sessioni create dal caricamento),
// non da "esiste un dato DEMO": le aziende create a mano in DEMO non lo confondono.
const tourGet = () => { try { return JSON.parse(getSetting('demo_tour') || 'null'); } catch { return null; } };
const tourSet = (t) => setSetting('demo_tour', JSON.stringify({ ...tourGet(), ...t }));
const guided = () => { const t = tourGet(); return t?.g ? q.get('SELECT * FROM companies WHERE id = ? AND seeded = 1', t.g) : null; };
const demoSessions = () => { const ids = tourGet()?.sids || []; return BASES.map((b, i) => (ids[i] ? q.get('SELECT * FROM sessions WHERE id = ? AND seeded = 1', ids[i]) : null)); };
export function hasDemo() { return !!guided(); }
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

// Caricamento: idempotente (se i dati DEMO ci sono già, non duplica nulla)
export function seedDemo() {
  if (hasDemo()) return tourState();
  const S = loadScript();
  const rnd = prng(20261119);
  tx(() => {
    const sids = [];
    for (const base of BASES) {
      const def = E.sessionDef(base);
      sids.push(Number(q.run(`INSERT INTO sessions (base, title, date, mode, channel, code, phase, instrument_version, scoring_version, seeded)
             VALUES (?, ?, ?, 'workshop', 'presenza', ?, 'preparazione', ?, ?, 1)`, base, `${def.name} · demo`, def.date, shortCode(5), I.version, E.SCORING.version).lastInsertRowid));
    }
    for (const c of S.community) {
      const r = q.run("INSERT INTO companies (name, perimeter, sector, kind, join_code, seeded) VALUES (?, 'Gruppo', ?, 'DEMO', ?, 1)", `${c.nome} (demo)`, c.settore, shortCode(4));
      const cid = Number(r.lastInsertRowid);
      q.run("INSERT INTO consents (company_id, type, granted) VALUES (?, 'benchmark', 1)", cid);
      if (rnd() < 0.7) q.run("INSERT INTO consents (company_id, type, granted) VALUES (?, 'peer', 1)", cid);
    }
    const g = q.run("INSERT INTO companies (name, perimeter, sector, kind, join_code, seeded) VALUES (?, ?, ?, 'TEST', ?, 1)",
      `${S.azienda.nome} (demo)`, S.azienda.perimetro, S.azienda.settore, shortCode(4));
    const cid = Number(g.lastInsertRowid);
    for (const t of ['benchmark', 'peer', 'testimonianza', 'followup']) q.run('INSERT INTO consents (company_id, type, granted) VALUES (?,?,1)', cid, t);
    for (const r of S.referenti) {
      q.run('INSERT INTO referents (company_id, name, email, role, token) VALUES (?,?,?,?,?)', cid, r.nome, r.email || '', r.ruolo || '', token());
      q.run('INSERT INTO roster (company_id, name, func) VALUES (?,?,?)', cid, r.nome, r.funzione);
    }
    for (const p of S.persone) q.run('INSERT INTO roster (company_id, name, func) VALUES (?,?,?)', cid, p.nome, p.funzione);
    q.run("DELETE FROM settings WHERE key = 'demo_tour'");
    tourSet({ s: 0, k: 0, g: cid, sids });
    enter(0, 0, S); // nella stessa transazione: se fallisce, non restano dati a metà
    audit(ACTOR, 'demo', '', 'seed', null, { community: S.community.length, azienda: S.azienda.nome });
  });
  return tourState();
}

export function removeDemo() {
  // tutti i dati dell'ambiente DEMO (seeded = 1), anche aziende e sessioni create a mano in DEMO; mai dati di Produzione
  const ids = q.all('SELECT id FROM companies WHERE seeded = 1').map((r) => r.id);
  const sids = q.all('SELECT id FROM sessions WHERE seeded = 1').map((r) => r.id);
  tx(() => {
    if (ids.length) {
      const ph = ids.map(() => '?').join(',');
      const pids = q.all(`SELECT id FROM participants WHERE company_id IN (${ph})`, ...ids).map((r) => r.id);
      if (pids.length) {
        const pp = pids.map(() => '?').join(',');
        q.run(`DELETE FROM answers WHERE participant_id IN (${pp})`, ...pids);
        q.run(`DELETE FROM pair_answers WHERE participant_id IN (${pp})`, ...pids);
      }
      for (const t of ['participants', 'presession', 'session_company', 'consolidated', 'commitments', 'report_snapshots', 'consents', 'referents', 'roster']) {
        q.run(`DELETE FROM ${t} WHERE company_id IN (${ph})`, ...ids);
      }
      q.run(`DELETE FROM companies WHERE id IN (${ph})`, ...ids);
    }
    if (sids.length) {
      // partecipanti di sessioni DEMO registrati dal telefono con aziende non DEMO non esistono (il codice azienda è dell'ambiente)
      q.run(`DELETE FROM sessions WHERE id IN (${sids.map(() => '?').join(',')})`, ...sids);
    }
    q.run("DELETE FROM settings WHERE key = 'demo_tour'");
  });
  audit(ACTOR, 'demo', '', 'remove', null, { removed: ids.length });
  return { removed: ids.length };
}

// "Carica i dati DEMO": il programma come a fine percorso (4 sessioni chiuse, mappe, report, call, commitment)
export function loadDemoComplete() { if (!hasDemo()) seedDemo(); return advanceDemo('end'); }

// Reset: riporta il percorso guidato all'inizio (stessi dati, ricaricati dal file)
export function resetDemo() { removeDemo(); return seedDemo(); }

// Avanza di un passo (o fino all'inizio della sessione successiva, o fino alla fine)
export function advanceDemo(mode = 'step') {
  if (!hasDemo()) return seedDemo();
  const S = loadScript();
  let t = tourGet() || { s: 0, k: 0 };
  const startS = t.s;
  do {
    if (t.s >= BASES.length) break;
    t = t.k + 1 < STEPS.length ? { s: t.s, k: t.k + 1 } : { s: t.s + 1, k: 0 };
    // passo e suoi effetti insieme: se un effetto fallisce, il percorso resta dov'era
    const n = t;
    tx(() => { tourSet({ s: n.s, k: n.k }); if (n.s < BASES.length) enter(n.s, n.k, S); });
  } while ((mode === 'session' && t.s === startS) || (mode === 'end' && t.s < BASES.length));
  return tourState();
}

// Effetti dell'ingresso nel passo k della sessione i
function enter(i, k, S) {
  const sess = demoSessions()[i];
  const g = guided();
  if (!sess || !g) return;
  const sc = S.sessioni[sess.base] || {};
  const def = E.sessionDef(sess.base);
  L.ensureSessionCompany(sess.id, g.id);
  // la fase va solo avanti (regola 4): se il team l'ha già portata oltre a mano, non si torna indietro
  const phase = (p) => { if (PHASES.indexOf(p) > PHASES.indexOf(sess.phase)) { q.run('UPDATE sessions SET phase = ? WHERE id = ?', p, sess.id); audit(ACTOR, 'session', sess.id, 'phase', { phase: sess.phase }, { phase: p }, 'Percorso guidato DEMO'); sess.phase = p; } };
  const step = STEPS[k].id;
  if (step === 'prep') {
    q.run("UPDATE session_company SET invited_at = COALESCE(invited_at, datetime('now')) WHERE session_id = ? AND company_id = ?", sess.id, g.id);
  }
  if (step === 'qr') {
    q.run("UPDATE session_company SET qr_generated_at = COALESCE(qr_generated_at, datetime('now')) WHERE session_id = ? AND company_id = ?", sess.id, g.id);
  }
  if (step === 'individuale') {
    phase('individuale');
    // tutti rispondono, tranne la persona "dal telefono": la sua schermata resta alla prima domanda, da provare dal vivo
    for (const name of Object.keys(sc.risposte || {})) {
      const p = participant(sess, g, name);
      if (name !== S.persona_dal_telefono) answer(p, sc.risposte[name], def);
    }
    if (S.persona_dal_telefono) participant(sess, g, S.persona_dal_telefono);
  }
  if (step === 'confronto') {
    // la persona dal telefono completa quello che non ha già risposto dal vivo
    const live = S.persona_dal_telefono && sc.risposte?.[S.persona_dal_telefono];
    if (live) answer(participant(sess, g, S.persona_dal_telefono), live, def, true);
    phase('confronto');
  }
  if (step === 'consolidamento') phase('consolidamento');
  if (step === 'report') {
    if (!q.get('SELECT consolidated_at FROM session_company WHERE session_id = ? AND company_id = ?', sess.id, g.id)?.consolidated_at) consolidate(sess, g, sc);
    if (!q.get('SELECT 1 FROM commitments WHERE session_id = ? AND company_id = ?', sess.id, g.id) && sc.commitment) {
      const c = sc.commitment;
      L.saveCommitment(sess.id, g.id, { priority_item: c.priorita, action: c.azione, owner: c.owner, due_date: c.scadenza, kpi: c.kpi, peer_interest: !!c.confronto_community }, FAC);
    }
    community(sess, S);
    phase('chiusa');
    if (sc.call) {
      q.run('UPDATE session_company SET leader_call_note = ?, leader_call_transcript = ?, leader_call_at = ? WHERE session_id = ? AND company_id = ?',
        sc.call.esito || null, sc.call.trascrizione || null, sc.call.data || null, sess.id, g.id);
    }
    if (!q.get('SELECT 1 FROM report_snapshots WHERE session_id = ? AND company_id = ?', sess.id, g.id)) L.releaseReport(sess.id, g.id, ACTOR);
  }
  if (step === 'commitment') {
    const prev = i > 0 ? demoSessions()[i - 1] : null;
    const set = (sid, v) => {
      const m = sid && q.get('SELECT id FROM commitments WHERE session_id = ? AND company_id = ?', sid, g.id);
      if (m && v) L.setCommitmentStatus(m.id, v.stato, v.nota || '', ACTOR);
    };
    set(prev?.id, sc.verifica_commitment_precedente);
    for (const v of sc.verifica_commitment || []) set(demoSessions()[BASES.indexOf(v.sessione)]?.id, v);
  }
}

function participant(sess, g, name) {
  const ex = q.get('SELECT * FROM participants WHERE session_id = ? AND company_id = ? AND name = ? AND removed = 0', sess.id, g.id, name);
  if (ex) return ex;
  const r = q.get('SELECT * FROM roster WHERE company_id = ? AND name = ?', g.id, name);
  const pr = q.run('INSERT INTO participants (session_id, company_id, name, func, token, roster_id) VALUES (?,?,?,?,?,?)', sess.id, g.id, name, r?.func || 'OTHER', token(), r?.id || null);
  return q.get('SELECT * FROM participants WHERE id = ?', Number(pr.lastInsertRowid));
}

// risposte individuali e confronti a coppie (coerenti con i livelli dati), poi invio
function answer(p, levels, def, onlyMissing = false) {
  const lv = (id) => (levels[id] === 'ND' || levels[id] == null ? null : clamp(Number(levels[id])));
  for (const id of def.items) {
    if (onlyMissing && q.get('SELECT 1 FROM answers WHERE participant_id = ? AND item_id = ?', p.id, id)) continue;
    q.run(`INSERT INTO answers (participant_id, item_id, level) VALUES (?,?,?) ON CONFLICT(participant_id, item_id) DO UPDATE SET level = excluded.level`, p.id, id, lv(id));
  }
  for (const [a, b] of def.pairs) {
    if (onlyMissing && q.get('SELECT 1 FROM pair_answers WHERE participant_id = ? AND item_a = ? AND item_b = ?', p.id, a, b)) continue;
    const ans = lv(a) == null || lv(b) == null ? 'ND' : lv(a) >= lv(b) ? 'A' : 'B';
    q.run(`INSERT INTO pair_answers (participant_id, item_a, item_b, answer) VALUES (?,?,?,?) ON CONFLICT(participant_id, item_a, item_b) DO UPDATE SET answer = excluded.answer`, p.id, a, b, ans);
  }
  q.run("UPDATE participants SET submitted_at = COALESCE(submitted_at, datetime('now')) WHERE id = ?", p.id);
  L.invalidateComparison(p.session_id, p.company_id);
}

// consolidamento con le funzioni vere: livello e sotto-opzione dal file; se il livello è diverso dalla mediana serve un motivo
function consolidate(sess, g, sc) {
  const cmp = L.companyComparison(sess.id, g.id);
  const items = {};
  for (const it of cmp.items) {
    const want = sc.consolidamento?.[it.itemId] || {};
    const level = Number.isInteger(want.livello) ? want.livello : it.summary.medianIsInteger ? it.summary.median : Math.round(it.summary.median || 1);
    const subs = E.subOptions(it.itemId, level);
    const sub = subs.length ? (subs.some((x) => x.key === want.sotto) ? want.sotto : subs[0].key) : null;
    const override = it.summary.medianIsInteger && level !== it.summary.median;
    items[it.itemId] = { level, sub, overrideReason: override ? (want.motivo || 'Scelta discussa al tavolo (dato dimostrativo)') : '' };
  }
  const out = L.confirmConsolidation(sess.id, g.id, { items }, FAC);
  if (!out.ok) throw new Error(`Consolidamento demo non riuscito: ${(out.errors || []).join(' · ')}`);
}

// la community consolida a ogni sessione: valori attorno alla "maturità" di ogni azienda, sempre uguali
function community(sess, S) {
  const def = E.sessionDef(sess.base);
  const comps = q.all("SELECT * FROM companies WHERE seeded = 1 AND kind = 'DEMO' ORDER BY id");
  comps.forEach((c, n) => {
    if (q.get('SELECT 1 FROM consolidated WHERE session_id = ? AND company_id = ?', sess.id, c.id)) return;
    const rnd = prng(1000 * (n + 1) + BASES.indexOf(sess.base));
    const m = S.community.find((x) => `${x.nome} (demo)` === c.name)?.maturita ?? 2.5;
    const dimShift = Object.fromEntries(def.dimensions.map((d) => [d, rnd() * 1.6 - 0.8]));
    const lv = {};
    for (const itemId of def.items) {
      const level = clamp(Math.round(m + dimShift[I.items[itemId].dimension] + rnd() * 1.4 - 0.7));
      lv[itemId] = level;
      const subs = E.subOptions(itemId, level);
      const sub = subs.length ? subs[Math.floor(rnd() * subs.length)].key : null;
      q.run(`INSERT INTO consolidated (session_id, company_id, item_id, kind, level, sub, score, confidence, confidence_label, confidence_reason,
             median, valid_n, nd_n, range_, perspectives, instrument_version, scoring_version, created_by)
             VALUES (?,?,?,'sessione',?,?,?,'MEDIA','Media','dato dimostrativo',?,3,0,1,2,?,?,?)`,
        sess.id, c.id, itemId, level, sub, E.itemScore(itemId, level, sub), level, I.version, E.SCORING.version, ACTOR);
    }
    // la community è lo sfondo del benchmark: report e call si considerano già fatti, così "Da fare" parla solo dell'azienda guidata
    q.run("INSERT OR IGNORE INTO session_company (session_id, company_id, consolidated_at, consolidated_by, report_released_at, leader_call_note) VALUES (?, ?, datetime('now'), ?, datetime('now'), 'Dato dimostrativo')", sess.id, c.id, ACTOR);
    const prio = def.items.slice().sort((a, b) => lv[a] - lv[b])[0];
    q.run("INSERT INTO commitments (session_id, company_id, priority_item, action, owner, kpi, peer_interest) VALUES (?, ?, ?, 'Azione dimostrativa', 'Demo', 'Evidenza dimostrativa', ?)",
      sess.id, c.id, prio, rnd() < 0.5 ? 1 : 0);
  });
}

// Stato del percorso per la console: passo corrente, data simulata, collegamenti alle pagine vere
export function tourState() {
  if (!hasDemo()) return { present: false };
  const t = tourGet() || { s: 0, k: 0 };
  const S = loadScript();
  const g = guided();
  const ss = demoSessions();
  const sess = ss[Math.min(t.s, BASES.length - 1)];
  const ref = g && q.get('SELECT * FROM referents WHERE company_id = ? ORDER BY id LIMIT 1', g.id);
  const live = g && sess && q.get('SELECT token, submitted_at FROM participants WHERE session_id = ? AND company_id = ? AND name = ? AND removed = 0', sess.id, g.id, S.persona_dal_telefono || '');
  const snap = g && q.get('SELECT id, version FROM report_snapshots WHERE company_id = ? ORDER BY id DESC LIMIT 1', g.id);
  const done = t.s >= BASES.length;
  const step = done ? null : STEPS[t.k];
  // data simulata: avanza con il percorso (serve, per esempio, a far scadere un commitment)
  const sc = sess && S.sessioni[sess.base];
  const simDay = done ? '2027-09-01' : !sess ? null
    : step.id === 'prep' ? addDays(sess.date, -14) : ['report', 'commitment'].includes(step.id) ? (sc?.call?.data || addDays(sess.date, 14)) : sess.date;
  return {
    present: true, done, s: t.s, k: t.k, steps: STEPS, simDay,
    company: g ? { id: g.id, name: g.name, joinCode: g.join_code, sector: g.sector, perimeter: g.perimeter } : null,
    referents: g ? q.all('SELECT name, role, email, token FROM referents WHERE company_id = ? ORDER BY id', g.id) : [],
    referentToken: ref?.token || null,
    liveName: S.persona_dal_telefono || null, liveToken: live?.token || null, liveSubmitted: !!live?.submitted_at,
    snapshot: snap || null,
    sessions: ss.map((x) => x && { id: x.id, base: x.base, title: x.title, date: x.date, code: x.code, phase: x.phase }),
  };
}
