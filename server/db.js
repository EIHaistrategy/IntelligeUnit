// Database locale SQLite (modulo integrato in Node.js ≥ 22.13: nessuna installazione aggiuntiva).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

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

CREATE TABLE IF NOT EXISTS admin_tokens (token TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT (datetime('now')));
`);

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

export function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

export function audit(actor, entity, entityId, action, before, after, reason = null) {
  q.run('INSERT INTO audit (actor, entity, entity_id, action, before_json, after_json, reason) VALUES (?,?,?,?,?,?,?)',
    actor, entity, String(entityId ?? ''), action,
    before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after), reason);
}

export function getSetting(key) { return q.get('SELECT value FROM settings WHERE key = ?', key)?.value; }
export function setSetting(key, value) {
  q.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}
