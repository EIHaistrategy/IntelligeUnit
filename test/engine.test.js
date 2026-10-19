import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../server/engine/index.js';

const close = (a, b, eps = 0.05) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('§8.1 tabella degli score con 2 e 3 sotto-opzioni', () => {
  assert.equal(E.itemScore('Q1', 1), 0);
  assert.equal(E.itemScore('Q1', 5), 100);
  assert.equal(E.itemScore('Q1', 2, 'A'), 25);
  assert.equal(E.itemScore('Q1', 2, 'B'), 37.5);
  assert.equal(E.itemScore('Q1', 3, 'B'), 62.5);
  assert.equal(E.itemScore('Q1', 4, 'B'), 87.5);
  close(E.itemScore('Q2', 3, 'B'), 58.3); // Q2-L3 ha tre opzioni
  close(E.itemScore('Q2', 3, 'C'), 66.7);
  close(E.itemScore('Q3', 2, 'B'), 33.3);
  close(E.itemScore('Q3', 2, 'C'), 41.7);
  close(E.itemScore('Q2', 4, 'C'), 91.7);
  assert.equal(E.itemScore('Q1', null), null);
});

test('§4.1 senza sotto-opzione scelta vale la prima opzione del livello', () => {
  assert.equal(E.itemScore('Q1', 3), 50);
});

test('nessuna sotto-opzione raggiunge il livello successivo', () => {
  for (const [id, it] of Object.entries(E.INSTRUMENT.items)) {
    for (const l of it.levels) {
      for (const s of l.sub || []) assert.ok(E.itemScore(id, l.level, s.key) < l.level * 25, `${id}-L${l.level}${s.key}`);
    }
  }
});

test('struttura dello strumento: 16 item, 8 dimensioni, 2 item per dimensione, 4 item per sessione', () => {
  assert.equal(Object.keys(E.INSTRUMENT.items).length, 16);
  assert.equal(E.INSTRUMENT.dimensions.length, 8);
  E.INSTRUMENT.dimensions.forEach((d) => assert.equal(d.items.length, 2));
  E.INSTRUMENT.sessions.forEach((s) => {
    assert.equal(s.items.length, 4);
    s.dimensions.forEach((d) => E.INSTRUMENT.dimensions.find((x) => x.id === d).items.forEach((i) => assert.ok(s.items.includes(i))));
  });
  // sotto-opzioni solo ai livelli 2–4; C solo negli otto casi del §4.2
  const withC = [];
  for (const [id, it] of Object.entries(E.INSTRUMENT.items)) {
    for (const l of it.levels) {
      if (l.level === 1 || l.level === 5) assert.ok(!l.sub);
      else assert.ok(l.sub && l.sub.length >= 2, `${id}-L${l.level}`);
      if (l.sub?.length === 3) withC.push(`${id}-L${l.level}`);
    }
  }
  assert.deepEqual(withC.sort(), ['Q13-L2', 'Q2-L3', 'Q2-L4', 'Q3-L2', 'Q4-L4', 'Q6-L2', 'Q6-L4', 'Q9-L3'].sort());
});

test('§8.2 verifica: nessun punteggio di dimensione ottenibile coincide con 44 o 70', () => {
  for (const d of E.INSTRUMENT.dimensions) {
    const opts = d.items.map((id) => {
      const s = [];
      for (const l of E.INSTRUMENT.items[id].levels) {
        if (!l.sub) s.push(E.itemScore(id, l.level)); else l.sub.forEach((x) => s.push(E.itemScore(id, l.level, x.key)));
      }
      return s;
    });
    for (const a of opts[0]) for (const b of opts[1]) {
      const m = (a + b) / 2;
      assert.ok(Math.abs(m - 44) > 0.01 && Math.abs(m - 70) > 0.01, `${d.id}: ${m}`);
    }
  }
});

