// Database locale SQLite (modulo integrato in Node.js ≥ 22.13: nessuna installazione aggiuntiva).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.AITO_DATA_DIR || path.join(ROOT, 'data');
mkdirSync(DATA_DIR, { recursive: true });
export const DB_PATH = path.join(DATA_DIR, process.env.AITO_DB || 'aito-map.sqlite');
export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  perimeter TEXT,                       -- gruppo, società o business unit valutata (§6.1)
  sector TEXT,
  kind TEXT NOT NULL DEFAULT 'REALE',   -- REALE | TEST | DEMO (TEST e DEMO mai nel benchmark, §9)
  join_code TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS consents (   -- consensi distinti e revocabili (§16)
  company_id INTEGER NOT NULL REFERENCES companies(id),
  type TEXT NOT NULL,                   -- benchmark | peer | testimonianza | followup
  granted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (company_id, type)
);

CREATE TABLE IF NOT EXISTS referents (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL, email TEXT, role TEXT,
  token TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY,
  base TEXT NOT NULL,                   -- GOV | EFF | GROW | SCALE
  title TEXT NOT NULL,
  date TEXT,
  mode TEXT NOT NULL DEFAULT 'workshop',     -- workshop | adhoc (§6.3)
  channel TEXT NOT NULL DEFAULT 'presenza',  -- presenza | remoto
  code TEXT UNIQUE NOT NULL,                 -- codice per il QR dei partecipanti
  phase TEXT NOT NULL DEFAULT 'preparazione',-- preparazione | individuale | confronto | consolidamento | chiusa
  instrument_version TEXT NOT NULL,
  scoring_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL, func TEXT NOT NULL, email TEXT,
  token TEXT UNIQUE NOT NULL,
  submitted_at TEXT,
  removed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS answers (    -- risposte individuali: livello 1–5 o NULL = N.D.
  participant_id INTEGER NOT NULL REFERENCES participants(id),
  item_id TEXT NOT NULL,
  level INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (participant_id, item_id)
);

CREATE TABLE IF NOT EXISTS pair_answers (
  participant_id INTEGER NOT NULL REFERENCES participants(id),
  item_a TEXT NOT NULL, item_b TEXT NOT NULL,
  answer TEXT NOT NULL,                 -- A | B | ND
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (participant_id, item_a, item_b)
);

CREATE TABLE IF NOT EXISTS presession (  -- scheda pre-sessione (Allegato C.2)
  company_id INTEGER NOT NULL REFERENCES companies(id),
  base TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  PRIMARY KEY (company_id, base)
);

CREATE TABLE IF NOT EXISTS session_company (
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  company_id INTEGER NOT NULL REFERENCES companies(id),
  draft_json TEXT NOT NULL DEFAULT '{}',   -- bozza del consolidamento
  consolidated_at TEXT, consolidated_by TEXT,
  report_released_at TEXT,
  leader_call_note TEXT,
  PRIMARY KEY (session_id, company_id)
);

CREATE TABLE IF NOT EXISTS consolidated (  -- valore ufficiale per azienda-item; storico, mai sovrascritto (§14)
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  company_id INTEGER NOT NULL REFERENCES companies(id),
  item_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'sessione',   -- sessione | allineato (§14.1)
  level INTEGER, sub TEXT, score REAL,
  confidence TEXT, confidence_label TEXT, confidence_reason TEXT,
  median REAL, valid_n INTEGER, nd_n INTEGER, range_ INTEGER, perspectives INTEGER,
  override INTEGER NOT NULL DEFAULT 0, override_reason TEXT,
  evidence TEXT,
  instrument_version TEXT NOT NULL, scoring_version TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS ix_cons_current ON consolidated(company_id, item_id, is_current);

CREATE TABLE IF NOT EXISTS commitments (  -- priorità e commitment (§11)
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  company_id INTEGER NOT NULL REFERENCES companies(id),
  priority_item TEXT NOT NULL,
  action TEXT, owner TEXT, due_date TEXT, kpi TEXT,
  peer_interest INTEGER NOT NULL DEFAULT 0, peer_note TEXT,
  status TEXT NOT NULL DEFAULT 'aperto',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (session_id, company_id)
);

CREATE TABLE IF NOT EXISTS benchmark_versions (  -- versioni congelate (§9, §17)
  id INTEGER PRIMARY KEY,
  base TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'sessione',
  label TEXT NOT NULL,
  n_companies INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  instrument_version TEXT NOT NULL, scoring_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS audit (       -- traccia di ogni modifica (§15)
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  actor TEXT, entity TEXT, entity_id TEXT, action TEXT,
  before_json TEXT, after_json TEXT, reason TEXT
);

CREATE TABLE IF NOT EXISTS report_snapshots (  -- report consegnati: copia congelata al rilascio (§9, §12, §17)
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  company_id INTEGER NOT NULL REFERENCES companies(id),
  version INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS admin_tokens (token TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS alignment_items (  -- allineamento finale (§14.1): conferma o modifica per capacità; storico, mai sovrascritto
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  item_id TEXT NOT NULL,
  action TEXT NOT NULL,                     -- conferma | modifica
  level INTEGER, sub TEXT, score REAL,
  base_level INTEGER, base_sub TEXT, base_score REAL, base_session_id INTEGER,  -- rilevazione in sessione al momento della scelta
  evidence TEXT,
  is_current INTEGER NOT NULL DEFAULT 1,
  created_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS alignment (  -- stato dell'allineamento per azienda: tre priorità finali e conferma
  company_id INTEGER PRIMARY KEY REFERENCES companies(id),
  priorities_json TEXT, priorities_note TEXT,
  confirmed_at TEXT, confirmed_by TEXT, updated_at TEXT
);

CREATE TABLE IF NOT EXISTS alignment_priorities (  -- storico delle tre priorità finali (regola 1)
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  priorities_json TEXT NOT NULL, note TEXT,
  is_current INTEGER NOT NULL DEFAULT 1,
  created_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS roster (  -- persone iscritte da ELIS: solo nome e funzione (regola 9); in sala si scelgono dal telefono
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL, func TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// migrazioni leggere su database già esistenti
for (const sql of ["ALTER TABLE commitments ADD COLUMN status_note TEXT", "ALTER TABLE commitments ADD COLUMN status_updated_at TEXT",
  "ALTER TABLE companies ADD COLUMN seeded INTEGER NOT NULL DEFAULT 0", "ALTER TABLE sessions ADD COLUMN seeded INTEGER NOT NULL DEFAULT 0",
  "CREATE UNIQUE INDEX IF NOT EXISTS ux_snap_version ON report_snapshots(session_id, company_id, version)",
  // flusso di preparazione: invito al referente e QR della sessione (dal QR il referente è bloccato fino alla chiusura)
  "ALTER TABLE session_company ADD COLUMN invited_at TEXT", "ALTER TABLE session_company ADD COLUMN qr_generated_at TEXT",
  "ALTER TABLE participants ADD COLUMN roster_id INTEGER",
  // trascrizione della call con il leader (Teams), allegata al report in una nuova versione
  "ALTER TABLE session_company ADD COLUMN leader_call_transcript TEXT", "ALTER TABLE session_company ADD COLUMN leader_call_at TEXT",
  // registro modifiche separato per ambiente: le righe già presenti sono di Produzione, tranne quelle del caricamento DEMO
  "ALTER TABLE audit ADD COLUMN seeded INTEGER NOT NULL DEFAULT 0",
  // report unificato dell'allineamento finale: una versione congelata come le altre, distinta per tipo
  "ALTER TABLE report_snapshots ADD COLUMN kind TEXT NOT NULL DEFAULT 'sessione'",
  // accesso solo DEMO (comitato scientifico): il ruolo sta nel gettone di accesso
  "ALTER TABLE admin_tokens ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'"]) {
  try { db.exec(sql); } catch { /* colonna già presente */ }
}
db.exec("UPDATE audit SET seeded = 1 WHERE seeded = 0 AND actor LIKE 'demo%'");
// righe scritte prima della separazione su aziende e sessioni DEMO: vanno nel registro DEMO
db.exec(`UPDATE audit SET seeded = 1 WHERE seeded = 0 AND (
  (entity = 'company' AND entity_id IN (SELECT CAST(id AS TEXT) FROM companies WHERE seeded = 1)) OR
  (entity = 'session' AND entity_id IN (SELECT CAST(id AS TEXT) FROM sessions WHERE seeded = 1)))`);

export const token = (n = 18) => crypto.randomBytes(n).toString('base64url');
export const shortCode = (n = 6) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (const b of crypto.randomBytes(n)) s += alphabet[b % alphabet.length];
  return s;
};

export const q = {
  all: (sql, ...p) => db.prepare(sql).all(...p),
  get: (sql, ...p) => db.prepare(sql).get(...p),
  run: (sql, ...p) => db.prepare(sql).run(...p),
};

// Transazione; se ne è già aperta una (per esempio il percorso guidato DEMO che chiama le regole vere), ci si unisce a quella
let txDepth = 0;
export function tx(fn) {
  if (txDepth) { txDepth++; try { return fn(); } finally { txDepth--; } }
  db.exec('BEGIN'); txDepth = 1;
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } finally { txDepth = 0; }
}

// Ambiente della richiesta in corso (0 Produzione, 1 DEMO): lo imposta il server per ogni richiesta,
// così ogni riga del registro sa a quale ambiente appartiene senza passarlo a mano.
export const envStore = new AsyncLocalStorage();
export const setRequestEnv = (seeded) => { const st = envStore.getStore(); if (st) st.seeded = seeded ? 1 : 0; };

export function audit(actor, entity, entityId, action, before, after, reason = null) {
  const seeded = String(actor || '').startsWith('demo') ? 1 : (envStore.getStore()?.seeded ?? 0);
  q.run('INSERT INTO audit (actor, entity, entity_id, action, before_json, after_json, reason, seeded) VALUES (?,?,?,?,?,?,?,?)',
    actor, entity, String(entityId ?? ''), action,
    before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after), reason, seeded);
}

export function getSetting(key) { return q.get('SELECT value FROM settings WHERE key = ?', key)?.value; }
export function setSetting(key, value) {
  q.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}
