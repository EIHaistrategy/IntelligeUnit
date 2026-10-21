// Allineamento finale (§14.1): conferma o modifica delle 16 capacità senza toccare i valori delle sessioni,
// storico conservato, evidenza obbligatoria per modificare, tre priorità finali, report unificato congelato.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aito-align-test-'));
process.env.AITO_DATA_DIR = dir;
process.env.ADMIN_PASSWORD = 'testpass123';
const { q } = await import('../server/db.js');
const D = await import('../server/demo.js');
const L = await import('../server/logic.js');
const AL = await import('../server/alignment.js');
const { app } = await import('../server/index.js');

let server, base, cookie, st, g, token;
const H = () => ({ 'Content-Type': 'application/json', Origin: base });
before(async () => {
  server = app.listen(0); await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const r = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: H(), body: JSON.stringify({ password: 'testpass123' }) });
  cookie = r.headers.get('set-cookie').split(';')[0];
  // quattro sessioni DEMO chiuse, allineamento non ancora fatto: si parte dall'ultimo passo di Scalare
  D.seedDemo();
  while (!(st = D.tourState()).done && !(st.s === 3 && st.k === 6)) D.advanceDemo();
  g = st.company.id; token = st.referentToken;
});
after(() => { server?.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const sessionValues = () => q.all('SELECT item_id, level, sub, score FROM consolidated WHERE company_id = ? AND is_current = 1 ORDER BY item_id', g);
const put = (url, body) => fetch(`${base}${url}`, { method: 'PUT', headers: H(), body: JSON.stringify(body) });

test('chiuso: il referente vede lo stato ma non può scrivere', async () => {
  const r = await put(`/api/r/${token}/alignment/item/Q1`, { action: 'conferma' });
  assert.equal(r.status, 403);
  const s = await (await fetch(`${base}/api/r/${token}/alignment`)).json();
  assert.equal(s.open, false); assert.equal(s.total, 16);
});

test('modifica senza evidenza rifiutata; con evidenza crea una riga nuova e i valori della sessione restano', async () => {
  AL.setOpen(1, true, 'test');
  const before0 = sessionValues();
  const b = q.get('SELECT level FROM consolidated WHERE company_id = ? AND item_id = ? AND is_current = 1', g, 'Q2').level;
  let r = await put(`/api/r/${token}/alignment/item/Q2`, { action: 'modifica', level: b + 1 });
  assert.equal(r.status, 400);
  r = await put(`/api/r/${token}/alignment/item/Q2`, { action: 'modifica', level: b + 1, evidence: 'Mandato approvato dal CdA' });
  assert.equal(r.status, 200);
  const s = await r.json();
  const q2 = s.items.find((i) => i.itemId === 'Q2');
  assert.equal(q2.current.level, b + 1);
  assert.ok(q2.shift > 0, 'lo spostamento rispetto alla sessione è positivo');
  // seconda scelta sullo stesso item: la precedente resta nello storico
  await put(`/api/r/${token}/alignment/item/Q2`, { action: 'conferma' });
  assert.equal(q.get("SELECT COUNT(*) n FROM alignment_items WHERE company_id = ? AND item_id = 'Q2'", g).n, 2);
  assert.equal(q.get("SELECT COUNT(*) n FROM alignment_items WHERE company_id = ? AND item_id = 'Q2' AND is_current = 1", g).n, 1);
  assert.deepEqual(sessionValues(), before0, 'nessun valore della sessione è cambiato');
});

test('conferma: servono tutte le capacità e tre priorità; poi è bloccata', async () => {
  let r = await fetch(`${base}/api/r/${token}/alignment/confirm`, { method: 'POST', headers: H(), body: '{}' });
  assert.equal(r.status, 400);
  for (const it of AL.alignmentState(g, 1).items.filter((i) => !i.current)) await put(`/api/r/${token}/alignment/item/${it.itemId}`, { action: 'conferma' });
  await put(`/api/r/${token}/alignment/item/Q13`, { action: 'modifica', level: 1, evidence: 'Percorsi per ruolo solo in IT' });
  r = await put(`/api/r/${token}/alignment/priorities`, { priorities: ['F', 'H', 'G', 'A'], note: 'prova' });
  assert.deepEqual((await r.json()).priorities, ['F', 'H', 'G'], 'al massimo tre');
  r = await fetch(`${base}/api/r/${token}/alignment/confirm`, { method: 'POST', headers: H(), body: '{}' });
  assert.equal(r.status, 200);
  r = await put(`/api/r/${token}/alignment/item/Q1`, { action: 'conferma' });
  assert.equal(r.status, 400, 'dopo la conferma non si modifica più senza riapertura');
});

test('report unificato: valori allineati, spostamenti, priorità finali; congelato al rilascio', async () => {
  const C = { ...H(), Cookie: `${cookie}; aito_mode=prova` };
  const rel = await (await fetch(`${base}/api/admin/alignment/${g}/release`, { method: 'POST', headers: C, body: '{}' })).json();
  assert.equal(rel.version, 1);
  const R = L.getSnapshot(g, rel.id);
  assert.equal(R.final, true);
  assert.equal(R.finalPriorities.map((p) => p.id).join(','), 'F,H,G');
  const q13 = R.alignment.items.find((i) => i.itemId === 'Q13');
  assert.ok(q13.shift < 0 && q13.evidence);
  assert.equal(R.items.find((i) => i.itemId === 'Q13').level, 1, 'nel report unificato vale il valore allineato');
  // il report di sessione resta calcolato sui valori della sessione
  assert.notEqual(L.companyReport(g).items.find((i) => i.itemId === 'Q13').level, 1);
  const list = L.listSnapshots(g);
  assert.equal(list[0].kind, 'finale'); assert.equal(list[0].version, 1);
});

test('isolamento: in Produzione la vista d\'insieme non vede le aziende DEMO e l\'apertura è separata', async () => {
  const prod = await (await fetch(`${base}/api/admin/alignment`, { headers: { Cookie: cookie } })).json();
  assert.equal(prod.companies.length, 0); assert.equal(prod.open, false);
  const demo = await (await fetch(`${base}/api/admin/alignment`, { headers: { Cookie: `${cookie}; aito_mode=prova` } })).json();
  assert.ok(demo.companies.some((c) => c.id === g && c.confirmedAt));
  const r = await fetch(`${base}/api/admin/alignment/${g}/reopen`, { method: 'POST', headers: { ...H(), Cookie: cookie }, body: JSON.stringify({ reason: 'x' }) });
  assert.equal(r.status, 404, 'dalla Produzione un\'azienda DEMO non si tocca');
});
