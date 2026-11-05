// Pomeriggio delle sessioni: votazione dei need (docs/REQUISITI_POMERIGGIO.md).
// Limite di 2 need, un voto per persona, need congelati, mappa solo a voto chiuso, nessun dato della Map,
// scelta di 3 need (o meno), separazione DEMO/Produzione, sezione «Dai tavoli» nel report e nel PDF.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aito-pm-test-'));
process.env.AITO_DATA_DIR = dir;
process.env.ADMIN_PASSWORD = 'testpass123';
const { q } = await import('../server/db.js');
const L = await import('../server/logic.js');
const { app } = await import('../server/index.js');

let server, base, cookie, sid, sess, comp, other, tbl, tbl2, morningTok, refTok;
const H = (c) => ({ 'Content-Type': 'application/json', Origin: base, ...(c ? { Cookie: c } : {}) });
const call = async (method, url, body, c) => { const r = await fetch(`${base}${url}`, { method, headers: H(c), body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };
const admin = (method, url, body) => call(method, url, body, cookie);
// parole e campi che appartengono alla Map: non devono comparire nelle API del pomeriggio (R1)
const MAP_WORDS = /score|benchmark|fascia|band|consolidat|commitment|median|level/i;

before(async () => {
  server = app.listen(0); await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  cookie = (await fetch(`${base}/api/admin/login`, { method: 'POST', headers: H(), body: JSON.stringify({ password: 'testpass123' }) })).headers.get('set-cookie').split(';')[0];
  sess = q.get("SELECT * FROM sessions WHERE base = 'GOV' AND seeded = 0");
  sid = sess.id;
  q.run("INSERT INTO companies (name, kind, join_code, seeded) VALUES ('Alfa S.p.A.', 'REALE', 'ALFA', 0), ('Beta S.r.l.', 'REALE', 'BETA', 0)");
  comp = q.get("SELECT id FROM companies WHERE join_code = 'ALFA'").id; other = q.get("SELECT id FROM companies WHERE join_code = 'BETA'").id;
  refTok = 'reftok-alfa';
  q.run("INSERT INTO referents (company_id, name, token) VALUES (?, 'Rita Referente', ?)", comp, refTok);
  // un partecipante del mattino, con il codice salvato sul telefono
  morningTok = 'morning-anna';
  q.run("INSERT INTO participants (session_id, company_id, name, func, token) VALUES (?, ?, 'Anna Bianchi', 'IT', ?)", sid, comp, morningTok);
  // e un valore della Map, per controllare che il pomeriggio non lo mostri mai
  q.run("INSERT INTO consolidated (session_id, company_id, item_id, kind, level, sub, score, instrument_version, scoring_version) VALUES (?, ?, 'Q1', 'sessione', 4, 'A', 77.7, '1.0', 'S1.0')", sid, comp);
});
after(() => { server?.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('tavoli: creazione dalla console, link del facilitatore, need congelati all\'apertura del voto', async () => {
  let r = await admin('POST', `/api/admin/sessions/${sid}/pm/tables`, { label: '4a', title: 'Dati e governance', theme: 'Governare' });
  assert.equal(r.status, 200);
  r = await admin('POST', `/api/admin/sessions/${sid}/pm/tables`, { label: '4a', title: 'Doppio' });
  assert.equal(r.status, 400, 'etichetta già usata');
  r = await admin('POST', `/api/admin/sessions/${sid}/pm/tables`, { label: '5', title: 'Persone' });
  tbl = r.body.tables.find((t) => t.label === '4a'); tbl2 = r.body.tables.find((t) => t.label === '5');
  const F = `/api/pm/f/${tbl.facToken}`;
  assert.equal((await call('PUT', `${F}/needs`, { needs: Array.from({ length: 6 }, (_, i) => ({ title: `N${i}` })) })).status, 400, 'al massimo 5 need');
  r = await call('PUT', `${F}/needs`, { needs: [{ title: 'Catalogo dei dati', descr: 'Sapere dove stanno i dati' }, { title: 'Regole d\'uso' }, { title: 'Formazione' }, { title: 'Fornitori' }, { title: 'Misurare il valore' }] });
  assert.equal(r.status, 200); assert.deepEqual(r.body.needs.map((n) => n.code), ['T1', 'T2', 'T3', 'T4', 'T5']);
  // il voto si apre solo quando la regia avvia la fase dei tavoli
  assert.equal((await call('POST', `${F}/open`, {})).status, 400);
  assert.equal((await admin('POST', `/api/admin/sessions/${sid}/pm/phase`, { phase: 'tavoli' })).status, 200);
  assert.equal((await call('POST', `${F}/open`, {})).status, 200);
  assert.equal((await call('PUT', `${F}/needs`, { needs: [{ title: 'Altro' }] })).status, 400, 'need congelati');
  // la regia corregge il testo con un motivo; senza motivo no
  const n1 = q.get("SELECT id FROM pm_needs WHERE table_id = ? AND code = 'T1'", tbl.id).id;
  assert.equal((await admin('PUT', `/api/admin/pm/needs/${n1}`, { title: 'Catalogo dati' })).status, 400);
  assert.equal((await admin('PUT', `/api/admin/pm/needs/${n1}`, { title: 'Catalogo dei dati critici', reason: 'refuso' })).status, 200);
  assert.ok(q.get("SELECT 1 FROM audit WHERE entity = 'pm_need' AND action = 'correct'"));
  // secondo tavolo, aperto anch'esso
  const F2 = `/api/pm/f/${tbl2.facToken}`;
  await call('PUT', `${F2}/needs`, { needs: [{ title: 'Competenze' }, { title: 'Adozione' }] });
  await call('POST', `${F2}/open`, {});
});

test('voto: telefono del mattino riconosciuto, al massimo 2 need, priorità e orizzonte obbligatori, un voto per persona', async () => {
  const T = `/api/pm/t/${tbl.code}`;
  let r = await call('POST', `${T}/identify`, { morningTokens: ['altro', morningTok] });
  assert.equal(r.body.me.name, 'Anna Bianchi');
  assert.ok(!MAP_WORDS.test(JSON.stringify(r.body)), 'nessun dato della Map nella pagina di voto');
  const me = r.body.me.token;
  const needs = r.body.needs;
  assert.equal((await call('POST', `${T}/vote`, { pmToken: me, items: needs.slice(0, 3).map((n) => ({ needId: n.id, priority: 4, horizon: '3m' })) })).status, 400, 'tre need: rifiutato');
  assert.equal((await call('POST', `${T}/vote`, { pmToken: me, items: [{ needId: needs[0].id, priority: 4 }] })).status, 400, 'orizzonte mancante');
  r = await call('POST', `${T}/vote`, { pmToken: me, items: [{ needId: needs[0].id, priority: 5, horizon: '3m' }, { needId: needs[1].id, priority: 2, horizon: 'oltre' }] });
  assert.equal(r.status, 200); assert.ok(r.body.me.votedHere);
  assert.equal(r.body.results, undefined, 'dopo il voto nessun risultato del tavolo');
  // stessa persona a un altro tavolo
  r = await call('POST', `/api/pm/t/${tbl2.code}/vote`, { pmToken: me, none: true });
  assert.equal(r.status, 409); assert.match(r.body.error, /tavolo 4a/);
  // telefono non riconosciuto: codice azienda e nome; se il nome ha un profilo del mattino, nessun secondo profilo
  r = await call('GET', `${T}/people?c=ALFA`);
  assert.ok(r.body.people.some((p) => p.name === 'Anna Bianchi' && p.taken));
  assert.ok(!JSON.stringify(r.body).includes('voted'), 'dall\'elenco non si capisce chi ha votato');
  // un nome già entrato da un telefono non si prende da un altro (nessuno vota al posto di un collega)
  r = await call('POST', `${T}/join`, { companyCode: 'ALFA', name: 'anna  bianchi', func: 'IT', privacyAck: true });
  assert.equal(r.status, 409);
  assert.equal(q.get('SELECT COUNT(*) n FROM pm_people').n, 1);
  // il nome di chi era al mattino, scelto da un telefono nuovo prima che entri: si collega al profilo del mattino
  q.run("INSERT INTO participants (session_id, company_id, name, func, token) VALUES (?, ?, 'Elena Gialli', 'FIN', 'morning-elena')", sid, comp);
  const pe = q.get("SELECT id FROM participants WHERE name = 'Elena Gialli'").id;
  r = await call('POST', `${T}/join`, { companyCode: 'ALFA', key: `p${pe}` });
  assert.equal(r.body.me.name, 'Elena Gialli');
  assert.equal(L.activeParticipants(sid, comp).length, 2);
  // arrivato solo al pomeriggio: non entra tra i partecipanti della Map (VOT-02)
  assert.equal((await call('POST', `${T}/join`, { companyCode: 'ALFA', name: 'Bruno Verdi', func: 'HR' })).status, 400, 'serve la presa visione');
  r = await call('POST', `${T}/join`, { companyCode: 'ALFA', name: 'Bruno Verdi', func: 'HR', privacyAck: true });
  const bruno = r.body.me.token;
  assert.equal(L.activeParticipants(sid, comp).length, 2, 'Bruno non è un partecipante della Map');
  assert.equal((await call('POST', `${T}/vote`, { pmToken: bruno, items: [{ needId: needs[0].id, priority: 3, horizon: '6m' }] })).status, 200);
  // Beta vota senza scegliere
  r = await call('POST', `${T}/join`, { companyCode: 'BETA', name: 'Carla Neri', func: 'OPS', privacyAck: true });
  assert.equal((await call('POST', `${T}/vote`, { pmToken: r.body.me.token, none: true })).status, 200);
  // codice azienda sbagliato
  assert.equal((await call('GET', `${T}/people?c=ZZZZ`)).status, 400);
});

test('mappa: solo a voto chiuso; quote e soglie; nessuna azienda né persona; facilitatore vede solo il conteggio', async () => {
  let P = (await admin('GET', `/api/admin/sessions/${sid}/pm/plenary`)).body;
  assert.ok(P.tables.find((t) => t.table.label === '4a').pending, 'voto aperto: nessuna mappa');
  const f = (await call('GET', `/api/pm/f/${tbl.facToken}`)).body;
  assert.equal(f.voters, 3); assert.ok(!('needs' in f && f.needs.some((n) => 'votes' in n)), 'il facilitatore non vede i risultati');
  assert.equal((await admin('POST', `/api/admin/pm/tables/${tbl.id}/close`, {})).status, 200);
  P = (await admin('GET', `/api/admin/sessions/${sid}/pm/plenary`)).body;
  const T = P.tables.find((t) => t.table.label === '4a');
  assert.equal(T.voters, 3); assert.equal(T.none, 1); assert.equal(T.xThreshold, 2 / 5);
  const t1 = T.needs.find((n) => n.code === 'T1');
  assert.equal(t1.votes, 2); assert.equal(t1.x, 2 / 3); assert.equal(t1.y, 0.5); assert.equal(t1.quadrant, 'HH', 'sulla soglia conta a destra e in alto');
  assert.ok(t1.few, 'due voti: pochi voti');
  assert.deepEqual(T.needs.map((n) => n.code), ['T1', 'T2', 'T3', 'T4', 'T5'], 'ordine di codice, nessuna classifica');
  assert.equal(T.needs.find((n) => n.code === 'T3').votes, 0);
  const txt = JSON.stringify(P);
  assert.ok(!/Anna|Bruno|Carla|Alfa|Beta/.test(txt), 'nessuna persona né azienda in plenaria');
  assert.ok(!MAP_WORDS.test(txt.replace(/"(high|highPriorityMin)"/g, '')), 'nessun dato della Map in plenaria');
  // voto chiuso: non si vota più
  assert.equal((await call('POST', `/api/pm/t/${tbl.code}/join`, { companyCode: 'ALFA', name: 'Dario Rossi', func: 'IT', privacyAck: true })).status, 400, 'a voto chiuso non ci si registra');
  assert.equal((await call('GET', `/api/pm/t/${tbl.code}/people?c=ALFA`)).status, 400, 'a voto chiuso l\'elenco dei nomi non si vede');
  const bruno = q.get("SELECT token FROM pm_people WHERE name = 'Bruno Verdi'").token;
  q.run("UPDATE pm_votes SET is_current = 0 WHERE person_id = (SELECT id FROM pm_people WHERE token = ?)", bruno);
  assert.equal((await call('POST', `/api/pm/t/${tbl.code}/vote`, { pmToken: bruno, none: true })).status, 400, 'a voto chiuso non si vota');
  q.run("UPDATE pm_votes SET is_current = 1 WHERE person_id = (SELECT id FROM pm_people WHERE token = ?)", bruno);
  // voto chiuso per errore: la regia lo riapre con un motivo e lo richiude
  assert.equal((await admin('POST', `/api/admin/pm/tables/${tbl.id}/reopen`, {})).status, 400);
  assert.equal((await admin('POST', `/api/admin/pm/tables/${tbl.id}/reopen`, { reason: 'chiuso per errore' })).status, 200);
  assert.equal((await admin('POST', `/api/admin/pm/tables/${tbl.id}/close`, {})).status, 200);
});

test('regia: annulla un voto con motivo (resta nello storico), la persona può rivotare', async () => {
  const P = (await admin('GET', `/api/admin/sessions/${sid}/pm`)).body;
  const carla = P.tables.find((t) => t.label === '4a').votersList.find((v) => v.name === 'Carla Neri');
  assert.ok(!('items' in carla), 'la regia vede chi ha votato, non che cosa');
  assert.equal((await admin('POST', `/api/admin/pm/votes/${carla.id}/cancel`, {})).status, 400);
  assert.equal((await admin('POST', `/api/admin/pm/votes/${carla.id}/cancel`, { reason: 'tavolo sbagliato' })).status, 200);
  assert.equal(q.get('SELECT is_current FROM pm_votes WHERE id = ?', carla.id).is_current, 0);
  const tok = q.get("SELECT token FROM pm_people WHERE name = 'Carla Neri'").token;
  assert.equal((await call('POST', `/api/pm/t/${tbl2.code}/vote`, { pmToken: tok, none: true })).status, 200);
});

test('scelta finale: solo nella fase giusta, solo need votati dall\'azienda, esattamente 3 o tutti se meno', async () => {
  const R = `/api/r/${refTok}/pm/${sid}`;
  let r = await call('GET', R);
  assert.equal(r.body.open, false); assert.equal(r.body.groups.length, 0, 'prima della scelta i voti delle persone non si vedono');
  assert.equal((await call('PUT', R, { items: [] })).status, 400, 'fase non aperta');
  await admin('POST', `/api/admin/sessions/${sid}/pm/phase`, { phase: 'plenaria' });
  await admin('POST', `/api/admin/sessions/${sid}/pm/phase`, { phase: 'scelta' });
  r = await call('GET', R);
  assert.equal(r.body.available, 2); assert.equal(r.body.required, 2, 'Alfa ha votato 2 need');
  assert.ok(!/Anna|Bruno|Elena/.test(JSON.stringify(r.body)), 'voti anonimi anche nella pagina di scelta');
  assert.equal(r.body.groups[0].needs[0].votes, 2);
  assert.ok(!MAP_WORDS.test(JSON.stringify(r.body)), 'nessun dato della Map nella scelta');
  const [a, b] = r.body.groups[0].needs;
  const foreign = q.get("SELECT n.id FROM pm_needs n JOIN pm_tables t ON t.id = n.table_id WHERE t.label = '5' LIMIT 1").id;
  assert.equal((await call('PUT', R, { items: [{ needId: foreign }] })).status, 400, 'need non votato dall\'azienda');
  assert.equal((await call('PUT', R, { items: [{ needId: a.needId }], confirm: true })).status, 400, 'servono tutti e 2');
  r = await call('PUT', R, { items: [{ needId: a.needId, ask: 'Un budget dedicato' }, { needId: b.needId }], confirm: true });
  assert.equal(r.status, 200); assert.ok(r.body.confirmedAt);
  assert.equal((await call('PUT', R, { items: [] })).status, 400, 'confermata: bloccata');
  // la regia riapre con un motivo; lo storico resta
  assert.equal((await admin('POST', `/api/admin/sessions/${sid}/pm/choices/${comp}/reopen`, { reason: 'errore' })).status, 200);
  assert.equal(q.get('SELECT COUNT(*) n FROM pm_choices WHERE company_id = ?', comp).n, 2);
  r = await call('PUT', R, { items: [{ needId: a.needId, ask: 'Un budget dedicato' }, { needId: b.needId }], confirm: true });
  assert.equal(r.status, 200);
});

test('report: sezione «Dai tavoli» con i need scelti e i voti per persona; separata dalla Map; nel PDF', async () => {
  const R = L.companyReport(comp);
  const D = R.pomeriggio[0];
  assert.match(D.intro, /non entrano nello score/);
  assert.equal(D.chosen.length, 2); assert.ok(D.fewer, 'meno di 3: il report lo segnala');
  assert.equal(D.chosen[0].ask, 'Un budget dedicato');
  // voti anonimi: conteggi per tavolo, nessun nome
  assert.ok(!/Anna|Bruno|Elena/.test(JSON.stringify(R.pomeriggio)), 'nessun nome di persona nel report');
  const t4a = D.tables.find((t) => t.label === '4a');
  assert.equal(t4a.voters, 2); assert.equal(t4a.needs.length, 5);
  const t1 = t4a.needs.find((n) => n.code === 'T1');
  assert.equal(t1.votes, 2); assert.deepEqual(t1.priority.map((x) => x.label), ['media', 'massima']);
  // un'azienda che non ha votato al pomeriggio: nessuna sezione
  assert.equal(L.companyReport(other).pomeriggio.length, 1, 'Beta ha votato (nessun need): la sezione c\'è');
  assert.equal(L.companyReport(other).pomeriggio[0].tables[0].none, 1);
  const pdf = await fetch(`${base}/api/admin/pdf/${comp}`, { headers: { Cookie: cookie } });
  assert.equal(pdf.status, 200);
  assert.ok((await pdf.arrayBuffer()).byteLength > 5000);
  // i valori della Map restano quelli di prima
  assert.equal(q.get("SELECT score FROM consolidated WHERE company_id = ? AND item_id = 'Q1'", comp).score, 77.7);
});

test('separazione DEMO/Produzione e protezioni', async () => {
  // dalla console in DEMO un tavolo di Produzione non si tocca
  const r = await call('POST', `/api/admin/pm/tables/${tbl2.id}/close`, {}, `${cookie}; aito_mode=prova`);
  assert.equal(r.status, 409);
  // la plenaria del pomeriggio è riservata al team ELIS
  assert.equal((await call('GET', `/api/admin/sessions/${sid}/pm/plenary`)).status, 401);
  // a pomeriggio concluso il link del facilitatore scade
  await admin('POST', `/api/admin/sessions/${sid}/pm/phase`, { phase: 'chiuso_def' });
  assert.equal((await call('GET', `/api/pm/f/${tbl.facToken}`)).status, 410);
  // richieste senza Origin rifiutate
  const x = await fetch(`${base}/api/pm/t/${tbl.code}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(x.status, 403);
  // export: i tre fogli del pomeriggio
  const xl = await fetch(`${base}/api/admin/export.xlsx`, { headers: { Cookie: cookie } });
  assert.equal(xl.status, 200);
});
