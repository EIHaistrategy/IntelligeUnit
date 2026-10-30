// Allineamento finale (§14.1, settembre 2027): l'azienda rivede le 16 capacità misurate nelle quattro sessioni,
// conferma o modifica ciascuna con un'evidenza e sceglie le tre priorità finali.
// I valori delle sessioni non si toccano: l'allineamento sta in tabelle proprie e mostra lo spostamento rispetto alla rilevazione in sessione.
import { q, tx, audit, getSetting, setSetting } from './db.js';
import * as E from './engine/index.js';

const I = E.INSTRUMENT;
const ITEMS = Object.keys(I.items);
const sessOf = (itemId) => I.sessions.find((s) => s.items.includes(itemId));
// le 12 capacità misurate prima di luglio: la nota chiede di riallinearle; Scalare (luglio) si può comunque correggere
export const preJuly = (itemId) => sessOf(itemId)?.id !== 'SCALE';
// Perché cambia il livello: la situazione è cambiata dopo la sessione (evoluzione) oppure la risposta di allora
// era da rivedere (revisione). Per le conferme: l'azienda è soddisfatta o sperava in un miglioramento.
export const MOTIVES = { evoluzione: 'Cambiamento reale', revisione: 'Revisione della risposta' };
export const JUDGMENTS = { soddisfatti: 'Soddisfatti', speravamo: 'Speravamo in un miglioramento' };

const openKey = (seeded) => `alignment_open_${seeded ? 'demo' : 'prod'}`;
export const isOpen = (seeded) => getSetting(openKey(seeded)) === '1';
export function setOpen(seeded, open, actor, reason) {
  setSetting(openKey(seeded), open ? '1' : '0');
  audit(actor, 'alignment', seeded ? 'demo' : 'prod', open ? 'open' : 'close', null, { open }, reason || null);
}

const sessionRows = (companyId) => Object.fromEntries(q.all(`SELECT c.*, s.title session_title FROM consolidated c JOIN sessions s ON s.id = c.session_id
  WHERE c.company_id = ? AND c.is_current = 1`, companyId).map((r) => [r.item_id, r]));
const alignRows = (companyId) => Object.fromEntries(q.all('SELECT * FROM alignment_items WHERE company_id = ? AND is_current = 1', companyId).map((r) => [r.item_id, r]));
const header = (companyId) => q.get('SELECT * FROM alignment WHERE company_id = ?', companyId) || null;
const parse = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };

// Punteggi di dimensione con una serie di valori per item
const dimScores = (vals) => E.allDimensionScores(Object.fromEntries(ITEMS.map((k) => [k, vals[k] ?? null])));

