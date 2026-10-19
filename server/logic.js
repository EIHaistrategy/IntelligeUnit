// Logica applicativa: collega il database al motore di calcolo.
import { q, tx, audit } from './db.js';
import * as E from './engine/index.js';

const I = E.INSTRUMENT;
const S = E.SCORING;
const parse = (s, d = {}) => { try { return JSON.parse(s); } catch { return d; } };

export function getSession(id) { return q.get('SELECT * FROM sessions WHERE id = ?', id); }
export function baseDef(session) { return E.sessionDef(session.base); }

export function ensureSessionCompany(sessionId, companyId) {
  q.run('INSERT OR IGNORE INTO session_company (session_id, company_id) VALUES (?, ?)', sessionId, companyId);
  return q.get('SELECT * FROM session_company WHERE session_id = ? AND company_id = ?', sessionId, companyId);
}

export function activeParticipants(sessionId, companyId) {
  return q.all('SELECT * FROM participants WHERE session_id = ? AND company_id = ? AND removed = 0 ORDER BY id', sessionId, companyId);
}

// ---------- Fase individuale ----------
export function participantState(p) {
  const session = getSession(p.session_id);
  const def = baseDef(session);
  const answers = Object.fromEntries(q.all('SELECT item_id, level FROM answers WHERE participant_id = ?', p.id).map((r) => [r.item_id, r.level]));
  const answered = new Set(q.all('SELECT item_id FROM answers WHERE participant_id = ?', p.id).map((r) => r.item_id));
  const pairs = q.all('SELECT item_a, item_b, answer FROM pair_answers WHERE participant_id = ?', p.id);
  return { session, def, answers, answered: [...answered], pairs };
}

// ---------- Vista di confronto intra-azienda (anonima) ----------
export function companyComparison(sessionId, companyId) {
  const session = getSession(sessionId);
  const def = baseDef(session);
  const parts = activeParticipants(sessionId, companyId);
  const ids = parts.map((p) => p.id);
  const ph = ids.map(() => '?').join(',') || 'NULL';
  const ans = ids.length ? q.all(`SELECT participant_id, item_id, level FROM answers WHERE participant_id IN (${ph})`, ...ids) : [];
  const pairAns = ids.length ? q.all(`SELECT participant_id, item_a, item_b, answer FROM pair_answers WHERE participant_id IN (${ph})`, ...ids) : [];
  const funcOf = Object.fromEntries(parts.map((p) => [p.id, p.func]));
  const levelOf = {};
  for (const a of ans) (levelOf[a.participant_id] ||= {})[a.item_id] = a.level;

  const items = def.items.map((itemId) => {
    const rows = ans.filter((a) => a.item_id === itemId).map((a) => ({ level: a.level, func: funcOf[a.participant_id] }));
    const s = E.summarizeAnswers(rows);
    return { itemId, title: I.items[itemId].title, summary: s, confidence: E.confidence(s, 'proposta'), proposed: E.proposedLevel(s) };
  });
  const pairs = def.pairs.map(([a, b]) => {
    const rows = pairAns.filter((r) => r.item_a === a && r.item_b === b);
    const counts = { A: 0, B: 0, ND: 0 };
    let discordant = 0, evaluable = 0;
    for (const r of rows) {
      counts[r.answer] = (counts[r.answer] || 0) + 1;
      const d = E.pairDiscordant(levelOf[r.participant_id]?.[a], levelOf[r.participant_id]?.[b], r.answer);
      if (d != null) { evaluable++; if (d) discordant++; }
    }
    return { a, b, aTitle: I.items[a].title, bTitle: I.items[b].title, counts, discordant, evaluable, n: rows.length };
  });
  const submitted = parts.filter((p) => p.submitted_at).length;
  return { participants: parts.length, submitted, functions: [...new Set(parts.map((p) => p.func))], items, pairs };
}

