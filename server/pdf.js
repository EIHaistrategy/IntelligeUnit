// PDF riservato per azienda: posizionamento rispetto al benchmark AITO (§9–§12 della nota).
// Generato sul server con PDFKit, senza browser: leggero anche sul piano gratuito di Render.
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import { createRequire } from 'node:module';
import path from 'node:path';
import * as E from './engine/index.js';
import { radar, whereMap, benchStrip } from '../public/js/charts.js';

const require = createRequire(import.meta.url);
const FONT_DIR = path.join(path.dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf');
const I = E.INSTRUMENT, SC = E.SCORING;
const C = { navy: '#005172', deep: '#1F3864', gold: '#C9A84C', teal: '#1FB5B8', ink: '#17212E', ink2: '#4A5668', ink3: '#7B8798', line: '#DDE3EA', bg: '#F4F6F8',
  risk: '#C0392B', ok: '#1E8E5A', warn: '#B7791F' };
const BAND_COLOR = { FOND: '#D9822B', COST: '#B08B2E', CONS: '#1E8E5A' };

const n1 = (x) => (x == null ? 'N.D.' : (Math.round(x * 10) / 10).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const lvl = (l, s) => (l == null ? 'N.D.' : `${l}${s || ''}`);
const dateIt = (d) => new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });

