// Export Excel dei dati di produzione (i dati dimostrativi sono esclusi) (documentazione e backup: la fonte operativa resta la piattaforma, §15).
import ExcelJS from 'exceljs';
import { q } from './db.js';
import { INSTRUMENT as I } from './engine/index.js';

function sheet(wb, name, rows) {
  const ws = wb.addWorksheet(name);
  if (!rows.length) { ws.addRow(['(nessun dato)']); return; }
  const cols = Object.keys(rows[0]);
  ws.columns = cols.map((c) => ({ header: c, key: c, width: Math.min(60, Math.max(10, c.length + 2)) }));
  rows.forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF005172' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

export async function buildExport() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AITO Map';
  sheet(wb, 'Aziende', q.all('SELECT id, name AS azienda, perimeter AS perimetro, sector AS settore, kind AS tipo, join_code AS codice, created_at FROM companies WHERE seeded = 0 ORDER BY id'));
  sheet(wb, 'Persone iscritte', q.all('SELECT r.id, c.name AS azienda, r.name AS nome, r.func AS funzione, r.created_at FROM roster r JOIN companies c ON c.id = r.company_id WHERE c.seeded = 0 ORDER BY c.name, r.name'));
  sheet(wb, 'Consensi', q.all('SELECT c.name AS azienda, k.type AS consenso, k.granted AS concesso, k.updated_at FROM consents k JOIN companies c ON c.id = k.company_id WHERE c.seeded = 0'));
  sheet(wb, 'Sessioni', q.all('SELECT id, base, title AS titolo, date AS data, mode AS modalita, channel AS canale, phase AS fase, instrument_version, scoring_version FROM sessions WHERE seeded = 0'));
  sheet(wb, 'Partecipanti', q.all(`SELECT p.id, s.title AS sessione, c.name AS azienda, p.name AS nome, p.func AS funzione, p.email, p.submitted_at AS inviato, p.removed AS rimosso
    FROM participants p JOIN sessions s ON s.id = p.session_id JOIN companies c ON c.id = p.company_id WHERE c.seeded = 0 ORDER BY p.id`));
  sheet(wb, 'Risposte individuali', q.all(`SELECT s.title AS sessione, c.name AS azienda, p.id AS partecipante, p.func AS funzione, a.item_id AS item,
    COALESCE(CAST(a.level AS TEXT), 'N.D.') AS livello, a.updated_at AS timestamp
    FROM answers a JOIN participants p ON p.id = a.participant_id JOIN sessions s ON s.id = p.session_id JOIN companies c ON c.id = p.company_id
    WHERE p.removed = 0 AND c.seeded = 0 ORDER BY s.id, c.name, p.id, a.item_id`));
  sheet(wb, 'Confronti a coppie', q.all(`SELECT s.title AS sessione, c.name AS azienda, p.id AS partecipante, x.item_a, x.item_b, x.answer AS risposta
    FROM pair_answers x JOIN participants p ON p.id = x.participant_id JOIN sessions s ON s.id = p.session_id JOIN companies c ON c.id = p.company_id WHERE p.removed = 0 AND c.seeded = 0`));
  sheet(wb, 'Consolidato (storico)', q.all(`SELECT k.id, s.title AS sessione, c.name AS azienda, k.item_id AS item, k.kind AS tipo,
    COALESCE(CAST(k.level AS TEXT), 'N.D.') AS livello, k.sub AS sotto_opzione, ROUND(k.score, 2) AS score, k.confidence_label AS confidence,
    k.median AS mediana, k.valid_n AS risposte_valide, k.nd_n AS nd, k.range_ AS range, k.override, k.override_reason AS motivo_override,
    k.is_current AS corrente, k.instrument_version, k.scoring_version, k.created_at, k.created_by
    FROM consolidated k JOIN sessions s ON s.id = k.session_id JOIN companies c ON c.id = k.company_id WHERE c.seeded = 0 ORDER BY c.name, k.item_id, k.id`));
  sheet(wb, 'Commitment', q.all(`SELECT s.title AS sessione, c.name AS azienda, m.priority_item AS priorita, m.action AS azione, m.owner, m.due_date AS scadenza,
    m.kpi, m.peer_interest AS interesse_peer, m.peer_note, m.status AS stato, m.updated_at
    FROM commitments m JOIN sessions s ON s.id = m.session_id JOIN companies c ON c.id = m.company_id WHERE c.seeded = 0`));
  const pre = q.all('SELECT p.*, c.name FROM presession p JOIN companies c ON c.id = p.company_id WHERE c.seeded = 0');
  const preRows = [];
  for (const p of pre) {
    const d = JSON.parse(p.data_json || '{}');
    for (const [k, v] of Object.entries(d)) preRows.push({ azienda: p.name, sessione: p.base, campo: k, valore: Array.isArray(v) ? v.join('; ') : v, aggiornato: p.updated_at, da: p.updated_by });
  }
  sheet(wb, 'Scheda pre-sessione', preRows);
  sheet(wb, 'Benchmark congelati', q.all('SELECT id, base, kind AS tipo, label AS versione, n_companies AS n_aziende, instrument_version, scoring_version, created_at FROM benchmark_versions'));
  sheet(wb, 'Audit', q.all('SELECT id, ts, actor, entity, entity_id, action, before_json, after_json, reason FROM audit ORDER BY id'));
  sheet(wb, 'Strumento', Object.entries(I.items).flatMap(([id, it]) => it.levels.flatMap((l) => (l.sub || [{ key: '', text: '' }]).map((s) => ({
    item: id, titolo: it.title, dimensione: it.dimension, livello: l.level, descrittore: l.descriptor, sotto_opzione: s.key, testo: s.text, valoriale: l.valoriale ? 'sì' : '' })))));
  return wb.xlsx.writeBuffer();
}
