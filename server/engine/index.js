// Motore di calcolo della AI Transformation & Adoption Map (Nota metodologica V1).
// Funzioni pure: nessun accesso al database. Ogni regola rimanda al paragrafo della nota.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const INSTRUMENT = JSON.parse(readFileSync(path.join(here, '../instrument/v1.0.json'), 'utf8'));
export const SCORING = JSON.parse(readFileSync(path.join(here, '../instrument/scoring-1.0.json'), 'utf8'));

const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

// ---------- Strumento ----------
export function itemDef(id, inst = INSTRUMENT) { return inst.items[id]; }
export function levelDef(itemId, level, inst = INSTRUMENT) {
  return inst.items[itemId]?.levels.find((l) => l.level === Number(level));
}
export function subOptions(itemId, level, inst = INSTRUMENT) {
  return levelDef(itemId, level, inst)?.sub || [];
}
export function sessionDef(id, inst = INSTRUMENT) { return inst.sessions.find((s) => s.id === id); }
export function dimensionOf(itemId, inst = INSTRUMENT) { return inst.items[itemId].dimension; }

// ---------- §8.1 Score dell'item (scala 0–100) ----------
// (livello − 1) / 4 × 100; ai livelli 2–4 l'opzione k su n aggiunge (k − 1) / n × 25.
export function itemScore(itemId, level, subKey, inst = INSTRUMENT) {
  if (level == null) return null;
  const L = Number(level);
  if (!(L >= 1 && L <= 5)) throw new Error(`Livello non valido: ${level}`);
  const base = ((L - 1) / 4) * 100;
  const subs = subOptions(itemId, L, inst);
  if (L === 1 || L === 5 || subs.length === 0) return base;
  const k = subKey ? subs.findIndex((s) => s.key === subKey) + 1 : 1; // §4.1 in caso di dubbio vale la prima opzione
  if (k < 1) throw new Error(`Sotto-opzione ${subKey} non esiste per ${itemId}-L${L}`);
  return base + ((k - 1) / subs.length) * 25;
}