export function buildCompanyPdf(R) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 56, left: 48, right: 48 }, bufferPages: true,
    info: { Title: `AITO Map — ${R.company.name}`, Author: 'ELIS Innovation Hub · AITO', Subject: 'AI Transformation & Adoption Map — report riservato' } });
  doc.registerFont('Body', path.join(FONT_DIR, 'DejaVuSans.ttf'));
  doc.registerFont('Bold', path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'));
  const W = doc.page.width - 96, X0 = 48;
  const bottom = () => doc.page.height - 56;
  const ensure = (h) => { if (doc.y + h > bottom()) doc.addPage(); };
  const svg = (s, x, y, w, h) => SVGtoPDF(doc, s, x, y, { width: w, height: h, preserveAspectRatio: 'xMidYMid meet', fontCallback: (fam, bold) => (bold ? 'Bold' : 'Body') });
  const para = (t, opts = {}) => { doc.font(opts.bold ? 'Bold' : 'Body').fontSize(opts.size || 9).fillColor(opts.color || C.ink).text(t, opts.x ?? X0, opts.y, { width: opts.w ?? W, lineGap: 1.5, ...opts.pdf }); };
  const h2 = (t) => {
    ensure(60);
    doc.moveDown(0.6);
    doc.font('Bold').fontSize(13).fillColor(C.deep).text(t, X0, doc.y, { width: W });
    const y = doc.y + 2; doc.moveTo(X0, y).lineTo(X0 + W, y).lineWidth(1.5).strokeColor(C.gold).stroke();
    doc.y = y + 8;
  };
  const explain = (t) => {
    doc.font('Body').fontSize(8.3);
    const h = doc.heightOfString(t, { width: W - 16, lineGap: 1.5 }) + 10;
    ensure(h + 6);
    const y = doc.y;
    doc.rect(X0, y, W, h).fill('#F7F9FB'); doc.rect(X0, y, 3, h).fill(C.teal);
    doc.fillColor(C.ink2).text(t, X0 + 10, y + 5, { width: W - 16, lineGap: 1.5 });
    doc.y = y + h + 6;
  };
  const tag = (t, color, x, y) => {
    doc.font('Bold').fontSize(7.5);
    const w = doc.widthOfString(t) + 10;
    doc.roundedRect(x, y, w, 12, 6).fill(color); doc.fillColor('#FFFFFF').text(t, x + 5, y + 2.4, { lineBreak: false });
    return w;
  };
  const benchTxt = (b) => (!b ? 'benchmark non ancora congelato' : !b.available ? `benchmark non disponibile (N=${b.n}, servono almeno ${SC.benchmark.minN} aziende)`
    : `mediana ${n1(b.median)} · Q1–Q3 ${n1(b.q1)}–${n1(b.q3)} · N=${b.n} · ${b.label}${b.looApplied ? '' : ' · azienda inclusa (campione residuo < 5)'}`);

  // ---------- Copertina ----------
  doc.rect(0, 0, doc.page.width, 190).fill(C.deep);
  doc.font('Bold').fontSize(8.5).fillColor(C.gold).text('AI TRANSFORMATION & ADOPTION MAP · REPORT RISERVATO', X0, 46, { characterSpacing: 1.5 });
  doc.font('Bold').fontSize(24).fillColor('#FFFFFF').text(R.company.name, X0, 66, { width: W });
  doc.font('Body').fontSize(10).fillColor('#DCE3EE')
    .text(`Perimetro valutato: ${R.company.perimeter || 'non indicato'}   ·   Dimensioni misurate: ${R.dimsComplete}/8`, X0, doc.y + 6, { width: W })
    .text(`Sessioni: ${R.sessions.map((s) => s.title).join(' · ') || '—'}`, { width: W })
    .text(`Generato il ${dateIt(R.generatedAt)} · Strumento V${R.instrumentVersion} · scoring ${R.scoringVersion}`, { width: W });
  doc.fontSize(8).fillColor('#AFC0D6').text(`Benchmark: ${[...new Set(Object.values(R.benchVersions))].join(' · ') || 'nessuna versione congelata'}`, { width: W });
  doc.y = 206;
  if (R.draft || R.snapshot) {
    const txt = R.draft ? 'BOZZA: versione calcolata ora, non ancora rilasciata all\'azienda.' : `Versione rilasciata v${R.snapshot.version} · ${R.snapshot.sessionTitle} · ${dateIt(R.snapshot.releasedAt)}`;
    doc.rect(X0, doc.y, W, 20).fill(R.draft ? '#FBF0DD' : '#E3F4EA');
    doc.font('Bold').fontSize(8.5).fillColor(R.draft ? '#7A5212' : '#1B6B45').text(txt, X0 + 8, doc.y + 6);
    doc.y += 28;
  }
  if (R.preview) {
    doc.rect(X0, doc.y, W, 22).fill('#FFF3D6');
    doc.font('Bold').fontSize(9).fillColor('#6B4E0A').text('ANTEPRIMA: il benchmark include aziende DEMO e TEST. Non è un report ufficiale.', X0 + 8, doc.y + 6.5);
    doc.y += 30;
  }
  explain('Come leggere il report. La Map descrive la capacità dell\'azienda di trasformare l\'AI in pratica governata, adottata e scalabile. Non è una graduatoria e non esiste un livello giusto in assoluto. La lettura principale è la coerenza tra le capacità: livelli bassi ma allineati possono indicare un percorso coerente, mentre una forte distanza tra una capacità e quella da cui dipende segnala un punto da esaminare. Il benchmark confronta l\'azienda con le altre aziende AITO (non con il mercato), esclude l\'azienda stessa quando il campione lo consente e indica sempre su quante aziende si basa.');

  // ---------- 1 · Profilo ----------
  h2('1 · Il profilo AI rispetto ai peer');
  const yTop = doc.y;
  const radarSvg = radar(R.dims.map((d) => ({ id: d.id, score: d.score, peer: d.bench?.available ? d.bench.median : null })), { size: 300 });
  svg(radarSvg, X0 - 6, yTop, 215, 205);
  doc.font('Body').fontSize(7.5);
  doc.rect(X0 + 30, yTop + 210, 8, 8).fill(C.navy); doc.fillColor(C.ink2).text('Azienda', X0 + 42, yTop + 210);
  doc.rect(X0 + 95, yTop + 210, 8, 8).fill(C.teal); doc.fillColor(C.ink2).text('Mediana peer', X0 + 107, yTop + 210);
  // tabella dimensioni
  const tx = X0 + 222, tw = W - 222;
  let y = yTop;
  doc.font('Bold').fontSize(6.8).fillColor(C.ink3);
  doc.text('DIMENSIONE', tx, y); doc.text('SCORE', tx + 128, y, { width: 34, align: 'right' }); doc.text('PEER', tx + 166, y, { width: 34, align: 'right' }); doc.text('FASCIA', tx + 210, y);
  y += 12;
  for (const d of R.dims) {
    doc.font('Body').fontSize(7.8);
    const hName = doc.heightOfString(d.name, { width: 108 });
    const rowH = Math.max(17, hName + 7);
    doc.moveTo(tx, y - 2).lineTo(tx + tw, y - 2).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.roundedRect(tx, y + 1, 13, 13, 3).fill(d.score == null ? '#B9C2CE' : C.navy);
    doc.font('Bold').fontSize(7.5).fillColor('#FFFFFF').text(d.id, tx, y + 3.6, { width: 13, align: 'center' });
    doc.font('Body').fontSize(7.8).fillColor(C.ink).text(d.name, tx + 17, y + 3, { width: 108 });
    doc.font('Bold').fontSize(8.5).fillColor(C.ink).text(n1(d.score), tx + 128, y + 3, { width: 34, align: 'right' });
    doc.font('Body').fontSize(8).fillColor(C.ink2).text(d.bench?.available ? n1(d.bench.median) : '—', tx + 166, y + 3, { width: 34, align: 'right' });
    if (d.score != null) { const b = E.band(d.score); doc.font('Bold').fontSize(7).fillColor(BAND_COLOR[b.id]).text(b.name, tx + 210, y + 3.5, { width: tw - 210 }); }
    else doc.font('Body').fontSize(7).fillColor(C.ink3).text(I.sessions.find((s) => s.id === d.session).name, tx + 210, y + 3.5, { width: tw - 210 });
    y += rowH;
  }
  doc.font('Body').fontSize(7).fillColor(C.ink3).text('Fasce del pilot: Fondativa < 44 · In costruzione 44–69 · Consolidata ≥ 70. Le dimensioni non ancora misurate restano N.D. e non sono disegnate come zero.', tx, y + 2, { width: tw });
  doc.y = Math.max(yTop + 226, doc.y + 4);
  if (R.overall != null) para(`Indicatore sintetico complessivo (lettura secondaria, Map completa): ${n1(R.overall)}`, { size: 8.5, color: C.ink2 });

  // ---------- 2 · Coerenza ----------
  h2('2 · Lettura di coerenza');
  explain(`Ogni regola confronta una capacità abilitante con una capacità che ne dipende. Se l'abilitante è più avanti è prudenza; se la dipendente è più avanti di almeno ${SC.coherenceThreshold} punti (due livelli pieni) è un punto da esaminare nella call con il leader. La soglia è un'ipotesi del pilot.`);
  if (!R.coherence.length) para('Nessuna regola ancora leggibile con i dati disponibili.', { color: C.ink3 });
  for (const c of R.coherence) {
    ensure(46);
    const st = c.flagged ? ['da esaminare', C.risk] : c.comparisons.some((x) => x.status === 'prudenza') ? ['prudenza', C.teal] : ['coerente', C.ok];
    const y0 = doc.y;
    doc.font('Bold').fontSize(9).fillColor(C.ink).text(`${c.id} · ${c.label}`, X0, y0, { continued: false });
    tag(st[0], st[1], X0 + doc.widthOfString(`${c.id} · ${c.label}`) + 8, y0 - 0.5);
    doc.y = y0 + 13;
    for (const x of c.comparisons) para(x.available ? `${x.enabler} ${n1(x.enablerScore)}  →  ${c.dependent} ${n1(x.dependentScore)}   (scarto ${x.diff > 0 ? '+' : ''}${n1(x.diff)})${x.status === 'da_esaminare' ? '  · da esaminare' : ''}` : `${x.enabler} → ${c.dependent}: non ancora disponibile (abilitante N.D.)`, { size: 8, color: C.ink2 });
    if (c.flagged) para(`Segnale: ${c.signal}`, { size: 8 });
    if (c.crossSession) para('Confronta sessioni diverse, con partecipanti diversi: da validare nella call con il leader.', { size: 7.5, color: C.ink3 });
    doc.moveDown(0.4);
  }
  if (R.coherencePending.length) para(`Regole che si attiveranno nelle prossime sessioni: ${R.coherencePending.join(', ')}.`, { size: 7.5, color: C.ink3 });
  if (R.usoDirezione) {
    doc.moveDown(0.3);
    para(`Uso e direzione. Quota di persone che usano l'AI ogni settimana: ${n1(R.usoDirezione.uso)}%; direzione strategica (Q1): livello ${R.usoDirezione.q1}.${R.usoDirezione.q1 <= 2 ? ' Una direzione ancora informale accanto a un uso già presente indica una pratica che può precedere la strategia: da discutere.' : ''} (Lettura qualitativa: la nota non fissa una soglia.)`, { size: 8 });
  }

  // ---------- 3 · Item ----------
  h2('3 · Capacità per item e confronto con il benchmark');
  explain('Il numero è il livello consolidato in sala, la lettera la sotto-opzione scelta con una scelta forzata tra fatti osservabili. Lo stesso "2B" non vale lo stesso in tutti gli item (dipende da quante sotto-opzioni ha il livello), per questo è indicato anche il valore 0–100. Nella barra: il punto blu è l\'azienda, la fascia azzurra va dal primo al terzo quartile dei peer, il trattino è la mediana.');
  for (const it of R.items) {
    const desc = `${it.descriptor || ''}${it.subText ? `\n${it.subText}` : ''}${it.override ? `\nOverride: ${it.overrideReason || ''}` : ''}`;
    doc.font('Body').fontSize(7.8);
    const hDesc = doc.heightOfString(desc, { width: 215, lineGap: 1 });
    doc.font('Bold').fontSize(8.5);
    const hLeft = doc.heightOfString(`${it.itemId} ${it.title}`, { width: 120 }) + 22 + (it.valoriale ? 16 : 0) + 10;
    const h = Math.max(52, hLeft, hDesc + 26);
    ensure(h + 4);
    const y0 = doc.y;
    doc.moveTo(X0, y0).lineTo(X0 + W, y0).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.font('Bold').fontSize(8.5).fillColor(C.ink).text(`${it.itemId} ${it.title}`, X0, y0 + 5, { width: 120 });
    doc.font('Body').fontSize(7).fillColor(C.ink3).text(`Dim. ${it.dimension} · ${it.confidence || ''}`, X0, doc.y + 1, { width: 120 });
    doc.text(`${it.validN} ${it.validN === 1 ? 'risposta valida' : 'risposte valide'} · ${it.ndN} N.D.`, X0, doc.y, { width: 120 });
    if (it.valoriale) tag('valoriale', C.gold, X0, doc.y + 2);
    doc.font('Bold').fontSize(11).fillColor(C.navy).text(lvl(it.level, it.sub), X0 + 126, y0 + 5, { width: 34 });
    doc.font('Body').fontSize(7.5).fillColor(C.ink2).text(n1(it.score), X0 + 126, y0 + 21, { width: 34 });
    doc.font('Body').fontSize(7.8).fillColor(C.ink).text(desc, X0 + 166, y0 + 5, { width: 215, lineGap: 1 });
    svg(benchStrip(it.bench, it.score, { w: 220, h: 26 }), X0 + W - 118, y0 + 4, 118, 14);
    doc.font('Body').fontSize(6.8).fillColor(C.ink2).text(benchTxt(it.bench), X0 + W - 118, y0 + 22, { width: 118, lineGap: 0.5 });
    doc.y = y0 + h;
  }

  // ---------- 4 · Dove intervenire ----------
  h2('4 · Dove intervenire');
  explain('Ogni punto è una dimensione completa. Orizzontale: lo score dell\'azienda. Verticale: quanto è sopra (+) o sotto (−) la mediana delle altre aziende. Essere sopra la mediana non significa essere consolidati: la linea verticale a 70 separa le capacità consolidate.');
  const pts = R.dims.filter((d) => d.quadrant).map((d) => ({ id: d.id, score: d.score, delta: d.quadrant.delta }));
  if (pts.length) {
    ensure(210);
    const y0 = doc.y;
    svg(whereMap(pts, { names: SC.quadrantNames[SC.quadrantNamesInUse] }), X0, y0, 270, 200);
    let yy = y0 + 4;
    for (const d of R.dims.filter((x) => x.quadrant)) {
      doc.font('Bold').fontSize(8.5).fillColor(C.ink).text(`${d.id} · ${d.name}`, X0 + 285, yy, { width: W - 285 });
      doc.font('Body').fontSize(8).fillColor(C.ink2).text(`${d.quadrant.name} (alternativo: ${d.quadrant.altName}) · scarto dalla mediana ${d.quadrant.delta > 0 ? '+' : ''}${n1(d.quadrant.delta)}`, X0 + 285, doc.y + 1, { width: W - 285 });
      doc.text(benchTxt(d.bench), X0 + 285, doc.y + 1, { width: W - 285 });
      yy = doc.y + 8;
    }
    doc.y = Math.max(y0 + 206, yy);
  } else {
    para('La mappa richiede un benchmark disponibile (almeno 5 aziende) per le dimensioni misurate.', { color: C.ink3 });
    for (const d of R.dims.filter((x) => x.score != null)) para(`${d.id} · ${d.name}: ${benchTxt(d.bench)}`, { size: 8, color: C.ink2 });
  }

  // ---------- 5 · Priorità ----------
  h2('5 · Priorità e commitment');
  if (R.mapComplete) {
    explain('Tre priorità provvisorie, confermate dopo l\'allineamento finale di settembre 2027. L\'ordine proposto segue la nota: prima riportare a coerenza, poi i prerequisiti fondativi, poi le dimensioni sotto 70 e sotto la mediana peer. È una proposta trasparente, che non sostituisce il giudizio dell\'azienda.');
    R.priorities.slice(0, 3).forEach((p, i) => para(`${i + 1}. ${p.dimension} · ${p.name} (${n1(p.score)}) — ${p.reasons.join('; ') || 'nessun segnale specifico'}`, { size: 8.5 }));
  } else {
    para(`Le tre priorità complessive si calcolano a Map completa (${R.dimsComplete}/8 dimensioni misurate finora). In ogni sessione l'azienda sceglie la propria priorità e il commitment, riportati qui sotto.`, { size: 8.5, color: C.ink2 });
  }
  doc.moveDown(0.4);
  if (!R.commitments.length) para('Nessun commitment registrato.', { color: C.ink3 });
  for (const c of R.commitments) {
    ensure(52);
    para(`${c.session_title} · Priorità: ${c.priority_item} ${I.items[c.priority_item]?.title || ''}`, { bold: true, size: 8.5 });
    para(`Azione: ${c.action || '—'}\nOwner: ${c.owner || '—'} · Scadenza: ${c.due_date || '—'}\nKPI / evidenza: ${c.kpi || '—'}\nStato: ${c.status || 'aperto'}${c.status_note ? ` — ${c.status_note}` : ''}${c.peer_interest ? '\nInteresse a un confronto con la community' : ''}`, { size: 8, color: C.ink2 });
    doc.moveDown(0.4);
  }

  // ---------- 6 · Qualità del dato e profilo ----------
  h2('6 · Qualità del dato e profilo di approccio');
  const fn = (id) => I.functions.find((f) => f.id === id)?.label || id;
  for (const p of R.pairs) {
    para(`${p.session.title}: ${p.participants} partecipanti · funzioni: ${p.functions.map(fn).join(', ') || '—'}`, { size: 8.5, bold: true });
    for (const x of p.pairs) para(`Confronto ${x.a} vs ${x.b}: ${x.counts.A} per ${x.a}, ${x.counts.B} per ${x.b}, ${x.counts.ND} N.D.${x.discordant ? ` · ${x.discordant} ${x.discordant === 1 ? 'risposta' : 'risposte'} in contrasto con i livelli dati dalla stessa persona` : ''}`, { size: 8, color: C.ink2 });
    doc.moveDown(0.3);
  }
  para('I confronti a coppie sono un controllo di qualità interno e non entrano nel benchmark.', { size: 7.5, color: C.ink3 });
  const prof = Object.values(R.profile);
  if (prof.length) {
    doc.moveDown(0.4);
    para('Profilo di approccio (fuori punteggio: descrive come l\'azienda si trasforma, non quanto è avanti)', { size: 8.5, bold: true });
    for (const p of prof) para(`${p.q}: ${p.value}${typeof p.value === 'number' ? '%' : ''}`, { size: 8, color: C.ink2 });
  }

  // ---------- Note ----------
  h2('Note metodologiche e limiti');
  para(`Autovalutazione strutturata e consolidamento aziendale: non è un audit né una certificazione. Il benchmark è "indicativo" sotto le ${SC.benchmark.stableN} aziende e non è mostrato sotto le ${SC.benchmark.minN}; i sotto-livelli si mostrano solo con almeno ${SC.benchmark.subLevelMinN} aziende per categoria. Le soglie (fasce 44/70, coerenza ${SC.coherenceThreshold} punti, quadranti) sono ipotesi del pilot da ratificare. Le dimensioni misurate in sessioni diverse possono riflettere partecipanti diversi; a settembre 2027 l'allineamento finale le riporta a una data unica. Il benchmark usato è una versione congelata: i report consegnati non cambiano.`, { size: 8, color: C.ink2 });

  // ---------- Piè di pagina ----------
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc.font('Body').fontSize(7).fillColor(C.ink3)
      .text(`AITO · AI Transformation & Adoption Map · ${R.company.name} · riservato`, X0, doc.page.height - 36, { width: W - 60, lineBreak: false })
      .text(`${i + 1} / ${range.count}`, X0 + W - 60, doc.page.height - 36, { width: 60, align: 'right', lineBreak: false });
  }
  doc.end();
  return doc;
}

export function pdfBuffer(R) {
  return new Promise((resolve, reject) => {
    const doc = buildCompanyPdf(R);
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

export const pdfFileName = (R) => `AITO_Map_${R.snapshot ? `v${R.snapshot.version}_` : ''}${R.company.name.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '')}_${R.generatedAt.slice(0, 10)}.pdf`;
