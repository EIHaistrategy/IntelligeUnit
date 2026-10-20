// Prova completa del flusso nel browser (admin, referente, 3 telefoni, consolidamento, report, PDF, zip).
// Non fa parte di "npm test": richiede Playwright e un server avviato su un database vuoto.
//   1. AITO_DATA_DIR=/tmp/aito-e2e ADMIN_PASSWORD=testpass123 PORT=3100 npm start
//   2. npm i --no-save playwright && npx playwright install chromium
//   3. node test/e2e/e2e.mjs ./e2e-out        (schermate e PDF finiscono in ./e2e-out)
// Variabili facoltative: AITO_BASE (default http://localhost:3100), AITO_PW (default testpass123), PW_CHROMIUM (percorso di Chromium).
import fs from 'node:fs';
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { // ripiego: Playwright installato globalmente nell'ambiente cloud di sviluppo
  const { createRequire } = await import('node:module'); ({ chromium } = createRequire(import.meta.url)('/home/claude/.npm-global/lib/node_modules/playwright')); }

const BASE = process.env.AITO_BASE || 'http://localhost:3100';
const PW = process.env.AITO_PW || 'testpass123';
const OUT = process.argv[2] || './e2e-out';
fs.mkdirSync(OUT, { recursive: true });
const shot = async (page, name, full = true) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
const errors = [];

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}).catch(() => chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }));
const watch = (p, tag) => { p.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`)); p.on('console', (m) => m.type() === 'error' && errors.push(`${tag} console: ${m.text()}`)); };

// ---- Admin
const adminCtx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const admin = await adminCtx.newPage(); watch(admin, 'admin');
await admin.goto(`${BASE}/admin`);
await admin.fill('#pw', PW); await admin.click('#go');
await admin.waitForSelector('text=Da fare');
await shot(admin, '01-admin-sessioni');
await admin.goto(`${BASE}/admin#/aziende`); await admin.waitForSelector('#n_name');
await admin.fill('#n_name', 'Azienda Amica S.p.A.'); await admin.selectOption('#n_per', 'Gruppo'); await admin.selectOption('#n_sec', 'Servizi');
await admin.selectOption('#n_kind', 'TEST'); await admin.click('#n_go');
await admin.waitForSelector('#r_name');
await admin.fill('#r_name', 'Mario Rossi'); await admin.fill('#r_role', 'Head of Innovation'); await admin.click('#r_add');
await admin.waitForSelector('[data-delref]');
const refUrl = await admin.inputValue('input.mono');
const refToken = refUrl.split('/r/')[1];
await shot(admin, '02-admin-azienda');

// ---- Referente: scheda pre-sessione
const refCtx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const ref = await refCtx.newPage(); watch(ref, 'ref');
await ref.goto(`${BASE}/r/${refToken}`); await ref.waitForSelector('text=Compila la scheda');
await shot(ref, '03-ref-home');
await ref.click('a[href="#/scheda/GOV"]'); await ref.waitForSelector('#f');
await ref.check('input[name="Q1_L3"][value="Sì"]');
await ref.check('input[name="Q2_L3"][value="Esiste e comprende stabilmente legale/compliance e HR"]');
await ref.check('input[name="Q2_L4"][value="Efficienza"]'); await ref.check('input[name="Q2_L4"][value="Innovazione"]');
await ref.check('input[name="Q9_L3"][value="Consultata nella redazione"]');
await ref.check('input[name="Q10_L2"][value="Sì"]');
await ref.fill('input[name="P_USO"]', '35');
await ref.check('input[name="P_AMBIZIONE"][value="Efficienza dei processi"]');
await shot(ref, '04-ref-scheda');
await ref.click('button[type=submit]'); await ref.waitForSelector('text=compilata');

// ---- Sessione GOV
const ctl = await (await admin.request.get(`${BASE}/api/admin/sessions/1/control`)).json();
const company = ctl.companies.find((c) => c.name.startsWith('Azienda Amica'));
const joinPath = new URL(ctl.joinUrl).pathname + `?c=${company.joinCode}`;
// passo 4 della preparazione: generare i QR della sessione blocca il referente fino alla chiusura
const qr = await (await admin.request.post(`${BASE}/api/admin/sessions/1/qr`, { data: {} })).json();
const regen = await admin.request.post(`${BASE}/api/admin/referents/${company.referents[0].id}/regenerate`, { data: {} });
console.log('QR generati:', qr.generated, '· rigenera link del referente dopo il QR:', regen.status(), '(atteso 409)');
if (regen.status() !== 409) errors.push('il referente non è bloccato dopo la generazione dei QR');

const people = [
  { name: 'Anna Bianchi', func: 'CEO', roster: true, a: { Q1: 3, Q2: 2, Q9: 3, Q10: 'nd' }, p: ['A', 'A'] },
  { name: 'Luca Verdi', func: 'IT', a: { Q1: 4, Q2: 2, Q9: 3, Q10: 2 }, p: ['A', 'B'] },
  { name: 'Sara Neri', func: 'HR', a: { Q1: 3, Q2: 4, Q9: 2, Q10: 'nd' }, p: ['A', 'ND'] },
];
// persone iscritte da ELIS (solo nome e funzione)
const ros = await admin.request.post(`${BASE}/api/admin/companies/${company.id}/roster`, { data: { name: 'Anna Bianchi', func: 'CEO' } });
if (!ros.ok()) errors.push('iscrizione della persona non riuscita');
const phones = [];
for (const pp of people) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage(); watch(pg, pp.name);
  await pg.goto(BASE + joinPath); await pg.waitForSelector('#go');
  if (phones.length === 0) await shot(pg, '05-phone-join', false);
  // la prima persona è iscritta da ELIS e si sceglie dall'elenco; le altre si aggiungono
  if (pp.roster) await pg.click(`[data-r]:has-text("${pp.name}")`);
  else { if (await pg.$('[data-r="new"]')) await pg.click('[data-r="new"]'); await pg.fill('#name', pp.name); await pg.selectOption('#func', pp.func); }
  await pg.check('#ack'); await pg.click('#go');
  await pg.waitForSelector('text=Sei registrato');
  phones.push({ pg, pp });
}
await shot(phones[0].pg, '06-phone-attesa', false);

