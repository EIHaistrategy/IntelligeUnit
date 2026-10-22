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
process.env.SESSION_SECRET = 'segreto-di-prova-per-i-test';
delete process.env.DEMO_PASSWORD;
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

test('una capacità confermata segue la correzione della sessione; una modificata segnala che va ricontrollata', () => {
  AL.reopen(g, 'prova correzione', 'test');
  const before = q.get("SELECT level FROM consolidated WHERE company_id = ? AND item_id = 'Q1' AND is_current = 1", g).level;
  const nl = before === 1 ? 2 : before - 1;
  L.adminCorrect(g, 'Q1', nl, null, 'correzione ELIS', 'admin');
  const s = AL.alignmentState(g, 1);
  const q1 = s.items.find((i) => i.itemId === 'Q1');
  assert.equal(q1.current.action, 'conferma'); assert.equal(q1.current.level, nl); assert.equal(q1.shift, 0);
  L.adminCorrect(g, 'Q13', 2, null, 'correzione ELIS', 'admin');
  assert.equal(AL.alignmentState(g, 1).items.find((i) => i.itemId === 'Q13').current.baseChanged, true);
  // nel report unificato le capacità confermate valgono quanto la sessione corretta
  assert.equal(L.companyReport(g, { final: true }).items.find((i) => i.itemId === 'Q1').level, nl);
});

test('dopo il report unificato: la versione di sessione resta progressiva e lo zip prende il report di sessione', async () => {
  AL.confirm(g, 1, 'test');
  L.releaseFinalReport(g, 'test');
  const sc = D.tourState().sessions[3];
  const r = L.releaseReport(sc.id, g, 'test');
  assert.equal(r.version, 2, 'seconda versione del report di Scalare');
  const list = L.listSnapshots(g);
  assert.deepEqual(list.filter((x) => x.kind === 'finale').map((x) => x.version).sort(), [1, 2]);
  const z = await fetch(`${base}/api/admin/sessions/${sc.id}/pdfs.zip`, { headers: { Cookie: `${cookie}; aito_mode=prova` } });
  assert.equal(z.status, 200);
  const top = q.get("SELECT kind FROM report_snapshots WHERE session_id = ? AND company_id = ? AND kind = 'sessione' ORDER BY version DESC LIMIT 1", sc.id, g);
  assert.equal(top.kind, 'sessione');
});

test('facilitatore: niente accesso all\'allineamento di un\'azienda dell\'altro ambiente; aggregati senza aziende TEST', async () => {
  const r = await fetch(`${base}/api/f/${g}/alignment`, { headers: { Cookie: cookie } });
  assert.equal(r.status, 404);
  const o = AL.overview(1);
  assert.ok(o.testExcluded >= 1, 'l\'azienda del percorso (TEST) resta fuori dalle medie');
  const r2 = await fetch(`${base}/api/admin/alignment/open`, { method: 'POST', headers: { ...H(), Cookie: cookie }, body: JSON.stringify({ open: true, env: 1 }) });
  assert.equal(r2.status, 409, 'pagina caricata in DEMO, cookie di Produzione');
});

test('nessuna versione identica del report unificato; protezioni del server', async () => {
  // subito dopo un rilascio, un secondo rilascio senza cambiamenti non crea un'altra versione
  const again = L.releaseFinalReport(g, 'test');
  assert.equal(again.ok, false);
  // azioni su dati DEMO con la console in Produzione: rifiutate (409)
  const ref = q.get('SELECT id FROM referents WHERE company_id = ?', g).id;
  const com = q.get('SELECT id FROM commitments WHERE company_id = ?', g).id;
  const P = { ...H(), Cookie: cookie };
  assert.equal((await fetch(`${base}/api/admin/referents/${ref}/regenerate`, { method: 'POST', headers: P, body: JSON.stringify({ reason: 'x' }) })).status, 409);
  assert.equal((await fetch(`${base}/api/admin/commitments/${com}/status`, { method: 'PUT', headers: P, body: JSON.stringify({ status: 'avviato' }) })).status, 409);
  // richieste che modificano dati senza Origin e senza Sec-Fetch-Site: rifiutate
  assert.equal((await fetch(`${base}/api/admin/companies`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ name: 'X' }) })).status, 403);
  // sessione inesistente in plenaria: 404, non 500
  assert.equal((await fetch(`${base}/api/admin/plenaria/XXX`, { headers: { Cookie: cookie } })).status, 404);
  // report di un'azienda dell'altro ambiente: 404 chiaro
  assert.equal((await fetch(`${base}/api/admin/report/${g}`, { headers: { Cookie: cookie } })).status, 404);
});