test('§8.2 dimensione solo con entrambi gli item; fasce 44/70', () => {
  assert.equal(E.dimensionScore('A', { Q1: 50, Q2: null }), null);
  assert.equal(E.dimensionScore('A', { Q1: 50, Q2: 75 }), 62.5);
  assert.equal(E.band(43.75).name, 'Fondativa');
  assert.equal(E.band(45.8).name, 'In costruzione');
  assert.equal(E.band(68.75).name, 'In costruzione');
  assert.equal(E.band(70.8).name, 'Consolidata');
});

test('§8.3 indicatore complessivo solo a 8/8', () => {
  assert.equal(E.overallIndicator({ A: 50, B: 50, C: 50, D: 50, E: 50, F: 50, G: 50, H: null }), null);
  assert.equal(E.overallIndicator({ A: 50, B: 50, C: 50, D: 50, E: 50, F: 50, G: 50, H: 90 }), 55);
});

test('§7 confidence', () => {
  const s = (levels, funcs) => E.summarizeAnswers(levels.map((l, i) => ({ level: l, func: funcs?.[i] ?? 'F' + i })));
  assert.equal(E.confidence(s([null, null])).code, 'ND');
  assert.equal(E.confidence(s([3, null])).code, 'BASSA');
  assert.equal(E.confidence(s([3, 3])).code, 'MEDIA');
  assert.equal(E.confidence(s([3, 3, 4], ['IT', 'HR', 'IT'])).code, 'ALTA');
  assert.equal(E.confidence(s([3, 3, 4], ['IT', 'IT', 'IT'])).code, 'MEDIA'); // una sola prospettiva
  assert.equal(E.confidence(s([2, 3, 3, 2])).code, 'MEDIA'); // mediana 2,5
  assert.equal(E.confidence(s([2, 4, 3]), 'proposta').code, 'DA_VALIDARE');
  assert.equal(E.confidence(s([2, 4, 3]), 'consolidato').code, 'MEDIA');
  // N.D. non entra nella mediana
  const x = s([3, null, 4, 4]);
  assert.equal(x.valid, 3); assert.equal(x.median, 4); assert.equal(x.nd, 1);
});

test('§7 override solo se diverso da una mediana intera', () => {
  const s = E.summarizeAnswers([{ level: 3 }, { level: 3 }, { level: 4 }]);
  assert.equal(E.isOverride(s, 3), false);
  assert.equal(E.isOverride(s, 4), true);
  const f = E.summarizeAnswers([{ level: 2 }, { level: 3 }]);
  assert.equal(E.isOverride(f, 2), false);
});

test('§6.5 confronti a coppie discordanti', () => {
  assert.equal(E.pairDiscordant(3, 2, 'A'), false);
  assert.equal(E.pairDiscordant(3, 2, 'B'), true);
  assert.equal(E.pairDiscordant(3, 3, 'B'), null);
  assert.equal(E.pairDiscordant(3, null, 'B'), null);
});

test('scheda pre-sessione → sotto-opzione suggerita', () => {
  const f = (id, L) => E.levelDef(id, L).fact;
  assert.equal(E.suggestFromFact(f('Q2', 3), 'Esiste un comitato AI'), 'B');
  assert.equal(E.suggestFromFact(f('Q2', 4), ['Efficienza', 'Innovazione']), 'B');
  assert.equal(E.suggestFromFact(f('Q13', 2), 0.5), 'A');
  assert.equal(E.suggestFromFact(f('Q13', 2), 1), 'B');
  assert.equal(E.suggestFromFact(f('Q13', 2), 10), 'B');
  assert.equal(E.suggestFromFact(f('Q13', 2), 10.5), 'C');
  assert.equal(E.suggestFromFact(f('Q4', 3), 9.9), 'A');
  assert.equal(E.suggestFromFact(f('Q4', 3), 10), 'B');
  assert.equal(E.suggestFromFact(f('Q3', 2), 0), 'A');
  assert.equal(E.suggestFromFact(f('Q3', 2), 1), 'B');
  assert.equal(E.suggestFromFact(f('Q3', 2), 4), 'C');
  assert.equal(E.suggestFromFact(f('Q6', 2), 3), 'C');
});