export function alignmentState(companyId, seeded) {
  const base = sessionRows(companyId), al = alignRows(companyId), h = header(companyId);
  const items = ITEMS.map((k) => {
    const b = base[k], a = al[k], s = sessOf(k);
    const lv = (l) => (l == null ? null : E.levelDef(k, l));
    // "confermo" vale sempre il valore corrente della sessione: se ELIS lo corregge dopo, la conferma lo segue
    const cur = a && (a.action === 'conferma' && b ? { ...a, level: b.level, sub: b.sub, score: b.score } : a);
    return {
      itemId: k, title: I.items[k].title, statement: I.items[k].statement, dimension: I.items[k].dimension, session: s.id, sessionName: s.name, sessionDate: s.date, preJuly: preJuly(k),
      levels: I.items[k].levels.map((l) => ({ level: l.level, descriptor: l.descriptor, sub: l.sub || [] })),
      base: b ? { level: b.level, sub: b.sub, score: b.score, sessionTitle: b.session_title, descriptor: lv(b.level)?.descriptor || null } : null,
      current: cur ? { action: cur.action, level: cur.level, sub: cur.sub, score: cur.score, evidence: cur.evidence, by: cur.created_by, at: cur.created_at,
        motive: cur.action === 'modifica' ? cur.motive || null : null, judgment: cur.action === 'conferma' ? cur.judgment || null : null,
        // la sessione è stata corretta dopo la modifica: lo spostamento si calcola sul valore corrente, ma va ricontrollato
        baseChanged: cur.action === 'modifica' && b != null && cur.base_score !== b.score } : null,
      shift: cur && b && cur.score != null && b.score != null ? Math.round((cur.score - b.score) * 10) / 10 : null,
    };
  });
  const before = dimScores(Object.fromEntries(items.map((i) => [i.itemId, i.base?.score])));
  const after = dimScores(Object.fromEntries(items.map((i) => [i.itemId, i.current ? i.current.score : i.base?.score])));
  const dims = I.dimensions.map((d) => ({ id: d.id, name: d.name, before: before[d.id], after: after[d.id],
    shift: before[d.id] != null && after[d.id] != null ? Math.round((after[d.id] - before[d.id]) * 10) / 10 : null }));
  const toReview = items.filter((i) => i.base);
  const suggested = E.proposePriorities(Object.fromEntries(items.map((i) => [i.itemId, i.current ? i.current.score : i.base?.score ?? null])), after)
    .slice(0, 3).map((p) => p.dimension);
  return {
    open: isOpen(seeded), confirmedAt: h?.confirmed_at || null,
    released: !!q.get("SELECT 1 FROM report_snapshots WHERE company_id = ? AND kind = 'finale'", companyId), confirmedBy: h?.confirmed_by || null,
    priorities: parse(h?.priorities_json, []), prioritiesNote: h?.priorities_note || '', suggestedPriorities: suggested,
    items, dims, reviewed: toReview.filter((i) => i.current).length, total: toReview.length,
    changed: items.filter((i) => i.current?.action === 'modifica').length,
    overallBefore: E.overallIndicator(before), overallAfter: E.overallIndicator(after),
  };
}

