// Dati dimostrativi per vedere la piattaforma "piena" (dashboard, plenaria, report, PDF).
// - 14 aziende DEMO con valori consolidati su tutte e quattro le sessioni
// - 1 azienda TEST "vetrina" con referente, scheda, partecipanti, risposte individuali, consolidamento e commitment
// DEMO e TEST non entrano MAI nel benchmark ufficiale (§9): si vedono solo nelle anteprime.
import { q, tx, shortCode, token, audit } from './db.js';
import * as L from './logic.js';
import * as E from './engine/index.js';

const I = E.INSTRUMENT;
const clamp = (x) => Math.max(1, Math.min(5, x));
const rnd = (a, b) => a + Math.random() * (b - a);
const pickSub = (itemId, level) => { const s = E.subOptions(itemId, level); return s.length ? s[Math.floor(Math.random() * s.length)].key : null; };
const SECTORS = ['Energia', 'Telecomunicazioni', 'Assicurazioni', 'Manifattura', 'Trasporti', 'Banche', 'Servizi', 'Infrastrutture', 'Farmaceutico', 'Retail', 'Utility', 'Difesa', 'Media', 'Logistica'];
const DEMO_NAMES = ['Aurora Energia', 'Borealis Telecom', 'Cassiopea Assicurazioni', 'Delta Meccanica', 'Eridano Trasporti', 'Fenice Banca', 'Gemini Servizi',
  'Helios Infrastrutture', 'Iride Pharma', 'Kappa Retail', 'Lyra Utility', 'Minerva Difesa', 'Nova Media', 'Orione Logistica'];

export function hasDemo() { return !!q.get('SELECT 1 FROM companies WHERE seeded = 1 LIMIT 1'); }

