// Dashboard del benchmark in tempo reale per la sessione (da proiettare in sala).
// Usa i valori consolidati correnti delle aziende idonee (REALE + consenso al benchmark, §9).
// Non sostituisce la versione congelata: è la vista "in corso" che diventa ufficiale solo con il congelamento.
import { q } from './db.js';
import * as L from './logic.js';
import * as E from './engine/index.js';

const I = E.INSTRUMENT, SC = E.SCORING;

export function liveDashboard(sessionId, { preview = false } = {}) {
  const session = L.getSession(sessionId);
  if (!session) return null;
  const def = L.baseDef(session);
  const comps = q.all(`SELECT c.id, c.kind FROM companies c ${preview ? '' : "WHERE c.kind != 'DEMO'"}`);
  let active = 0, consolidatedHere = 0, participants = 0, submitted = 0;
  for (const c of comps) {
    const parts = L.activeParticipants(session.id, c.id);
    const sc = q.get('SELECT consolidated_at FROM session_company WHERE session_id = ? AND company_id = ?', session.id, c.id);
    if (parts.length || sc?.consolidated_at) active++;
    if (sc?.consolidated_at) consolidatedHere++;
    participants += parts.length;
    submitted += parts.filter((p) => p.submitted_at).length;
  }
  const b = L.computeBenchmark(session.base, { preview });
  const n = b.companies.length;
  const dims = def.dimensions.map((d) => {
    const rows = b.dims[d] || [];
    const stats = E.benchmarkStats(rows);
    const out = { dimension: d, name: I.dimensions.find((x) => x.id === d).name, stats };
    if (stats.available) {
      const scores = rows.map((r) => r.score);
      out.bands = SC.bands.map((bd) => ({ id: bd.id, name: bd.name, count: scores.filter((s) => E.band(s).id === bd.id).length }));
      out.gap = E.communityGap(scores);
    }
    return out;
  });
  const items = def.items.map((itemId) => ({
    itemId, title: I.items[itemId].title,
    stats: E.benchmarkStats(b.items[itemId] || []),
    dist: E.levelDistribution(itemId, b.items[itemId] || []),
    nd: n - (b.items[itemId] || []).length,
  }));
  return {
    session: { id: session.id, title: session.title, base: session.base, phase: session.phase },
    def: { name: def.name, items: def.items, dimensions: def.dimensions },
    preview, updatedAt: new Date().toISOString(),
    progress: { active, consolidatedHere, participants, submitted, benchmarkN: n, minN: SC.benchmark.minN, stableN: SC.benchmark.stableN },
    dims, items,
    frozen: q.all('SELECT label, n_companies, created_at FROM benchmark_versions WHERE base = ? ORDER BY id DESC LIMIT 1', session.base)[0] || null,
  };
}