// Conferma o modifica di una capacità: riga nuova, la precedente resta nello storico (regola 1)
export function saveItem(companyId, itemId, body, actor) {
  if (!ITEMS.includes(itemId)) return { ok: false, errors: ['Capacità non valida'] };
  const h = header(companyId);
  if (h?.confirmed_at) return { ok: false, errors: ['L\'allineamento è già confermato: per modificarlo chiedi a ELIS di riaprirlo'] };
  const b = sessionRows(companyId)[itemId];
  let action = body.action === 'modifica' ? 'modifica' : 'conferma';
  let level = action === 'conferma' ? b?.level ?? null : Number(body.level);
  let sub = action === 'conferma' ? b?.sub ?? null : (body.sub || null);
  if (action === 'conferma' && !b) return { ok: false, errors: [`${itemId}: nessun valore da confermare, scegli il livello`] };
  if (action === 'modifica') {
    if (!Number.isInteger(level) || level < 1 || level > 5) return { ok: false, errors: [`${itemId}: livello non valido`] };
    const subs = E.subOptions(itemId, level);
    if (subs.length) { sub = sub || subs[0].key; if (!subs.some((x) => x.key === sub)) return { ok: false, errors: [`${itemId}: sotto-opzione non valida`] }; } else sub = null;
    // uguale al valore della sessione: è una conferma
    if (b && b.level === level && (b.sub || null) === sub) action = 'conferma';
  }
  const evidence = String(body.evidence || '').trim().slice(0, 2000);
  if (action === 'modifica' && !evidence) return { ok: false, errors: [`${itemId}: per modificare il livello indica l'evidenza (che cosa è cambiato, con un fatto osservabile)`] };
  const motive = action === 'modifica' && MOTIVES[body.motive] ? body.motive : null;
  if (action === 'modifica' && !motive) return { ok: false, errors: [`${itemId}: indica perché cambia il livello: cambiamento reale dopo la sessione o revisione della risposta di allora`] };
  const judgment = action === 'conferma' && JUDGMENTS[body.judgment] ? body.judgment : null;
  const score = level == null ? null : E.itemScore(itemId, level, sub);
  tx(() => {
    const prev = q.get('SELECT * FROM alignment_items WHERE company_id = ? AND item_id = ? AND is_current = 1', companyId, itemId);
    if (prev) q.run('UPDATE alignment_items SET is_current = 0 WHERE id = ?', prev.id);
    q.run(`INSERT INTO alignment_items (company_id, item_id, action, level, sub, score, base_level, base_sub, base_score, base_session_id, evidence, motive, judgment, created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, companyId, itemId, action, level, sub, score, b?.level ?? null, b?.sub ?? null, b?.score ?? null, b?.session_id ?? null, evidence, motive, judgment, actor);
    q.run(`INSERT INTO alignment (company_id, updated_at) VALUES (?, datetime('now')) ON CONFLICT(company_id) DO UPDATE SET updated_at = excluded.updated_at`, companyId);
    audit(actor, 'alignment_item', `${companyId}/${itemId}`, action,
      prev ? { level: prev.level, sub: prev.sub, score: prev.score } : (b ? { level: b.level, sub: b.sub, score: b.score, fonte: 'sessione' } : null),
      { level, sub, score, ...(motive ? { motivo: MOTIVES[motive] } : {}), ...(judgment ? { giudizio: JUDGMENTS[judgment] } : {}) }, evidence || null);
  });
  return { ok: true };
}

export function savePriorities(companyId, list, note, actor) {
  const h = header(companyId);
  if (h?.confirmed_at) return { ok: false, errors: ['L\'allineamento è già confermato'] };
  const ids = [...new Set((Array.isArray(list) ? list : []).filter((x) => I.dimensions.some((d) => d.id === x)))].slice(0, 3);
  note = String(note || '').trim().slice(0, 2000);
  q.run('UPDATE alignment_priorities SET is_current = 0 WHERE company_id = ? AND is_current = 1', companyId);
  q.run('INSERT INTO alignment_priorities (company_id, priorities_json, note, created_by) VALUES (?,?,?,?)', companyId, JSON.stringify(ids), note, actor);
  q.run(`INSERT INTO alignment (company_id, priorities_json, priorities_note, updated_at) VALUES (?,?,?,datetime('now'))
         ON CONFLICT(company_id) DO UPDATE SET priorities_json = excluded.priorities_json, priorities_note = excluded.priorities_note, updated_at = excluded.updated_at`,
    companyId, JSON.stringify(ids), note);
  audit(actor, 'alignment', companyId, 'priorities', h ? { priorities: parse(h.priorities_json, []) } : null, { priorities: ids }, note || null);
  return { ok: true };
}

export function confirm(companyId, seeded, actor) {
  const st = alignmentState(companyId, seeded);
  if (st.confirmedAt) return { ok: false, errors: ['L\'allineamento è già confermato'] };
  const missing = st.items.filter((i) => i.base && !i.current).map((i) => i.itemId);
  const errors = [];
  if (missing.length) errors.push(`Da rivedere: ${missing.join(', ')}`);
  if (st.priorities.length !== 3) errors.push('Scegli le tre priorità finali');
  if (errors.length) return { ok: false, errors };
  q.run("UPDATE alignment SET confirmed_at = datetime('now'), confirmed_by = ? WHERE company_id = ?", actor, companyId);
  audit(actor, 'alignment', companyId, 'confirm', null, { changed: st.changed, priorities: st.priorities });
  return { ok: true };
}

export function reopen(companyId, reason, actor) {
  if (!String(reason || '').trim()) return { ok: false, errors: ['Motivo obbligatorio'] };
  const h = header(companyId);
  if (!h?.confirmed_at) return { ok: false, errors: ['L\'allineamento non è confermato'] };
  q.run('UPDATE alignment SET confirmed_at = NULL, confirmed_by = NULL WHERE company_id = ?', companyId);
  audit(actor, 'alignment', companyId, 'reopen', { confirmedAt: h.confirmed_at }, null, String(reason).slice(0, 1000));
  return { ok: true };
}

// Valori allineati, per il report unificato: sopra i valori della sessione, senza modificarli
export function alignedOverlay(companyId) { return Object.fromEntries(Object.entries(alignRows(companyId)).filter(([, a]) => a.action === 'modifica')); }
export const headerOf = header;

// Vista d'insieme per il team ELIS: avanzamento per azienda e spostamenti medi per dimensione
export function overview(seeded) {
  const comps = q.all('SELECT id, name, kind FROM companies WHERE seeded = ? ORDER BY name', seeded ? 1 : 0);
  const rows = comps.map((c) => {
    const st = alignmentState(c.id, seeded);
    const rel = q.get("SELECT id, version, created_at FROM report_snapshots WHERE company_id = ? AND kind = 'finale' ORDER BY id DESC LIMIT 1", c.id);
    return { id: c.id, name: c.name, kind: c.kind, reviewed: st.reviewed, total: st.total, changed: st.changed, confirmedAt: st.confirmedAt,
      priorities: st.priorities, dims: st.dims, up: st.items.filter((i) => i.shift > 0).length, down: st.items.filter((i) => i.shift < 0).length, released: rel || null,
      items: st.items };
  }).filter((r) => r.total > 0);
  // le aziende TEST (es. l'azienda amica) restano nell'elenco ma non entrano negli aggregati (regola 7)
  const agg = rows.filter((r) => r.kind !== 'TEST');
  const dims = I.dimensions.map((d) => {
    const pairs = agg.filter((r) => r.reviewed).map((r) => r.dims.find((x) => x.id === d.id)).filter((x) => x.before != null && x.after != null);
    const avg = (k) => (pairs.length ? Math.round((pairs.reduce((s, x) => s + x[k], 0) / pairs.length) * 10) / 10 : null);
    return { id: d.id, name: d.name, n: pairs.length, before: avg('before'), after: avg('after'), up: pairs.filter((x) => x.shift > 0).length, down: pairs.filter((x) => x.shift < 0).length,
      shift: pairs.length ? Math.round((avg('after') - avg('before')) * 10) / 10 : null };
  });
  // per sessione: quanto si è spostato e perché. Con più mesi tra sessione e allineamento ci si aspettano più cambiamenti reali;
  // molte revisioni sulla stessa capacità indicano un descrittore da chiarire nella versione successiva dello strumento
  const reviewedItems = agg.flatMap((r) => r.items.filter((i) => i.current && i.base));
  const sessions = I.sessions.map((s) => {
    const its = reviewedItems.filter((i) => i.session === s.id);
    const n = (f) => its.filter(f).length;
    const avg = (arr) => (arr.length ? Math.round((arr.reduce((a, i) => a + i.shift, 0) / arr.length) * 10) / 10 : null);
    return { id: s.id, name: s.name, date: s.date, reviewed: its.length,
      evoluzioneUp: n((i) => i.current.motive === 'evoluzione' && i.shift > 0), evoluzioneDown: n((i) => i.current.motive === 'evoluzione' && i.shift < 0),
      revisioneUp: n((i) => i.current.motive === 'revisione' && i.shift > 0), revisioneDown: n((i) => i.current.motive === 'revisione' && i.shift < 0),
      senzaMotivo: n((i) => i.current.action === 'modifica' && !i.current.motive),
      confermeSoddisfatti: n((i) => i.current.action === 'conferma' && i.current.judgment === 'soddisfatti'),
      confermeSperavamo: n((i) => i.current.action === 'conferma' && i.current.judgment === 'speravamo'),
      confermeSenzaGiudizio: n((i) => i.current.action === 'conferma' && !i.current.judgment),
      shiftEvoluzione: avg(its.filter((i) => i.current.motive === 'evoluzione')), shiftRevisione: avg(its.filter((i) => i.current.motive === 'revisione')) };
  });
  const revisions = {};
  for (const i of reviewedItems.filter((x) => x.current.motive === 'revisione')) revisions[i.itemId] = (revisions[i.itemId] || 0) + 1;
  const prio = {};
  for (const r of agg.filter((x) => x.confirmedAt)) r.priorities.forEach((p) => { prio[p] = (prio[p] || 0) + 1; });
  return { open: isOpen(seeded), companies: rows.map(({ items, ...r }) => r), dims, sessions, revisions: Object.entries(revisions).sort((a, b) => b[1] - a[1]).map(([itemId, n]) => ({ itemId, title: I.items[itemId].title, n })), priorityCount: prio,
    confirmed: rows.filter((r) => r.confirmedAt).length, started: rows.filter((r) => r.reviewed).length, testExcluded: rows.length - agg.length };
}