export function seedDemo() {
  const sessions = q.all("SELECT * FROM sessions WHERE mode = 'workshop' ORDER BY date");
  tx(() => {
    // ---- 14 aziende DEMO: una "maturità" di fondo per azienda, con scarti diversi per dimensione
    DEMO_NAMES.forEach((name, k) => {
      const r = q.run("INSERT INTO companies (name, perimeter, sector, kind, join_code, seeded) VALUES (?, 'Gruppo', ?, 'DEMO', ?, 1)", `${name} (demo)`, SECTORS[k], shortCode(4));
      const cid = Number(r.lastInsertRowid);
      q.run("INSERT INTO consents (company_id, type, granted) VALUES (?, 'benchmark', 1)", cid);
      if (Math.random() < 0.7) q.run("INSERT INTO consents (company_id, type, granted) VALUES (?, 'peer', 1)", cid);
      const m = rnd(1.7, 4.1);
      for (const s of sessions) {
        const def = E.sessionDef(s.base);
        const dimShift = Object.fromEntries(def.dimensions.map((d) => [d, rnd(-0.8, 0.8)]));
        const lv = {};
        for (const itemId of def.items) {
          const level = clamp(Math.round(m + dimShift[I.items[itemId].dimension] + rnd(-0.7, 0.7)));
          lv[itemId] = level;
          const sub = pickSub(itemId, level);
          q.run(`INSERT INTO consolidated (session_id, company_id, item_id, kind, level, sub, score, confidence, confidence_label, confidence_reason,
                 median, valid_n, nd_n, range_, perspectives, instrument_version, scoring_version, created_by)
                 VALUES (?,?,?,'sessione',?,?,?,'MEDIA','Media','dato dimostrativo',?,3,0,1,2,?,?,'demo')`,
            s.id, cid, itemId, level, sub, E.itemScore(itemId, level, sub), level, I.version, E.SCORING.version);
        }
        q.run("INSERT OR IGNORE INTO session_company (session_id, company_id, consolidated_at, consolidated_by) VALUES (?, ?, datetime('now'), 'demo')", s.id, cid);
        // priorità dimostrativa: la capacità più debole della sessione (serve alla mappa del peer matching)
        const prio = def.items.slice().sort((a, b) => lv[a] - lv[b] || Math.random() - 0.5)[0];
        q.run("INSERT INTO commitments (session_id, company_id, priority_item, action, owner, kpi, peer_interest) VALUES (?, ?, ?, 'Azione dimostrativa', 'Demo', 'Evidenza dimostrativa', ?)", s.id, cid, prio, Math.random() < 0.5 ? 1 : 0);
      }
    });
  });

  // ---- azienda vetrina (TEST): il flusso completo, in sessioni dimostrative separate (mai nelle sessioni reali)
  const r = q.run("INSERT INTO companies (name, perimeter, sector, kind, join_code, seeded) VALUES ('Vetrina S.p.A. (prova)', 'Gruppo', 'Servizi', 'TEST', ?, 1)", shortCode(4));
  const cid = Number(r.lastInsertRowid);
  q.run("INSERT INTO consents (company_id, type, granted) VALUES (?, 'benchmark', 1)", cid);
  q.run('INSERT INTO referents (company_id, name, email, role, token) VALUES (?, ?, ?, ?, ?)', cid, 'Referente di prova', '', 'Head of Innovation', token());
  const target = { Q1: 3, Q2: 2, Q9: 3, Q10: 2, Q5: 2, Q6: 3, Q13: 3, Q14: 2, Q3: 3, Q4: 2, Q15: 2, Q16: 4, Q7: 3, Q8: 2, Q11: 3, Q12: 4 };
  const people = [['Giulia Rossi', 'CEO'], ['Marco Bianchi', 'IT'], ['Elena Conti', 'HR'], ['Paolo Greco', 'FIN']];
  for (const real of sessions) {
    const sr = q.run(`INSERT INTO sessions (base, title, date, mode, channel, code, phase, instrument_version, scoring_version, seeded)
                      VALUES (?, ?, ?, 'adhoc', 'presenza', ?, 'chiusa', ?, ?, 1)`, real.base, `${E.sessionDef(real.base).name} · dimostrativa`, real.date, shortCode(5), I.version, E.SCORING.version);
    const s = L.getSession(Number(sr.lastInsertRowid));
    const def = E.sessionDef(s.base);
    // scheda pre-sessione: dati fattuali e profilo
    const data = {};
    for (const f of L.presessionFields(s.base).facts) {
      if (f.type === 'choice') data[f.id] = f.options[Math.floor(Math.random() * f.options.length)].label;
      else if (f.type === 'multi') data[f.id] = f.options.slice(0, 1 + Math.floor(Math.random() * f.options.length)).map((o) => o.label);
      else if (f.type === 'percent') data[f.id] = Math.round(rnd(2, 35));
      else data[f.id] = Math.floor(rnd(0, 4));
    }
    for (const p of L.presessionFields(s.base).profile) data[p.id] = p.type === 'percent' ? Math.round(rnd(10, 60)) : p.options[Math.floor(Math.random() * p.options.length)];
    L.savePresession(cid, s.base, data, 'demo');
    // partecipanti e risposte individuali attorno al livello "vero", con qualche N.D.
    const pids = people.slice(0, 3 + Math.floor(Math.random() * 2)).map(([name, func]) => {
      const pr = q.run("INSERT INTO participants (session_id, company_id, name, func, token, submitted_at) VALUES (?,?,?,?,?,datetime('now'))", s.id, cid, name, func, token());
      return Number(pr.lastInsertRowid);
    });
    for (const pid of pids) {
      for (const itemId of def.items) {
        const nd = Math.random() < 0.1;
        q.run('INSERT INTO answers (participant_id, item_id, level) VALUES (?,?,?)', pid, itemId, nd ? null : clamp(target[itemId] + Math.round(rnd(-1.2, 1.2))));
      }
      for (const [a, b] of def.pairs) q.run('INSERT INTO pair_answers (participant_id, item_a, item_b, answer) VALUES (?,?,?,?)', pid, a, b, Math.random() < 0.5 ? 'A' : 'B');
    }
    // consolidamento: mediana proposta quando intera, altrimenti livello "vero"; sotto-opzione dalla scheda
    const cmp = L.companyComparison(s.id, cid);
    const pre = L.getPresession(cid, s.base).data;
    const items = {};
    for (const it of cmp.items) {
      const level = it.summary.medianIsInteger ? it.summary.median : target[it.itemId];
      const fact = E.levelDef(it.itemId, level)?.fact;
      items[it.itemId] = { level, sub: (fact && E.suggestFromFact(fact, pre[fact.id])) || null };
    }
    L.confirmConsolidation(s.id, cid, { items }, 'demo');
    L.saveCommitment(s.id, cid, { priority_item: def.items[1], action: 'Azione di prova: formalizzare responsabilità e tempi', owner: 'Direzione Innovazione',
      due_date: s.date, kpi: 'Evidenza di prova', peer_interest: true }, 'demo');
  }
  audit('demo', 'demo', '', 'seed', null, { demo: DEMO_NAMES.length, vetrina: cid });
  return { demo: DEMO_NAMES.length, vetrinaId: cid };
}

export function removeDemo() {
  // solo ciò che ha creato il caricamento dimostrativo: mai aziende inserite a mano
  const ids = q.all('SELECT id FROM companies WHERE seeded = 1').map((r) => r.id);
  const sids = q.all('SELECT id FROM sessions WHERE seeded = 1').map((r) => r.id);
  if (!ids.length) return { removed: 0 };
  const ph = ids.map(() => '?').join(',');
  tx(() => {
    const pids = q.all(`SELECT id FROM participants WHERE company_id IN (${ph})`, ...ids).map((r) => r.id);
    if (pids.length) {
      const pp = pids.map(() => '?').join(',');
      q.run(`DELETE FROM answers WHERE participant_id IN (${pp})`, ...pids);
      q.run(`DELETE FROM pair_answers WHERE participant_id IN (${pp})`, ...pids);
    }
    for (const t of ['participants', 'presession', 'session_company', 'consolidated', 'commitments', 'report_snapshots', 'consents', 'referents']) {
      q.run(`DELETE FROM ${t} WHERE company_id IN (${ph})`, ...ids);
    }
    q.run(`DELETE FROM companies WHERE id IN (${ph})`, ...ids);
    if (sids.length) q.run(`DELETE FROM sessions WHERE id IN (${sids.map(() => '?').join(',')})`, ...sids);
  });
  audit('admin', 'demo', '', 'remove', null, { removed: ids.length });
  return { removed: ids.length };
}
