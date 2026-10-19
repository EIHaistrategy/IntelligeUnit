// Crea aziende DEMO con valori consolidati fittizi per provare plenaria e report in anteprima.
// Le aziende DEMO non entrano MAI nel benchmark ufficiale (§9). Uso: npm run demo [-- 14]
import { q, tx, shortCode } from './db.js';
import * as E from './engine/index.js';

const N = Number(process.argv[2] || 14);
const pick = (w) => { let r = Math.random() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return i; } return w.length - 1; };
const sessions = q.all("SELECT * FROM sessions WHERE mode = 'workshop'");
const bases = (process.argv[3] || 'GOV').split(',');

tx(() => {
  const existing = q.get("SELECT COUNT(*) n FROM companies WHERE kind = 'DEMO'").n;
  for (let k = 0; k < N; k++) {
    const r = q.run("INSERT INTO companies (name, perimeter, sector, kind, join_code) VALUES (?, 'Gruppo', 'Demo', 'DEMO', ?)", `Azienda Demo ${String(existing + k + 1).padStart(2, '0')}`, shortCode(4));
    const cid = Number(r.lastInsertRowid);
    q.run("INSERT INTO consents (company_id, type, granted) VALUES (?, 'benchmark', 1)", cid);
    for (const base of bases) {
      const s = sessions.find((x) => x.base === base);
      for (const itemId of E.sessionDef(base).items) {
        const level = pick([1, 4, 5, 2.5, 0.6]) + 1;
        const subs = E.subOptions(itemId, level);
        const sub = subs.length ? subs[Math.floor(Math.random() * subs.length)].key : null;
        q.run(`INSERT INTO consolidated (session_id, company_id, item_id, kind, level, sub, score, confidence, confidence_label, confidence_reason,
               median, valid_n, nd_n, range_, perspectives, instrument_version, scoring_version, created_by)
               VALUES (?,?,?,'sessione',?,?,?,'MEDIA','Media','dato dimostrativo',?,3,0,1,2,?,?,'seed-demo')`,
          s.id, cid, itemId, level, sub, E.itemScore(itemId, level, sub), level, E.INSTRUMENT.version, E.SCORING.version);
      }
      q.run("INSERT OR IGNORE INTO session_company (session_id, company_id, consolidated_at, consolidated_by) VALUES (?, ?, datetime('now'), 'seed-demo')", s.id, cid);
    }
  }
});
console.log(`Create ${N} aziende DEMO con dati consolidati fittizi per: ${bases.join(', ')}. Visibili solo nelle anteprime.`);