// ---------- §8.2 Dimensione e fasce ----------
export function dimensionScore(dimId, itemScores, inst = INSTRUMENT) {
  const dim = inst.dimensions.find((d) => d.id === dimId);
  const vals = dim.items.map((i) => itemScores[i]);
  if (vals.some((v) => v == null)) return null; // nessuna imputazione
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
export function band(score, sc = SCORING) {
  if (score == null) return null;
  for (const b of sc.bands) if (b.lt == null || score < b.lt) return b;
  return null;
}
export function allDimensionScores(itemScores, inst = INSTRUMENT) {
  const out = {};
  for (const d of inst.dimensions) out[d.id] = dimensionScore(d.id, itemScores, inst);
  return out;
}
// §8.3 indicatore complessivo: solo a Map completa (8/8), pesi uguali
export function overallIndicator(dimScores) {
  const vals = Object.values(dimScores);
  if (vals.length !== 8 || vals.some((v) => v == null)) return null;
  return vals.reduce((a, b) => a + b, 0) / 8;
}

// ---------- Statistiche descrittive ----------
export function median(arr) {
  const a = arr.filter((x) => x != null).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
// QUARTILE.INC di Excel (interpolazione lineare, tipo 7)
export function quantile(arr, p) {
  const a = arr.filter((x) => x != null).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const h = (a.length - 1) * p;
  const lo = Math.floor(h);
  return a[lo] + (h - lo) * ((a[Math.min(lo + 1, a.length - 1)]) - a[lo]);
}

// ---------- §7 Risposte individuali, mediana proposta e confidence ----------
// answers: [{ level: 1..5 | null (N.D.), func: 'IT' }]
export function summarizeAnswers(answers) {
  const valid = answers.filter((a) => a.level != null);
  const levels = valid.map((a) => Number(a.level));
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  levels.forEach((l) => counts[l]++);
  const med = median(levels);
  const range = levels.length ? Math.max(...levels) - Math.min(...levels) : null;
  const perspectives = new Set(valid.map((a) => a.func).filter(Boolean)).size;
  return {
    n: answers.length,
    valid: levels.length,
    nd: answers.length - levels.length,
    counts,
    median: med,
    medianIsInteger: med != null && Number.isInteger(med),
    range,
    perspectives,
    divergent: range != null && range >= 2,
  };
}

// Restituisce { code, label, reason } secondo la tabella del §7.
// stage: 'proposta' (prima del consolidamento) | 'consolidato'
export function confidence(summary, stage = 'consolidato') {
  const s = summary;
  if (s.valid === 0) return { code: 'ND', label: 'N.D.', reason: 'Nessuna risposta valida' };
  if (s.valid === 1) return { code: 'BASSA', label: 'Bassa · single respondent', reason: '1 risposta valida' };
  if (s.range >= 2) {
    return stage === 'proposta'
      ? { code: 'DA_VALIDARE', label: 'Da validare', reason: 'Range ≥ 2: discussione obbligatoria' }
      : { code: 'MEDIA', label: 'Media', reason: 'Range ≥ 2, consolidato dopo discussione' };
  }
  if (s.valid === 2) {
    return s.range === 0
      ? { code: 'MEDIA', label: 'Media', reason: '2 risposte uguali' }
      : { code: 'MEDIA', label: 'Media', reason: 'Mediana frazionaria: decisione del gruppo sul descrittore' };
  }
  if (!s.medianIsInteger) return { code: 'MEDIA', label: 'Media', reason: 'Mediana frazionaria: decisione del gruppo sul descrittore' };
  if (s.perspectives < 2) return { code: 'MEDIA', label: 'Media', reason: 'Copertura funzionale limitata (una sola prospettiva)' };
  return { code: 'ALTA', label: 'Alta', reason: '≥ 3 risposte valide, almeno 2 prospettive, range ≤ 1' };
}

// Livello proposto per il consolidamento: la mediana se intera, altrimenti nessuna proposta (decide il gruppo).
export function proposedLevel(summary) {
  return summary.medianIsInteger ? summary.median : null;
}
// Override = livello ufficiale diverso dalla mediana proposta (intera). Va motivato (§7).
export function isOverride(summary, officialLevel) {
  if (summary.valid === 0) return false;
  if (!summary.medianIsInteger) return false; // con mediana frazionaria la scelta è del gruppo, non un override
  return Number(officialLevel) !== summary.median;
}

// ---------- §6.5 Confronti a coppie ----------
// answer: 'A' (più avanti il primo item), 'B' (il secondo), 'ND'
export function pairDiscordant(levelA, levelB, answer) {
  if (answer == null || answer === 'ND' || levelA == null || levelB == null) return null; // non valutabile
  if (levelA === levelB) return null; // livelli uguali: il confronto non contraddice
  const scoreSays = levelA > levelB ? 'A' : 'B';
  return scoreSays !== answer;
}

// ---------- Scheda pre-sessione → sotto-opzione suggerita ----------
export function suggestFromFact(fact, value) {
  if (!fact || value == null || value === '') return null;
  if (fact.type === 'choice') {
    const opt = fact.options.find((o) => o.label === value);
    return opt ? opt.maps : null;
  }
  if (fact.type === 'multi') {
    const n = Array.isArray(value) ? value.length : 0;
    return fact.countMaps[String(n)] ?? null;
  }
  if (fact.type === 'count' || fact.type === 'percent') {
    const v = Number(value);
    if (Number.isNaN(v)) return null;
    for (const t of fact.thresholds) {
      if (t.lt != null && v < t.lt) return t.maps;
      if (t.lte != null && v <= t.lte) return t.maps;
      if (t.lt == null && t.lte == null) return t.maps;
    }
  }
  return null;
}

// ---------- §9 Benchmark ----------
export function sampleLabel(n, sc = SCORING) {
  if (n < sc.benchmark.minN) return { code: 'ND', label: 'Non disponibile' };
  if (n < sc.benchmark.stableN) return { code: 'IND', label: 'Indicativo' };
  return { code: 'STAB', label: 'Stabile' };
}

// rows: [{ company, score }] — una azienda = una osservazione, N.D. esclusi.
// excludeCompany: leave-one-out se il residuo resta ≥ looMinResidual.
export function benchmarkStats(rows, excludeCompany = null, sc = SCORING) {
  let pool = rows.filter((r) => r.score != null);
  let looApplied = false;
  if (excludeCompany != null) {
    const residual = pool.filter((r) => r.company !== excludeCompany);
    if (residual.length >= sc.benchmark.looMinResidual) { pool = residual; looApplied = true; }
  }
  const n = pool.length;
  const lab = sampleLabel(n, sc);
  if (lab.code === 'ND') return { n, label: lab.label, code: lab.code, available: false, looApplied };
  const s = pool.map((r) => r.score);
  return {
    n, label: lab.label, code: lab.code, available: true, looApplied,
    median: quantile(s, 0.5), q1: quantile(s, 0.25), q3: quantile(s, 0.75),
    iqr: quantile(s, 0.75) - quantile(s, 0.25),
  };
}

// Distribuzione per livello e, dove la regola dei 5 lo consente, per sotto-livello.
// rows: [{ company, level, sub }]
export function levelDistribution(itemId, rows, sc = SCORING, inst = INSTRUMENT) {
  const valid = rows.filter((r) => r.level != null);
  const lab = sampleLabel(valid.length, sc);
  if (lab.code === 'ND') return { n: valid.length, available: false, label: lab.label };
  const levels = [1, 2, 3, 4, 5].map((L) => {
    const inL = valid.filter((r) => Number(r.level) === L);
    const subs = subOptions(itemId, L, inst);
    let subDist = null;
    if (subs.length && inL.length) {
      const cats = subs.map((s) => ({ key: s.key, count: inL.filter((r) => (r.sub || subs[0].key) === s.key).length }));
      const shown = cats.filter((c) => c.count > 0);
      if (shown.every((c) => c.count >= sc.benchmark.subLevelMinN)) subDist = cats;
    }
    return { level: L, count: inL.length, subDist, subAggregated: subs.length > 0 && inL.length > 0 && subDist == null };
  });
  return { n: valid.length, available: true, label: lab.label, levels };
}

// ---------- §10.2 Dove intervenire ----------
export function whereQuadrant(score, peerMedian, sc = SCORING) {
  if (score == null || peerMedian == null) return null;
  const delta = score - peerMedian;
  const hi = score >= sc.maps.where.score;
  const up = delta >= sc.maps.where.delta;
  const key = (hi ? 'H' : 'L') + (up ? 'H' : 'L');
  const names = sc.quadrantNames[sc.quadrantNamesInUse];
  const alt = sc.quadrantNames.alternativi;
  return { delta, key, name: names[key], altName: alt[key] };
}

// ---------- §10.3 Gap della community ----------
export function communityGap(dimScoresOfCompanies, sc = SCORING) {
  const s = dimScoresOfCompanies.filter((x) => x != null);
  const lab = sampleLabel(s.length, sc);
  if (lab.code === 'ND') return { n: s.length, available: false, label: lab.label };
  const fondShare = s.filter((x) => band(x, sc).id === 'FOND').length / s.length;
  const iqr = quantile(s, 0.75) - quantile(s, 0.25);
  const hf = fondShare >= sc.maps.community.fondShare;
  const hi = iqr >= sc.maps.community.iqr;
  const key = `${hf ? 'HF' : 'LF'}_${hi ? 'HI' : 'LI'}`;
  return { n: s.length, available: true, label: lab.label, fondShare, iqr, quadrant: sc.communityQuadrants[key] };
}

// ---------- §10.4 Peer matching ----------
export function peerQuadrant(needCount, contribCount, sc = SCORING) {
  const hn = needCount >= sc.maps.peer.need;
  const hc = contribCount >= sc.maps.peer.contrib;
  return sc.peerQuadrants[`${hn ? 'HN' : 'LN'}_${hc ? 'HC' : 'LC'}`];
}

// ---------- §10.5 Lettura di coerenza ----------
// itemScores: { Q1: 62.5, ... }; dimScores: { A: .., E: .. }
export function coherence(itemScores, dimScores, sc = SCORING, inst = INSTRUMENT) {
  const val = (ref) => (ref.type === 'item' ? itemScores[ref.ref] : dimScores[ref.ref]);
  const name = (ref) => (ref.type === 'item' ? `${ref.ref} ${inst.items[ref.ref].title}` : `${ref.ref} ${inst.dimensions.find((d) => d.id === ref.ref).name}`);
  const T = sc.coherenceThreshold;
  return inst.coherence.map((rule) => {
    const dep = val(rule.dependent);
    const comps = rule.enablers.map((en) => {
      const e = val(en);
      if (e == null || dep == null) return { enabler: name(en), available: false };
      const diff = dep - e; // > 0: la dipendente è più avanti dell'abilitante (direzione rischiosa)
      let status = 'coerente';
      if (rule.bidirectional ? Math.abs(diff) >= T : diff >= T) status = 'da_esaminare';
      else if (!rule.bidirectional && -diff >= T) status = 'prudenza';
      return { enabler: name(en), enablerScore: e, dependentScore: dep, diff, status, available: true };
    });
    const available = comps.length > 0 && comps.every((c) => c.available);
    const flagged = comps.some((c) => c.status === 'da_esaminare');
    return { id: rule.id, label: rule.label, signal: rule.signal, session: rule.session, dependent: name(rule.dependent),
      crossSession: !!rule.crossSession, bidirectional: !!rule.bidirectional, available, flagged, comparisons: comps };
  });
}

// ---------- §11.1 Ordine proposto delle priorità (non sostituisce il giudizio) ----------
// Restituisce le dimensioni ordinate con le ragioni. peerMedians: { A: 55, ... } (null se non disponibile)
export function proposePriorities(itemScores, dimScores, peerMedians = {}, sc = SCORING, inst = INSTRUMENT) {
  const coh = coherence(itemScores, dimScores, sc, inst);
  const cands = inst.dimensions.filter((d) => dimScores[d.id] != null).map((d) => {
    const reasons = [];
    let tier = 9;
    const touched = coh.filter((r) => r.flagged && r.comparisons.some((c) => c.status === 'da_esaminare' &&
      (c.enabler.startsWith(d.id + ' ') || d.items.some((i) => c.enabler.startsWith(i + ' ')) || d.items.some((i) => r.dependent.startsWith(i + ' ')))));
    if (touched.length) { tier = 1; reasons.push(`Riportare a coerenza: ${touched.map((r) => r.id).join(', ')}`); }
    const prereq = sc.foundationalPrerequisites.some((p) => p === d.id || d.items.includes(p));
    if (tier > 2 && prereq && dimScores[d.id] < 70) { tier = 2; reasons.push('Prerequisito fondativo sotto 70'); }
    const pm = peerMedians[d.id];
    if (tier > 3 && dimScores[d.id] < 70 && pm != null && dimScores[d.id] < pm) { tier = 3; reasons.push('Sotto 70 e sotto la mediana peer'); }
    if (tier === 9 && dimScores[d.id] < 70) { tier = 4; reasons.push('Sotto 70'); }
    return { dimension: d.id, name: d.name, score: dimScores[d.id], tier, reasons };
  });
  return cands.sort((a, b) => a.tier - b.tier || a.score - b.score);
}

export const fmt = { round1 };