test('accesso firmato: resta valido dopo un riavvio a database vuoto, non si falsifica, «Esci» lo annulla', async () => {
  const me = async (c) => (await (await fetch(`${base}/api/admin/me`, { headers: { Cookie: c } })).json()).role;
  q.run('DELETE FROM admin_tokens'); // come dopo una pubblicazione su Render: nessuna sessione salvata
  assert.equal(await me(cookie), 'admin');
  const [, val] = cookie.split('=');
  const parts = val.split('.');
  await fetch(`${base}/api/admin/demo-access`, { method: 'PUT', headers: { ...H(), Cookie: cookie }, body: JSON.stringify({ password: 'comitato2027', enabled: true }) });
  assert.equal(await me(`aito_admin=demo.${parts.slice(1).join('.')}`), null, 'il ruolo non si cambia a mano');
  assert.equal(await me(`aito_admin=${parts.slice(0, 3).join('.')}.${'A'.repeat(43)}`), null, 'firma falsa');
  const lg = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: H(), body: JSON.stringify({ password: 'testpass123' }) });
  const c2 = lg.headers.get('set-cookie').split(';')[0];
  await fetch(`${base}/api/admin/logout`, { method: 'POST', headers: { ...H(), Cookie: c2 }, body: '{}' });
  assert.equal(await me(c2), null);
  assert.equal(await me(cookie), 'admin', 'le altre sessioni restano aperte');
  // cambio password da Impostazioni: le altre sessioni escono, chi l'ha cambiata resta dentro con un cookie nuovo
  const c3 = (await fetch(`${base}/api/admin/login`, { method: 'POST', headers: H(), body: JSON.stringify({ password: 'testpass123' }) })).headers.get('set-cookie').split(';')[0];
  const ch = await fetch(`${base}/api/admin/password`, { method: 'PUT', headers: { ...H(), Cookie: cookie }, body: JSON.stringify({ password: 'testpass123' }) });
  const c4 = ch.headers.get('set-cookie').split(';')[0];
  assert.equal(await me(c3), null); assert.equal(await me(cookie), null); assert.equal(await me(c4), 'admin');
  cookie = c4;
});

test('password DEMO stabile da SESSION_SECRET: attiva senza impostarla, uguale dopo i riavvii, solo per il team ELIS', async () => {
  const A = { ...H(), Cookie: cookie };
  const wipe = () => q.run("DELETE FROM settings WHERE key IN ('demo_pw', 'demo_access', 'sess_epoch_demo')");
  wipe(); // server appena avviato: nessuna password impostata da Impostazioni
  const da = await (await fetch(`${base}/api/admin/demo-access`, { headers: A })).json();
  assert.match(da.stablePassword, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  // anche scritta in minuscolo e senza trattini
  const lg = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: H(), body: JSON.stringify({ password: da.stablePassword.toLowerCase().replace(/-/g, ''), demo: true }) });
  assert.equal((await lg.json()).role, 'demo');
  const dc = lg.headers.getSetCookie().find((c) => c.startsWith('aito_admin=')).split(';')[0];
  // come dopo un riavvio a database vuoto: impostazioni cancellate, accesso e password restano
  wipe();
  assert.equal((await (await fetch(`${base}/api/demo/status`)).json()).active, true);
  assert.equal((await (await fetch(`${base}/api/admin/me`, { headers: { Cookie: dc } })).json()).role, 'demo');
  assert.equal((await fetch(`${base}/api/admin/demo-access`, { headers: { Cookie: dc } })).status, 403, 'il comitato non legge la password');
});