// ---------- Scheda pre-sessione ----------
export function presessionFields(base) {
  const def = E.sessionDef(base);
  const facts = [];
  for (const itemId of def.items) {
    for (const l of I.items[itemId].levels) {
      if (l.fact) facts.push({ ...l.fact, itemId, level: l.level, itemTitle: I.items[itemId].title, factOwner: I.items[itemId].factOwner || null });
    }
  }
  const profile = I.profile.filter((p) => p.session === base);
  return { facts, profile };
}
export function getPresession(companyId, base) {
  const r = q.get('SELECT * FROM presession WHERE company_id = ? AND base = ?', companyId, base);
  return r ? { ...r, data: parse(r.data_json) } : { company_id: companyId, base, data: {}, updated_at: null };
}
export function savePresession(companyId, base, data, actor) {
  const before = getPresession(companyId, base);
  q.run(`INSERT INTO presession (company_id, base, data_json, updated_at, updated_by) VALUES (?,?,?,datetime('now'),?)
         ON CONFLICT(company_id, base) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    companyId, base, JSON.stringify(data), actor);
  audit(actor, 'presession', `${companyId}/${base}`, 'save', before.data, data);
}

// ---------- Consolidamento ----------
export function consolidationView(sessionId, companyId) {
  const session = getSession(sessionId);
  const def = baseDef(session);
  const cmp = companyComparison(sessionId, companyId);
  const pre = getPresession(companyId, session.base).data;
  const sc = ensureSessionCompany(sessionId, companyId);
  const draft = parse(sc.draft_json);
  const items = cmp.items.map((it) => {
    const levels = I.items[it.itemId].levels.map((l) => ({
      ...l,
      suggestion: l.fact ? { value: pre[l.fact.id] ?? null, maps: E.suggestFromFact(l.fact, pre[l.fact.id]) } : null,
    }));
    return { ...it, statement: I.items[it.itemId].statement, help: I.items[it.itemId].help || null, levels, draft: draft.items?.[it.itemId] || null };
  });
  const current = currentValues(companyId);
  const itemScores = Object.fromEntries(Object.keys(I.items).map((k) => [k, current[k]?.score ?? null]));
  const allDims = E.allDimensionScores(itemScores);
  const summary = {
    dims: def.dimensions.map((d) => ({ id: d, name: I.dimensions.find((x) => x.id === d).name, score: allDims[d], band: E.band(allDims[d])?.name || null })),
    coherence: E.coherence(itemScores, allDims).filter((c) => c.available),
  };
  return { session, def, comparison: cmp, items, draft, consolidatedAt: sc.consolidated_at,
    commitment: q.get('SELECT * FROM commitments WHERE session_id = ? AND company_id = ?', sessionId, companyId) || null,
    current, summary, suggestedPriorities: suggestedSessionPriorities(def, current) };
}

function suggestedSessionPriorities(def, current) {
  const itemScores = Object.fromEntries(Object.entries(current).map(([k, v]) => [k, v.score]));
  const dims = E.allDimensionScores(itemScores);
  return E.proposePriorities(itemScores, dims).filter((p) => def.dimensions.includes(p.dimension));
}

export function saveDraft(sessionId, companyId, draft) {
  ensureSessionCompany(sessionId, companyId);
  q.run('UPDATE session_company SET draft_json = ? WHERE session_id = ? AND company_id = ?', JSON.stringify(draft), sessionId, companyId);
}

// payload.items: { Q1: { level: 3 | null, sub: 'B', overrideReason: '...' } }
export function confirmConsolidation(sessionId, companyId, payload, actor) {
  const session = getSession(sessionId);
  const def = baseDef(session);
  const cmp = companyComparison(sessionId, companyId);
  const errors = [];
  if (cmp.participants === 0) return { ok: false, errors: ['Nessun partecipante registrato per questa azienda: non c\'è nulla da consolidare'] };
  const sc0 = ensureSessionCompany(sessionId, companyId);
  if (sc0.consolidated_at && !String(payload.changeReason || '').trim()) errors.push('Il consolidamento era già stato confermato: indicare il motivo della modifica');
  const rows = def.items.map((itemId) => {
    const it = cmp.items.find((x) => x.itemId === itemId);
    const p = payload.items?.[itemId] || {};
    const s = it.summary;
    let level = p.level == null || p.level === '' ? null : Number(p.level);
    if (s.valid === 0) level = null; // §6.2: nessuna visibilità → resta N.D.
    else if (level == null) errors.push(`${itemId}: scegliere il livello ufficiale`);
    else if (!Number.isInteger(level) || level < 1 || level > 5) { errors.push(`${itemId}: livello non valido`); level = null; }
    const subs = level ? E.subOptions(itemId, level) : [];
    let sub = subs.length ? (p.sub || subs[0].key) : null;
    if (sub && !subs.some((x) => x.key === sub)) errors.push(`${itemId}: sotto-opzione non valida`);
    const override = level != null && E.isOverride(s, level);
    if (override && !String(p.overrideReason || '').trim()) errors.push(`${itemId}: il livello differisce dalla mediana (${s.median}): indicare la motivazione`);
    const conf = E.confidence(s, 'consolidato');
    return { itemId, level, sub, score: level == null ? null : E.itemScore(itemId, level, sub), conf, s, override, overrideReason: override ? p.overrideReason : null };
  });
  if (errors.length) return { ok: false, errors };
  tx(() => {
    for (const r of rows) {
      const prev = q.get('SELECT * FROM consolidated WHERE company_id = ? AND item_id = ? AND is_current = 1', companyId, r.itemId);
      if (prev) q.run('UPDATE consolidated SET is_current = 0 WHERE id = ?', prev.id);
      q.run(`INSERT INTO consolidated (session_id, company_id, item_id, kind, level, sub, score, confidence, confidence_label, confidence_reason,
             median, valid_n, nd_n, range_, perspectives, override, override_reason, instrument_version, scoring_version, created_by)
             VALUES (?,?,?,'sessione',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        sessionId, companyId, r.itemId, r.level, r.sub, r.score, r.conf.code, r.conf.label, r.conf.reason,
        r.s.median, r.s.valid, r.s.nd, r.s.range, r.s.perspectives, r.override ? 1 : 0, r.overrideReason,
        session.instrument_version, session.scoring_version, actor);
      audit(actor, 'consolidated', `${companyId}/${r.itemId}`, prev ? 'reconsolidate' : 'consolidate',
        prev ? { level: prev.level, sub: prev.sub, score: prev.score } : null, { level: r.level, sub: r.sub, score: r.score },
        [r.overrideReason, sc0.consolidated_at ? `Modifica: ${payload.changeReason}` : null].filter(Boolean).join(' · ') || null);
    }
    q.run(`UPDATE session_company SET consolidated_at = datetime('now'), consolidated_by = ?, draft_json = ? WHERE session_id = ? AND company_id = ?`,
      actor, JSON.stringify(payload), sessionId, companyId);
  });
  return { ok: true };
}