test('§9 benchmark: soglie 5/15, leave-one-out, quartili', () => {
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ company: i + 1, score: 25 + i * 5 }));
  assert.equal(E.benchmarkStats(rows(4)).available, false);
  assert.equal(E.benchmarkStats(rows(5)).label, 'Indicativo');
  assert.equal(E.benchmarkStats(rows(15)).label, 'Stabile');
  // LOO applicato solo se il residuo resta ≥ 5
  assert.equal(E.benchmarkStats(rows(5), 1).looApplied, false);
  const b = E.benchmarkStats(rows(6), 1);
  assert.equal(b.looApplied, true); assert.equal(b.n, 5); assert.equal(b.median, 40);
  assert.equal(E.quantile([1, 2, 3, 4], 0.25), 1.75); // come QUARTILE.INC
});

test('§9 regola dei 5 sui sotto-livelli', () => {
  const rows = [];
  for (let i = 0; i < 5; i++) rows.push({ company: i, level: 3, sub: 'A' });
  for (let i = 0; i < 5; i++) rows.push({ company: 10 + i, level: 3, sub: 'B' });
  rows.push({ company: 99, level: 2, sub: 'B' });
  const d = E.levelDistribution('Q1', rows);
  assert.ok(d.levels[2].subDist); // L3: 5 e 5 → mostrato
  assert.equal(d.levels[1].subDist, null); // L2: 1 sola azienda → aggregato
  assert.equal(d.levels[1].subAggregated, true);
});

test('§10.2 quadranti Dove intervenire', () => {
  assert.equal(E.whereQuadrant(75, 60).name, 'Scalare e valorizzare');
  assert.equal(E.whereQuadrant(75, 80).name, 'Ottimizzare');
  assert.equal(E.whereQuadrant(50, 50).name, 'Consolidare');
  assert.equal(E.whereQuadrant(40, 50).name, 'Recuperare');
});

test('§10.5 coerenza: direzione rischiosa, prudenza, bidirezionale, C6 per ciascuna abilitante', () => {
  // C1: Q1 (dipendente) 87,5 vs Q2 (abilitante) 25 → +62,5 → da esaminare
  let c = E.coherence({ Q1: 87.5, Q2: 25 }, {});
  assert.equal(c.find((r) => r.id === 'C1').flagged, true);
  c = E.coherence({ Q1: 25, Q2: 87.5 }, {});
  assert.equal(c.find((r) => r.id === 'C1').comparisons[0].status, 'prudenza');
  // C2 bidirezionale
  c = E.coherence({ Q13: 87.5, Q14: 25 }, {});
  assert.equal(c.find((r) => r.id === 'C2').flagged, true);
  // soglia esattamente 50 → da esaminare
  c = E.coherence({ Q1: 75, Q2: 25 }, {});
  assert.equal(c.find((r) => r.id === 'C1').flagged, true);
  // C6: Q12 vs E, Q7, Q8 separatamente
  c = E.coherence({ Q12: 87.5, Q7: 75, Q8: 25 }, { E: 75 });
  const c6 = c.find((r) => r.id === 'C6');
  assert.equal(c6.available, true);
  assert.deepEqual(c6.comparisons.map((x) => x.status), ['coerente', 'coerente', 'da_esaminare']);
  // regola non disponibile se manca un dato
  assert.equal(E.coherence({ Q1: 50 }, {}).find((r) => r.id === 'C1').available, false);
});

test('§11.1 priorità: coerenza prima del livello', () => {
  const items = { Q1: 87.5, Q2: 25, Q9: 50, Q10: 25 };
  const dims = E.allDimensionScores(items);
  const p = E.proposePriorities(items, dims);
  assert.equal(p[0].dimension, 'A'); // C1 attiva su A anche se E ha score più basso
  assert.equal(p[0].tier, 1);
});