const setPhase = async (phase) => { const r = await admin.request.put(`${BASE}/api/admin/sessions/1/phase`, { data: { phase } }); if (!r.ok()) throw new Error(await r.text()); };
await setPhase('individuale');
for (const { pg, pp } of phones) {
  await pg.waitForSelector('text=Domanda 1 di 4', { timeout: 10000 });
  let i = 0;
  for (const id of ['Q1', 'Q2', 'Q9', 'Q10']) {
    if (pp.name === 'Anna Bianchi' && i === 0) await shot(pg, '07-phone-item', true);
    await pg.click(`button.level[data-l="${pp.a[id]}"]`);
    await pg.waitForFunction(() => !document.querySelector('#next').disabled);
    await pg.click('#next'); i++;
  }
  await pg.waitForSelector('text=Confronti a coppie');
  await pg.click(`[data-pair="Q1|Q2"] .level[data-v="${pp.p[0]}"]`);
  await pg.click(`[data-pair="Q9|Q10"] .level[data-v="${pp.p[1]}"]`);
  if (pp.name === 'Anna Bianchi') await shot(pg, '08-phone-coppie', true);
  await pg.click('#next'); await pg.waitForSelector('#submit:not([disabled])');
  await pg.click('#submit'); await pg.waitForSelector('text=Risposte inviate');
}
await shot(phones[0].pg, '09-phone-riepilogo', true);
await admin.goto(`${BASE}/admin#/sessione/1`); await admin.waitForSelector('text=Aziende');
await admin.waitForTimeout(800);
await shot(admin, '10-admin-control-room');

await setPhase('confronto');
await phones[0].pg.waitForSelector('text=Le risposte della vostra azienda', { timeout: 10000 });
await shot(phones[0].pg, '11-phone-confronto', true);
await ref.goto(`${BASE}/r/${refToken}#/sessione/1`); await ref.waitForSelector('text=Confronti a coppie');
await shot(ref, '12-ref-confronto');

await setPhase('consolidamento');
await ref.waitForSelector('#confirm', { timeout: 10000 });
await shot(ref, '13-ref-consolidamento-iniziale');
// Q1: mediana 3, sotto-opzione B (indicatori: sì da scheda) — già suggerita
// Q2: mediana 2: confermiamo 2 e scegliamo B
await ref.click('#it-Q2 [data-s="B"]');
// Q9: mediana 3, suggerita B dalla scheda
// prova override su Q1 senza motivazione → errore atteso
await ref.click('#it-Q1 [data-l="4"]');
await ref.click('#confirm');
await ref.waitForSelector('.banner.risk');
const errText = await ref.textContent('#errs');
await ref.fill('#it-Q1 [data-reason]', 'Il piano industriale 2026 include l\'AI ed è stato comunicato a tutti i dirigenti');
await ref.click('#confirm');
await ref.waitForSelector('text=Risultato consolidato', { timeout: 10000 });
await ref.selectOption('#c_item', 'Q2');
await ref.fill('#c_action', 'Formalizzare il mandato dello sponsor con budget e obiettivi annuali');
await ref.fill('#c_owner', 'Direttore Innovazione'); await ref.fill('#c_due', '2027-01-31');
await ref.fill('#c_kpi', 'Delibera del CdA sul mandato AI'); await ref.check('#c_peer');
await ref.click('#c_save'); await ref.waitForSelector('text=Commitment salvato');
await shot(ref, '14-ref-consolidato');