export function saveCommitment(sessionId, companyId, c, actor) {
  const session = getSession(sessionId);
  if (!baseDef(session).items.includes(c.priority_item)) return { ok: false, errors: ['La priorità deve essere una capacità della sessione'] };
  const before = q.get('SELECT * FROM commitments WHERE session_id = ? AND company_id = ?', sessionId, companyId);
  q.run(`INSERT INTO commitments (session_id, company_id, priority_item, action, owner, due_date, kpi, peer_interest, peer_note, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))
         ON CONFLICT(session_id, company_id) DO UPDATE SET priority_item=excluded.priority_item, action=excluded.action, owner=excluded.owner,
         due_date=excluded.due_date, kpi=excluded.kpi, peer_interest=excluded.peer_interest, peer_note=excluded.peer_note, updated_at=excluded.updated_at`,
    sessionId, companyId, c.priority_item, c.action || '', c.owner || '', c.due_date || '', c.kpi || '', c.peer_interest ? 1 : 0, c.peer_note || '');
  audit(actor, 'commitment', `${sessionId}/${companyId}`, before ? 'update' : 'create', before, c);
  return { ok: true };
}

// Correzione di un valore consolidato da parte dell'admin: nuova riga, la precedente resta nello storico.
export function adminCorrect(companyId, itemId, level, sub, reason, actor) {
  const prev = q.get('SELECT * FROM consolidated WHERE company_id = ? AND item_id = ? AND is_current = 1', companyId, itemId);
  if (!prev) return { ok: false, errors: ['Nessun valore consolidato da correggere'] };
  if (!String(reason || '').trim()) return { ok: false, errors: ['Motivo obbligatorio'] };
  const L = level == null || level === '' ? null : Number(level);
  if (L != null && (!Number.isInteger(L) || L < 1 || L > 5)) return { ok: false, errors: ['Livello non valido: indicare un intero da 1 a 5'] };
  const subs = L ? E.subOptions(itemId, L) : [];
  if (sub && subs.length && !subs.some((x) => x.key === sub)) return { ok: false, errors: ['Sotto-opzione non valida per il livello scelto'] };
  const sk = subs.length ? (sub || subs[0].key) : null;
  const score = L == null ? null : E.itemScore(itemId, L, sk);
  tx(() => {
    q.run('UPDATE consolidated SET is_current = 0 WHERE id = ?', prev.id);
    q.run(`INSERT INTO consolidated (session_id, company_id, item_id, kind, level, sub, score, confidence, confidence_label, confidence_reason,
           median, valid_n, nd_n, range_, perspectives, override, override_reason, instrument_version, scoring_version, created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      prev.session_id, companyId, itemId, prev.kind, L, sk, score, prev.confidence, prev.confidence_label, prev.confidence_reason,
      prev.median, prev.valid_n, prev.nd_n, prev.range_, prev.perspectives, prev.override, `Correzione admin: ${reason}`,
      prev.instrument_version, prev.scoring_version, actor);
    audit(actor, 'consolidated', `${companyId}/${itemId}`, 'correct', { level: prev.level, sub: prev.sub, score: prev.score }, { level: L, sub: sk, score }, reason);
  });
  return { ok: true };
}

export function currentValues(companyId) {
  const rows = q.all('SELECT * FROM consolidated WHERE company_id = ? AND is_current = 1', companyId);
  return Object.fromEntries(rows.map((r) => [r.item_id, r]));
}

// ---------- Benchmark ----------
function eligibleCompanies({ preview = false } = {}) {
  if (preview) return q.all("SELECT * FROM companies");
  return q.all(`SELECT c.* FROM companies c JOIN consents k ON k.company_id = c.id AND k.type = 'benchmark' AND k.granted = 1 WHERE c.kind = 'REALE'`);
}

export function computeBenchmark(base, opts = {}) {
  const def = E.sessionDef(base);
  const comps = eligibleCompanies(opts);
  const items = {};
  for (const itemId of def.items) items[itemId] = [];
  const dims = {};
  for (const d of def.dimensions) dims[d] = [];
  const included = [];
  for (const c of comps) {
    const cur = currentValues(c.id);
    if (!def.items.some((i) => cur[i])) continue;
    included.push(c.id);
    const scores = {};
    for (const itemId of def.items) {
      const r = cur[itemId];
      if (r && r.level != null) items[itemId].push({ company: c.id, level: r.level, sub: r.sub, score: r.score });
      scores[itemId] = r ? r.score : null;
    }
    for (const d of def.dimensions) {
      const ds = E.dimensionScore(d, scores);
      if (ds != null) dims[d].push({ company: c.id, score: ds });
    }
  }
  return { base, items, dims, companies: included, preview: !!opts.preview };
}

export function freezeBenchmark(base, actor) {
  const b = computeBenchmark(base);
  const n = b.companies.length;
  const count = q.get('SELECT COUNT(*) n FROM benchmark_versions WHERE base = ? AND kind = ?', base, 'sessione').n;
  const label = `${E.sessionDef(base).name} · v${count + 1} · ${new Date().toISOString().slice(0, 10)}`;
  const r = q.run(`INSERT INTO benchmark_versions (base, kind, label, n_companies, data_json, instrument_version, scoring_version, created_by)
                   VALUES (?, 'sessione', ?, ?, ?, ?, ?, ?)`, base, label, n, JSON.stringify(b), I.version, S.version, actor);
  audit(actor, 'benchmark', r.lastInsertRowid, 'freeze', null, { base, label, n });
  return { id: Number(r.lastInsertRowid), label, n };
}

export function latestBenchmark(base) {
  const r = q.get('SELECT * FROM benchmark_versions WHERE base = ? ORDER BY id DESC LIMIT 1', base);
  return r ? { ...r, data: parse(r.data_json) } : null;
}

function benchSource(base, preview) {
  if (preview) return { data: computeBenchmark(base, { preview: true }), label: 'Anteprima con dati dimostrativi e di test (non ufficiale)', preview: true };
  const v = latestBenchmark(base);
  return v ? { data: v.data, label: v.label, created_at: v.created_at, preview: false } : null;
}

// ---------- Plenaria (anonima, aggregata) ----------
export function plenaria(base, { preview = false } = {}) {
  const def = E.sessionDef(base);
  const src = benchSource(base, preview);
  if (!src) return { base, def, available: false, message: 'Benchmark non ancora congelato per questa sessione.' };
  const b = src.data;
  return {
    base, def, available: true, version: src.label, preview: src.preview, nCompanies: b.companies.length,
    items: def.items.map((itemId) => ({
      itemId, title: I.items[itemId].title, stats: E.benchmarkStats(b.items[itemId]),
      dist: E.levelDistribution(itemId, b.items[itemId]),
      subLabels: Object.fromEntries(I.items[itemId].levels.filter((l) => l.sub).map((l) => [l.level, l.sub.map((s) => s.key)])),
    })),
    dims: def.dimensions.map((d) => ({
      dimension: d, name: I.dimensions.find((x) => x.id === d).name,
      stats: E.benchmarkStats(b.dims[d]), gap: E.communityGap(b.dims[d].map((r) => r.score)),
    })),
  };
}

// ---------- Report aziendale ----------
export function companyReport(companyId, { preview = false } = {}) {
  const company = q.get('SELECT * FROM companies WHERE id = ?', companyId);
  const cur = currentValues(companyId);
  const itemScores = Object.fromEntries(Object.keys(I.items).map((k) => [k, cur[k]?.score ?? null]));
  const dimScores = E.allDimensionScores(itemScores);
  const bench = {};
  for (const s of I.sessions) bench[s.id] = benchSource(s.id, preview);

  const items = Object.keys(I.items).filter((k) => cur[k]).map((k) => {
    const r = cur[k];
    const sess = I.sessions.find((s) => s.items.includes(k));
    const src = bench[sess.id];
    const stats = src ? E.benchmarkStats(src.data.items[k] || [], companyId) : null;
    const lvl = r.level != null ? E.levelDef(k, r.level) : null;
    return {
      itemId: k, title: I.items[k].title, dimension: I.items[k].dimension, session: sess.id,
      level: r.level, sub: r.sub, score: r.score, confidence: r.confidence_label, confidenceReason: r.confidence_reason,
      descriptor: lvl?.descriptor || null, subText: lvl?.sub?.find((s) => s.key === r.sub)?.text || null, valoriale: !!lvl?.valoriale,
      override: !!r.override, overrideReason: r.override_reason, validN: r.valid_n, ndN: r.nd_n, range: r.range_, median: r.median,
      when: r.created_at, kind: r.kind, bench: stats,
    };
  });
  const dims = I.dimensions.map((d) => {
    const src = bench[d.session];
    const stats = src ? E.benchmarkStats(src.data.dims[d.id] || [], companyId) : null;
    const sc = dimScores[d.id];
    return { id: d.id, name: d.name, session: d.session, score: sc, band: E.band(sc)?.name || null,
      bench: stats, quadrant: sc != null && stats?.available ? E.whereQuadrant(sc, stats.median) : null };
  });
  const peerMedians = Object.fromEntries(dims.map((d) => [d.id, d.bench?.available ? d.bench.median : null]));
  const coh = E.coherence(itemScores, dimScores);
  const sessionsDone = q.all(`SELECT s.*, sc.consolidated_at, sc.report_released_at, sc.leader_call_note FROM session_company sc JOIN sessions s ON s.id = sc.session_id
                              WHERE sc.company_id = ? AND sc.consolidated_at IS NOT NULL ORDER BY s.date`, companyId);
  const pairs = sessionsDone.map((s) => ({ session: s, pairs: companyComparison(s.id, companyId).pairs, participants: companyComparison(s.id, companyId).participants,
    functions: companyComparison(s.id, companyId).functions }));
  const profile = {};
  for (const s of I.sessions) {
    const pre = getPresession(companyId, s.id);
    for (const p of I.profile.filter((x) => x.session === s.id)) if (pre.data[p.id] != null && pre.data[p.id] !== '') profile[p.id] = { q: p.q, value: pre.data[p.id], session: s.id };
  }
  const commitments = q.all(`SELECT c.*, s.title session_title, s.base FROM commitments c JOIN sessions s ON s.id = c.session_id WHERE c.company_id = ? ORDER BY s.date`, companyId);
  return {
    company, generatedAt: new Date().toISOString(), preview, instrumentVersion: I.version, scoringVersion: S.version,
    benchVersions: Object.fromEntries(Object.entries(bench).filter(([, v]) => v).map(([k, v]) => [k, v.label])),
    items, dims, dimsComplete: dims.filter((d) => d.score != null).length, overall: E.overallIndicator(dimScores),
    coherence: coh.filter((c) => c.available), coherencePending: coh.filter((c) => !c.available).map((c) => c.id),
    usoDirezione: profile.P_USO && cur.Q1 && cur.Q1.level != null ? { uso: Number(profile.P_USO.value), q1: cur.Q1.level, q1Score: cur.Q1.score } : null,
    mapComplete: dims.every((d) => d.score != null),
    priorities: E.proposePriorities(itemScores, dimScores, peerMedians),
    pairs, profile, commitments, sessions: sessionsDone,
  };
}

// ---------- Report consegnati: copia congelata al rilascio (§9 "i report consegnati non cambiano", §12, §17) ----------
export function releaseReport(sessionId, companyId, actor) {
  const session = getSession(sessionId);
  ensureSessionCompany(sessionId, companyId);
  const R = companyReport(companyId);
  const version = (q.get('SELECT MAX(version) v FROM report_snapshots WHERE session_id = ? AND company_id = ?', sessionId, companyId).v || 0) + 1;
  R.snapshot = { version, sessionId: Number(sessionId), sessionTitle: session.title, releasedAt: new Date().toISOString() };
  const r = q.run('INSERT INTO report_snapshots (session_id, company_id, version, data_json, created_by) VALUES (?,?,?,?,?)', sessionId, companyId, version, JSON.stringify(R), actor);
  q.run("UPDATE session_company SET report_released_at = datetime('now') WHERE session_id = ? AND company_id = ?", sessionId, companyId);
  audit(actor, 'report', `${sessionId}/${companyId}`, version > 1 ? 'release_new_version' : 'release', null, { version });
  return { id: Number(r.lastInsertRowid), version };
}
export function listSnapshots(companyId) {
  return q.all(`SELECT r.id, r.session_id, r.version, r.created_at, s.title session_title FROM report_snapshots r JOIN sessions s ON s.id = r.session_id
                WHERE r.company_id = ? ORDER BY r.id DESC`, companyId);
}
export function getSnapshot(companyId, snapId = null) {
  const r = snapId
    ? q.get('SELECT * FROM report_snapshots WHERE id = ? AND company_id = ?', snapId, companyId)
    : q.get('SELECT * FROM report_snapshots WHERE company_id = ? ORDER BY id DESC LIMIT 1', companyId);
  return r ? JSON.parse(r.data_json) : null;
}
export function setCommitmentStatus(id, status, note, actor) {
  const ok = ['aperto', 'avviato', 'completato', 'non avviato', 'sospeso'];
  if (!ok.includes(status)) return { ok: false, errors: ['Stato non valido'] };
  const before = q.get('SELECT * FROM commitments WHERE id = ?', id);
  if (!before) return { ok: false, errors: ['Commitment non trovato'] };
  q.run("UPDATE commitments SET status = ?, status_note = ?, status_updated_at = datetime('now') WHERE id = ?", status, note || '', id);
  audit(actor, 'commitment', id, 'status', { status: before.status, note: before.status_note }, { status, note });
  return { ok: true };
}
