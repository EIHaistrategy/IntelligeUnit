// Ambiente DEMO: caricamento ripetibile, avanzamento del percorso guidato, reset e separazione da Produzione.
// Ogni file di test gira in un processo a sé: qui il database è temporaneo e vuoto.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aito-demo-test-'));
process.env.AITO_DATA_DIR = dir;
process.env.ADMIN_PASSWORD = 'testpass123';
const { q } = await import('../server/db.js');
const D = await import('../server/demo.js');
const L = await import('../server/logic.js');
const I = (await import('../server/engine/index.js')).INSTRUMENT;
const { app } = await import('../server/index.js');

let server, base, cookie;
const H = () => ({ 'Content-Type': 'application/json', Origin: base });
before(async () => {
  // un'azienda reale di Produzione: nulla di quello che fa la demo deve toccarla
  q.run("INSERT INTO companies (name, kind, join_code, seeded) VALUES ('Reale S.p.A.', 'REALE', 'REAL', 0)");
  server = app.listen(0); await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const r = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: H(), body: JSON.stringify({ password: 'testpass123' }) });
  cookie = r.headers.get('set-cookie').split(';')[0];
});
after(() => { server?.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const prod = () => ({
  companies: q.get('SELECT COUNT(*) n FROM companies WHERE seeded = 0').n,
  sessions: q.all('SELECT id, phase FROM sessions WHERE seeded = 0 ORDER BY id').map((s) => `${s.id}:${s.phase}`).join(','),
  consolidated: q.get('SELECT COUNT(*) n FROM consolidated c JOIN companies co ON co.id = c.company_id WHERE co.seeded = 0').n,
});

test('il file del percorso guidato è leggibile e coerente con lo strumento', () => {
  const S = D.loadScript();
  assert.ok(S.azienda.nome && S.referenti.length >= 2 && S.community.length >= 5);
  for (const [b, sc] of Object.entries(S.sessioni)) {
    for (const [nome, lv] of Object.entries(sc.risposte)) {
      for (const v of Object.values(lv)) assert.ok(v === 'ND' || (Number.isInteger(v) && v >= 1 && v <= 5), `${b} ${nome}: livello ${v}`);
    }
  }
});

test('caricamento ripetibile: due caricamenti non duplicano nulla', () => {
  const before0 = prod();
  D.seedDemo(); D.seedDemo();
  assert.equal(q.get("SELECT COUNT(*) n FROM companies WHERE seeded = 1 AND kind = 'TEST'").n, 1);
  assert.equal(q.get("SELECT COUNT(*) n FROM sessions WHERE seeded = 1").n, 4);
  assert.equal(q.get("SELECT COUNT(*) n FROM companies WHERE seeded = 1").n, D.loadScript().community.length + 1);
  const st = D.tourState();
  assert.equal(st.s, 0); assert.equal(st.k, 0);
  assert.ok(st.sessions.every((s) => s.phase === 'preparazione'));
  assert.deepEqual(prod(), before0);
});

test('avanzamento: le quattro sessioni si chiudono con report, call e commitment; un commitment scade', () => {
  const before0 = prod();
  let st;
  let sawOverdue = false;
  while (!(st = D.advanceDemo()).done) {
    const g = st.company.id;
    const overdue = q.all("SELECT due_date FROM commitments WHERE company_id = ? AND status IN ('aperto','avviato') AND due_date != '' AND due_date < ?", g, st.simDay);
    if (overdue.length) sawOverdue = true;
  }
  assert.ok(st.sessions.every((s) => s.phase === 'chiusa'));
  const g = st.company.id;
  assert.equal(q.get("SELECT COUNT(*) n FROM report_snapshots WHERE company_id = ? AND kind = 'sessione'", g).n, 4);
  assert.equal(q.get("SELECT COUNT(*) n FROM report_snapshots WHERE company_id = ? AND kind = 'finale'", g).n, 1, 'report unificato dopo l\'allineamento');
  const snap = L.getSnapshot(g);
  assert.ok(snap.calls?.length >= 1 && snap.calls[0].transcript.length > 0, 'la trascrizione della call è nell\'appendice');
  assert.equal(q.get('SELECT COUNT(*) n FROM commitments WHERE company_id = ?', g).n, 4);
  assert.equal(q.get("SELECT status FROM commitments m JOIN sessions s ON s.id = m.session_id WHERE m.company_id = ? AND s.base = 'GOV'", g).status, 'completato');
  assert.ok(sawOverdue, 'durante il percorso almeno un commitment risulta scaduto');
  assert.deepEqual(prod(), before0);
});

test('isolamento: benchmark ufficiale senza dati DEMO, benchmark DEMO senza aziende TEST', () => {
  const official = L.computeBenchmark('GOV');
  assert.equal(official.companies.length, 0);
  const preview = L.computeBenchmark('GOV', { preview: true });
  const g = D.tourState().company.id;
  assert.ok(preview.companies.length > 0, 'il benchmark DEMO usa la community');
  assert.ok(!preview.companies.some((c) => (c.id ?? c) === g), 'l\'azienda guidata (TEST) non entra nel benchmark DEMO');
});

test('API: in Produzione le azioni DEMO sono rifiutate, il registro non mostra righe DEMO', async () => {
  for (const [url, method] of [['/api/admin/demo/advance', 'POST'], ['/api/admin/demo/reset', 'POST'], ['/api/admin/demo', 'POST'], ['/api/admin/demo', 'DELETE']]) {
    const r = await fetch(`${base}${url}`, { method, headers: { ...H(), Cookie: cookie }, body: '{}' });
    assert.equal(r.status, 403, `${method} ${url} in Produzione`);
  }
  const audit = await (await fetch(`${base}/api/admin/audit`, { headers: { Cookie: cookie } })).json();
  assert.ok(!audit.some((a) => String(a.actor).startsWith('demo')), 'nessuna riga DEMO nel registro di Produzione');
  const auditDemo = await (await fetch(`${base}/api/admin/audit`, { headers: { Cookie: `${cookie}; aito_mode=prova` } })).json();
  assert.ok(auditDemo.some((a) => String(a.actor).startsWith('demo')));
  const cs = await (await fetch(`${base}/api/admin/companies`, { headers: { Cookie: cookie } })).json();
  assert.deepEqual(cs.map((c) => c.name), ['Reale S.p.A.']);
});

test('reset: il percorso torna all\'inizio, con gli stessi dati', async () => {
  const r = await fetch(`${base}/api/admin/demo/reset`, { method: 'POST', headers: { ...H(), Cookie: `${cookie}; aito_mode=prova` }, body: '{}' });
  assert.equal(r.status, 200);
  const st = await r.json();
  assert.equal(st.s, 0); assert.equal(st.k, 0);
  assert.ok(st.sessions.every((s) => s.phase === 'preparazione'));
  assert.equal(q.get('SELECT COUNT(*) n FROM report_snapshots WHERE company_id = ?', st.company.id).n, 0);
  assert.equal(q.get("SELECT COUNT(*) n FROM companies WHERE seeded = 1 AND kind = 'TEST'").n, 1);
  assert.equal(prod().companies, 1);
});

test('un\'azienda DEMO non diventa REALE e non entra mai nel benchmark ufficiale', async () => {
  const g = D.tourState().company.id;
  const r = await fetch(`${base}/api/admin/companies/${g}`, { method: 'PUT', headers: { ...H(), Cookie: `${cookie}; aito_mode=prova` }, body: JSON.stringify({ kind: 'REALE' }) });
  assert.equal(r.status, 400);
  // anche se il dato fosse cambiato direttamente nel database, il benchmark ufficiale lo ignora
  q.run("UPDATE companies SET kind = 'REALE' WHERE id = ?", g);
  D.advanceDemo('end');
  assert.equal(L.computeBenchmark('GOV').companies.length, 0);
  q.run("UPDATE companies SET kind = 'TEST' WHERE id = ?", g);
  const fr = await fetch(`${base}/api/admin/benchmark/GOV/freeze`, { method: 'POST', headers: { ...H(), Cookie: `${cookie}; aito_mode=prova` }, body: '{}' });
  assert.equal(fr.status, 403, 'il benchmark ufficiale non si congela dalla DEMO');
});

test('modifiche da una scheda rimasta nell\'altro ambiente: rifiutate', async () => {
  const sid = D.tourState().sessions[0].id;
  const r = await fetch(`${base}/api/admin/sessions/${sid}/phase`, { method: 'PUT', headers: { ...H(), Cookie: cookie }, body: JSON.stringify({ phase: 'chiusa' }) });
  assert.equal(r.status, 409, 'cookie di Produzione su una sessione DEMO');
});

test('aziende create a mano in DEMO non confondono il percorso; la fase non torna indietro', () => {
  D.removeDemo();
  q.run("INSERT INTO companies (name, kind, join_code, seeded) VALUES ('Mia prova', 'TEST', 'MIAP', 1)");
  const st = D.seedDemo();
  assert.equal(st.sessions.length, 4);
  assert.match(st.company.name, /Altavia/);
  // il team porta a mano la sessione al confronto: "Avanza" non la riporta indietro
  q.run("UPDATE sessions SET phase = 'confronto' WHERE id = ?", st.sessions[0].id);
  D.advanceDemo(); D.advanceDemo();
  assert.equal(q.get('SELECT phase FROM sessions WHERE id = ?', st.sessions[0].id).phase, 'confronto');
  assert.equal(prod().companies, 1);
});

test('«Carica i dati DEMO» mostra il programma concluso; «Riparti da zero» torna all\'inizio', async () => {
  D.removeDemo();
  const C = { ...H(), Cookie: `${cookie}; aito_mode=prova` };
  const st = await (await fetch(`${base}/api/admin/demo`, { method: 'POST', headers: C, body: '{}' })).json();
  assert.equal(st.done, true);
  assert.ok(st.sessions.every((s) => s.phase === 'chiusa'));
  assert.equal(q.get("SELECT COUNT(*) n FROM report_snapshots WHERE company_id = ? AND kind = 'sessione'", st.company.id).n, 4);
  const z = await (await fetch(`${base}/api/admin/demo/reset`, { method: 'POST', headers: C, body: '{}' })).json();
  assert.equal(z.done, false); assert.ok(z.sessions.every((s) => s.phase === 'preparazione'));
  assert.equal(prod().companies, 1);
});

test('mappe: una sessione mostra solo le dimensioni delle sessioni precedenti, mai le successive', () => {
  const order = ['GOV', 'EFF', 'GROW', 'SCALE'];
  for (const [i, base] of order.entries()) {
    const M = L.sessionMaps(base, { preview: true });
    const prev = order.slice(0, i).flatMap((b) => I.sessions.find((s) => s.id === b).dimensions).sort();
    assert.deepEqual(M.others.map((d) => d.dimension).sort(), prev, `${base}: solo le sessioni precedenti`);
  }
});

test('accesso DEMO (comitato scientifico): solo DEMO, niente Produzione, impostazioni o export', async () => {
  const A = { ...H(), Cookie: cookie };
  assert.equal((await fetch(`${base}/api/admin/demo-access`, { method: 'PUT', headers: A, body: JSON.stringify({ password: 'comitato2027', enabled: true }) })).status, 200);
  // da /admin la password DEMO non vale: il comitato entra da /demo
  assert.equal((await fetch(`${base}/api/admin/login`, { method: 'POST', headers: H(), body: JSON.stringify({ password: 'comitato2027' }) })).status, 401);
  assert.equal((await (await fetch(`${base}/api/demo/status`)).json()).active, true);
  const lg = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: H(), body: JSON.stringify({ password: ' comitato2027 ', demo: true }) });
  assert.equal((await lg.json()).role, 'demo');
  const dc = lg.headers.getSetCookie().find((c) => c.startsWith('aito_admin=')).split(';')[0];
  // anche con il cookie di Produzione vede solo la DEMO
  const V = { ...H(), Cookie: `${dc}; aito_mode=prod` };
  const cs = await (await fetch(`${base}/api/admin/companies`, { headers: V })).json();
  assert.ok(cs.length > 0 && !cs.some((c) => c.name === 'Reale S.p.A.'), 'nessuna azienda di Produzione');
  const prodSess = q.get('SELECT id FROM sessions WHERE seeded = 0 LIMIT 1');
  if (prodSess) assert.equal((await fetch(`${base}/api/admin/sessions/${prodSess.id}/control`, { headers: V })).status, 404);
  assert.equal((await fetch(`${base}/api/admin/export.xlsx`, { headers: V })).status, 403);
  assert.equal((await fetch(`${base}/api/admin/password`, { method: 'PUT', headers: V, body: JSON.stringify({ password: 'xxxxxxxxxx' }) })).status, 403);
  assert.equal((await fetch(`${base}/api/admin/demo-access`, { method: 'PUT', headers: V, body: JSON.stringify({ enabled: false }) })).status, 403);
  const real = q.get("SELECT id FROM companies WHERE name = 'Reale S.p.A.'").id;
  assert.equal((await fetch(`${base}/api/admin/report/${real}`, { headers: V })).status, 404);
  // la DEMO si usa: il percorso guidato avanza
  assert.equal((await fetch(`${base}/api/admin/demo/advance`, { method: 'POST', headers: V, body: '{}' })).status, 200);
  // disattivato l'accesso: chi era dentro esce e la password non vale più
  await fetch(`${base}/api/admin/demo-access`, { method: 'PUT', headers: A, body: JSON.stringify({ enabled: false }) });
  assert.equal((await fetch(`${base}/api/admin/companies`, { headers: V })).status, 401);
  assert.equal((await fetch(`${base}/api/admin/login`, { method: 'POST', headers: H(), body: JSON.stringify({ password: 'comitato2027', demo: true }) })).status, 403);
  assert.equal((await (await fetch(`${base}/api/demo/status`)).json()).active, false);
  // la password admin non entra da /demo
  assert.equal((await fetch(`${base}/api/admin/login`, { method: 'POST', headers: H(), body: JSON.stringify({ password: 'testpass123', demo: true }) })).status, 403);
  assert.equal(prod().companies, 1);
});