// regola §2: dopo il confronto non si torna all'individuale
const back = await admin.request.put(`${BASE}/api/admin/sessions/1/phase`, { data: { phase: 'individuale', reason: 'prova' } });
console.log('ritorno a individuale:', back.status(), (await back.json()).error.slice(0, 60));
await setPhase('chiusa');
// DEMO per anteprima benchmark
const { execSync } = await import('node:child_process');
await admin.request.post(`${BASE}/api/admin/demo`, { headers: { origin: BASE } });
await admin.request.post(`${BASE}/api/admin/benchmark/GOV/freeze`);
await admin.goto(`${BASE}/report/${company.id}`); await admin.waitForSelector('text=Lettura di coerenza');
await shot(admin, '15-report-ufficiale');
await admin.goto(`${BASE}/report/${company.id}?preview=1`); await admin.waitForSelector('text=Lettura di coerenza');
await shot(admin, '16-report-anteprima');
await admin.pdf?.({ path: `${OUT}/report-anteprima.pdf`, format: 'A4', printBackground: true }).catch(() => {});
await admin.goto(`${BASE}/plenaria/GOV?preview=1`); await admin.waitForSelector('text=come si posiziona');
await shot(admin, '17-plenaria-anteprima');
await admin.goto(`${BASE}/plenaria/GOV`); await admin.waitForSelector('.card');
await shot(admin, '18-plenaria-ufficiale');
await admin.goto(`${BASE}/admin#/audit`); await admin.waitForSelector('text=Registro modifiche');
await shot(admin, '19-audit');
const xl = await admin.request.get(`${BASE}/api/admin/export.xlsx`);
fs.writeFileSync(`${OUT}/export.xlsx`, await xl.body());

// dashboard live (anteprima con demo) e rilascio con copia congelata
await admin.goto(`${BASE}/live/1?preview=1`); await admin.waitForSelector('text=come si posiziona');
await admin.waitForTimeout(500); await shot(admin, '20-live-anteprima');
await admin.goto(`${BASE}/live/1`); await admin.waitForSelector('.tally'); await shot(admin, '21-live-ufficiale');
const rel = await (await admin.request.post(`${BASE}/api/admin/sessions/1/companies/${company.id}/release`)).json();
console.log('rilascio:', JSON.stringify(rel));
// correzione admin dopo il rilascio: il report rilasciato NON deve cambiare
await admin.request.post(`${BASE}/api/admin/correct`, { data: { companyId: company.id, itemId: 'Q2', level: 3, sub: 'C', reason: 'test congelamento' } });
const refRep = await (await ref.request.get(`${BASE}/api/r/${refToken}/report`)).json();
const draft = await (await admin.request.get(`${BASE}/api/admin/report/${company.id}`)).json();
console.log('Q2 nel report rilasciato:', refRep.items.find((i) => i.itemId === 'Q2').level + refRep.items.find((i) => i.itemId === 'Q2').sub, '· Q2 nella bozza:', draft.items.find((i) => i.itemId === 'Q2').level + draft.items.find((i) => i.itemId === 'Q2').sub, '· bozza:', draft.draft);
await ref.goto(`${BASE}/r/${refToken}`); await ref.waitForSelector('text=Report riservati'); await shot(ref, '22-ref-home-report');
const pdf = await ref.request.get(`${BASE}/api/report/${company.id}/pdf?t=${refToken}`);
console.log('PDF referente:', pdf.status(), (await pdf.body()).length, 'byte');
fs.writeFileSync(`${OUT}/report-referente.pdf`, await pdf.body());
const zip = await admin.request.get(`${BASE}/api/admin/sessions/1/pdfs.zip`);
console.log('zip:', zip.status(), (await zip.body()).length, 'byte');
const rep = await (await admin.request.get(`${BASE}/api/admin/report/${company.id}`)).json();
console.log('override error:', errText.trim());
console.log('items:', rep.items.map((i) => `${i.itemId}=${i.level}${i.sub || ''} ${i.score?.toFixed?.(1)} [${i.confidence}]`).join(' | '));
console.log('dims:', rep.dims.filter((d) => d.score != null).map((d) => `${d.id}=${d.score} ${d.band}`).join(' | '));
console.log('coherence:', JSON.stringify(rep.coherence.map((c) => [c.id, c.flagged, c.comparisons.map((x) => x.status)])));
console.log('commitments:', rep.commitments.length, 'pairs:', JSON.stringify(rep.pairs[0]?.pairs.map((p) => [p.a, p.b, p.counts, p.discordant])));
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
