// PDF riservato per azienda: posizionamento rispetto al benchmark AITO (§9–§12 della nota).
// Generato sul server con PDFKit, senza browser: leggero anche sul piano gratuito di Render.
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from './engine/index.js';
import { radar, whereMap, benchStrip } from '../public/js/charts.js';

// Inter (SIL OFL), sottoinsieme latino: lo stesso carattere della piattaforma web.
const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fonts');
const I = E.INSTRUMENT, SC = E.SCORING;
const C = { navy: '#005172', deep: '#1F3864', gold: '#C9A84C', goldInk: '#6F5718', teal: '#1FB5B8', ink: '#16202D', ink2: '#44505F', ink3: '#5B6777', line: '#D8DFE7', bg: '#F1F4F7',
  risk: '#B03424', ok: '#17784B', warn: '#8A5A12' };
const BAND_COLOR = { FOND: '#A4520F', COST: '#6F5718', CONS: '#17784B' };
const BAND_BG = { FOND: '#FCEBDD', COST: '#F5EDD3', CONS: '#E1F2E8' };

const n1 = (x) => (x == null ? 'N.D.' : (Math.round(x * 10) / 10).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const lvl = (l, s) => (l == null ? 'N.D.' : `${l}${s || ''}`);
const dateIt = (d) => new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });

export function buildCompanyPdf(R) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 56, left: 48, right: 48 }, bufferPages: true,
    info: { Title: `AI Transformation & Adoption Map — ${R.company.name}`, Author: 'ELIS Innovation Hub · AITO', Subject: 'AI Transformation & Adoption Map — report riservato' } });
  doc.registerFont('Body', path.join(FONT_DIR, 'inter-400.woff'));
  doc.registerFont('Semi', path.join(FONT_DIR, 'inter-600.woff'));
  doc.registerFont('Bold', path.join(FONT_DIR, 'inter-700.woff'));
  doc.registerFont('Serif', path.join(FONT_DIR, 'inter-600.woff'));
  doc.registerFont('Display', path.join(FONT_DIR, 'inter-700.woff'));
  // logo della Map: una mappa di posizionamento a quadranti, con le aziende come punti (lo stesso del sito)
  const logo = (x, y, size, frame) => {
    doc.save().translate(x, y).scale(size / 32);
    doc.roundedRect(1.5, 1.5, 29, 29, 7).lineWidth(1.5).strokeColor(frame).strokeOpacity(0.45).stroke();
    doc.moveTo(16, 5).lineTo(16, 27).moveTo(5, 16).lineTo(27, 16).lineWidth(1.2).strokeOpacity(0.3).stroke();
    doc.strokeOpacity(1);
    for (const [x0, y0, r] of [[9.5, 21.5, 2], [11.5, 10.5, 2], [21, 22, 2], [19, 13.5, 1.6]]) doc.circle(x0, y0, r).fillOpacity(0.6).fill(frame);
    doc.fillOpacity(1).circle(23.5, 9, 3.2).fill('#35D4C0');
    doc.restore();
  };
  const W = doc.page.width - 96, X0 = 48;
  const bottom = () => doc.page.height - 56;
  const ensure = (h) => { if (doc.y + h > bottom()) doc.addPage(); };
  const svg = (s, x, y, w, h) => SVGtoPDF(doc, s, x, y, { width: w, height: h, preserveAspectRatio: 'xMidYMid meet', fontCallback: (fam, bold) => (bold ? 'Bold' : 'Body') });
  const para = (t, opts = {}) => { doc.font(opts.bold ? 'Bold' : 'Body').fontSize((opts.size || 9) + 0.6).fillColor(opts.color || C.ink).text(t, opts.x ?? X0, opts.y, { width: opts.w ?? W, lineGap: 1.5, ...opts.pdf }); };
  const h2 = (t, need = 120) => {
    ensure(need);
    doc.moveDown(0.9);
    const m = t.match(/^(\d) · (.*)$/);
    const y0 = doc.y;
    let x = X0;
    if (m) {
      doc.circle(X0 + 9, y0 + 8, 9).lineWidth(1).strokeColor(C.gold).stroke();
      doc.font('Bold').fontSize(9).fillColor(C.goldInk).text(m[1], X0, y0 + 3.6, { width: 18, align: 'center' });
      x = X0 + 26;
    }
    doc.font('Serif').fontSize(15).fillColor(C.deep).text(m ? m[2] : t, x, y0, { width: W - (x - X0) });
    const y = doc.y + 4; doc.moveTo(X0, y).lineTo(X0 + W, y).lineWidth(0.6).strokeColor(C.line).stroke();
    doc.y = y + 10;
  };
  const explain = (t) => {
    doc.font('Body').fontSize(8.8);
    const h = doc.heightOfString(t, { width: W - 20, lineGap: 1.6 }) + 14;
    ensure(h + 8);
    const y = doc.y;
    doc.rect(X0, y, W, h).fill('#F5F7FA'); doc.rect(X0, y, 2.5, h).fill(C.teal);
    doc.fillColor(C.ink2).text(t, X0 + 12, y + 7, { width: W - 20, lineGap: 1.6 });
    doc.y = y + h + 8;
  };
  const tag = (t, color, x, y, ink = '#FFFFFF') => {
    doc.font('Bold').fontSize(7.8);
    const w = doc.widthOfString(t) + 12;
    doc.roundedRect(x, y, w, 13, 6.5).fill(color); doc.fillColor(ink).text(t, x + 6, y + 2.6, { lineBreak: false });
    return w;
  };
  const noBench = (what) => `${what}: ${Object.keys(R.benchVersions).length ? `servono almeno ${SC.benchmark.minN} aziende nel benchmark congelato` : 'il benchmark della sessione non è ancora stato congelato'}. Il confronto comparirà nella versione successiva del report.`;
  // righe etichetta / valore, come una tabella a due colonne
  const kv = (rows, lw = 150) => {
    for (const [k, v] of rows) {
      doc.font('Body').fontSize(8.4);
      const h = Math.max(doc.heightOfString(String(k), { width: lw - 10 }), doc.heightOfString(String(v), { width: W - lw })) + 7;
      ensure(h);
      const y = doc.y;
      doc.font('Semi').fontSize(8.2).fillColor(C.ink3).text(String(k), X0, y + 3.5, { width: lw - 10 });
      doc.font('Body').fontSize(8.4).fillColor(C.ink).text(String(v), X0 + lw, y + 3.5, { width: W - lw });
      doc.y = y + h;
      doc.moveTo(X0, doc.y).lineTo(X0 + W, doc.y).lineWidth(0.4).strokeColor(C.line).stroke();
    }
  };
  const dIt = (s) => (s ? new Date(s).toLocaleDateString('it-IT') : '—');
  const benchTxt = (b) => (!b ? 'benchmark non ancora congelato' : !b.available ? `benchmark non disponibile (N=${b.n}, servono almeno ${SC.benchmark.minN} aziende)`
    : `mediana ${n1(b.median)} · 1°–3° quartile ${n1(b.q1)}–${n1(b.q3)} · N=${b.n} · ${b.label}${b.looApplied ? '' : ' · azienda inclusa (campione residuo < 5)'}`);

  // ---------- Copertina ----------
  doc.rect(0, 0, doc.page.width, 196).fill(C.deep);
  doc.rect(0, 196, doc.page.width, 4).fill(C.gold);
  logo(X0 + W - 56, 40, 56, '#FFFFFF');
  doc.font('Semi').fontSize(10).fillColor(C.gold).text(`AI Transformation & Adoption Map · ${R.final ? 'report unificato dopo l\'allineamento finale' : 'report riservato'}`, X0, 44, { width: W - 90 });
  doc.font('Display').fontSize(28).fillColor('#FFFFFF').text(R.company.name, X0, 62, { width: W - 90 });
  doc.font('Body').fontSize(10.5).fillColor('#DCE3EE')
    .text(`Perimetro valutato: ${R.company.perimeter || 'non indicato'}   ·   Dimensioni misurate: ${R.dimsComplete}/8`, X0, doc.y + 6, { width: W })
    .text(`Sessioni: ${R.sessions.map((s) => s.title).join(', ') || '—'}`, { width: W })
    .text(`Generato il ${dateIt(R.generatedAt)} · Strumento V${R.instrumentVersion} · scoring ${R.scoringVersion}`, { width: W });
  doc.fontSize(8.5).fillColor('#AFC0D6').text(`Benchmark: ${[...new Set(Object.values(R.benchVersions))].join(' · ') || 'nessuna versione congelata'}`, { width: W });
  doc.y = 216;
  if (R.draft || R.snapshot) {
    const txt = R.draft ? 'Bozza: versione calcolata ora, non ancora rilasciata all\'azienda.' : `Versione rilasciata v${R.snapshot.version} · ${R.snapshot.sessionTitle} · ${dateIt(R.snapshot.releasedAt)}`;
    doc.rect(X0, doc.y, W, 22).fill(R.draft ? '#FBF1DF' : '#E3F3EA'); doc.rect(X0, doc.y, 3, 22).fill(R.draft ? C.warn : C.ok);
    doc.font('Bold').fontSize(9).fillColor(R.draft ? '#6E4A10' : '#1B6B45').text(txt, X0 + 11, doc.y + 6.5);
    doc.y += 28;
  }
  if (R.preview) {
    doc.rect(X0, doc.y, W, 22).fill('#FFF3D6');
    doc.font('Bold').fontSize(9).fillColor('#5E4507').text('Ambiente di prova: confronto calcolato sui dati dimostrativi. Non è un report ufficiale.', X0 + 8, doc.y + 6.5);
    doc.y += 30;
  }
  explain('Come leggere il report. La Map descrive la capacità dell\'azienda di trasformare l\'AI in pratica governata, adottata e scalabile. Non è una graduatoria e non esiste un livello giusto in assoluto. La lettura principale è la coerenza tra le capacità: livelli bassi ma allineati possono indicare un percorso coerente, mentre una forte distanza tra una capacità e quella da cui dipende segnala un punto da esaminare. Il benchmark confronta l\'azienda con le altre aziende AITO (non con il mercato), esclude l\'azienda stessa quando il campione lo consente e indica sempre su quante aziende si basa.');

  // ---------- Allineamento finale (§14.1): spostamenti rispetto alle sessioni ----------
  const AL = R.alignment;
  const sh = (x) => (x == null ? '—' : x === 0 ? 'invariato' : `${x > 0 ? '+' : '−'}${n1(Math.abs(x))}`);
  if (AL) {
    h2('Allineamento finale: che cosa è cambiato', 160);
    explain(`L'azienda ha rivisto le capacità misurate nelle quattro sessioni, confermandole o modificandole con un'evidenza. I valori delle sessioni non sono stati sovrascritti: accanto a ciascuno c'è il valore allineato e lo spostamento. Le sezioni seguenti usano i valori allineati.`);
    para(`${AL.reviewed} di ${AL.total} capacità riviste · ${AL.changed} ${AL.changed === 1 ? 'modificata' : 'modificate'}${AL.confirmedAt ? ` · confermato il ${dateIt(AL.confirmedAt.replace(' ', 'T') + 'Z')}` : ' · non ancora confermato'}${AL.overallBefore != null ? ` · indicatore complessivo da ${n1(AL.overallBefore)} a ${n1(AL.overallAfter)}` : ''}`, { size: 8.6, bold: true });
    doc.moveDown(0.4);
    // tabella per dimensione
    const cols = [[X0, 'Dimensione', 210], [X0 + 220, 'In sessione', 70], [X0 + 300, 'Allineamento', 80], [X0 + 390, 'Spostamento', 90]];
    const row = (vals, bold) => {
      ensure(16); const y = doc.y;
      vals.forEach((v, i) => doc.font(bold || i === 2 ? 'Semi' : 'Body').fontSize(8.4).fillColor(i === 3 && /^\+/.test(v) ? C.ok : i === 3 && /^−/.test(v) ? C.risk : bold ? C.ink3 : C.ink).text(v, cols[i][0], y + 3, { width: cols[i][2] }));
      doc.y = y + 15; doc.moveTo(X0, doc.y).lineTo(X0 + W, doc.y).lineWidth(0.4).strokeColor(C.line).stroke();
    };
    row(cols.map((c) => c[1]), true);
    for (const d of AL.dims) row([`${d.id} · ${d.name}`, n1(d.before), n1(d.after), d.before == null ? '—' : sh(d.shift)]);
    doc.moveDown(0.8);
    doc.font('Bold').fontSize(10).fillColor(C.deep).text('Per capacità', X0, doc.y, { width: W }); doc.moveDown(0.3);
    for (const i of AL.items) {
      const ev = i.evidence ? `Evidenza: ${i.evidence}` : i.action === 'conferma' ? 'Confermato' : '';
      doc.font('Body').fontSize(8);
      const hEv = doc.heightOfString(ev, { width: W - 258 }) + 10;
      doc.font('Bold').fontSize(8.6); const hT = doc.heightOfString(`${i.itemId} ${i.title}`, { width: 160 }) + 18;
      const h = Math.max(32, hEv, hT);
      ensure(h + 2); const y = doc.y;
      doc.moveTo(X0, y).lineTo(X0 + W, y).lineWidth(0.4).strokeColor(C.line).stroke();
      doc.font('Bold').fontSize(8.6).fillColor(C.ink).text(`${i.itemId} ${i.title}`, X0, y + 4, { width: 160 });
      doc.font('Body').fontSize(7.4).fillColor(C.ink3).text(`Dim. ${i.dimension} · ${i.session}`, X0, doc.y + 1, { width: 160 });
      doc.font('Semi').fontSize(9).fillColor(C.ink).text(`${i.before ? lvl(i.before.level, i.before.sub) : '—'}  »  ${i.after ? lvl(i.after.level, i.after.sub) : '—'}`, X0 + 168, y + 4, { width: 80 });
      doc.font('Bold').fontSize(8.6).fillColor(i.shift > 0 ? C.ok : i.shift < 0 ? C.risk : C.ink3).text(i.after ? sh(i.shift) : '—', X0 + 168, y + 17, { width: 80 });
      doc.font('Body').fontSize(8).fillColor(C.ink2).text(ev, X0 + 258, y + 4, { width: W - 258 });
      doc.y = y + h;
    }
  }

  // ---------- 1 · Profilo ----------
  h2('1 · Il profilo AI rispetto ai peer');
  const yTop = doc.y;
  const radarSvg = radar(R.dims.map((d) => ({ id: d.id, score: d.score, peer: d.bench?.available ? d.bench.median : null })), { size: 300 });
  svg(radarSvg, X0 - 6, yTop, 215, 205);
  doc.font('Body').fontSize(7.5);
  doc.rect(X0 + 30, yTop + 210, 8, 8).fill(C.navy); doc.fillColor(C.ink2).text('Azienda', X0 + 42, yTop + 210);
  const anyDimBench = R.dims.some((d) => d.bench?.available), anyItemBench = R.items.some((it) => it.bench?.available);
  if (anyDimBench) { doc.rect(X0 + 95, yTop + 210, 8, 8).fill(C.teal); doc.fillColor(C.ink2).text('Mediana delle altre aziende', X0 + 107, yTop + 210); }
  // tabella dimensioni
  const tx = X0 + 222, tw = W - 222;
  let y = yTop;
  doc.font('Semi').fontSize(7.8).fillColor(C.ink3);
  doc.text('Dimensione', tx, y); doc.text('Score', tx + 128, y, { width: 34, align: 'right' }); if (anyDimBench) doc.text('Peer', tx + 166, y, { width: 34, align: 'right' }); doc.text('Fascia', tx + 210, y);
  y += 12;
  for (const d of R.dims) {
    doc.font('Body').fontSize(8.4);
    const hName = doc.heightOfString(d.name, { width: 108 });
    const rowH = Math.max(17, hName + 7);
    doc.moveTo(tx, y - 2).lineTo(tx + tw, y - 2).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.roundedRect(tx, y + 1, 13, 13, 3).fill(d.score == null ? '#B9C2CE' : C.deep);
    doc.font('Bold').fontSize(7.5).fillColor('#FFFFFF').text(d.id, tx, y + 3.6, { width: 13, align: 'center' });
    doc.font('Body').fontSize(8.4).fillColor(C.ink).text(d.name, tx + 17, y + 2.6, { width: 108 });
    doc.font('Bold').fontSize(9).fillColor(C.ink).text(n1(d.score), tx + 128, y + 2.6, { width: 34, align: 'right' });
    if (anyDimBench) doc.font('Body').fontSize(8).fillColor(C.ink2).text(d.bench?.available ? n1(d.bench.median) : '—', tx + 166, y + 3, { width: 34, align: 'right' });
    if (d.score != null) { const b = E.band(d.score); doc.font('Bold').fontSize(7.4); const bw = doc.widthOfString(b.name) + 10; doc.roundedRect(tx + 210, y + 1.5, bw, 12, 6).fill(BAND_BG[b.id]); doc.fillColor(BAND_COLOR[b.id]).text(b.name, tx + 215, y + 4, { lineBreak: false }); }
    else doc.font('Body').fontSize(7).fillColor(C.ink3).text(I.sessions.find((s) => s.id === d.session).name, tx + 210, y + 3.5, { width: tw - 210 });
    y += rowH;
  }
  doc.font('Body').fontSize(7.6).fillColor(C.ink3).text('Fasce del pilot: Fondativa < 44 · In costruzione 44–69 · Consolidata da 70. Le dimensioni non ancora misurate restano N.D. e non sono disegnate come zero.', tx, y + 2, { width: tw });
  if (R.overall != null) doc.font('Semi').fontSize(8.4).fillColor(C.ink2).text(`Indicatore sintetico complessivo (lettura secondaria, Map completa): ${n1(R.overall)}`, tx, doc.y + 4, { width: tw });
  doc.y = Math.max(yTop + 226, doc.y + 4);

  // ---------- 2 · Coerenza ----------
  h2('2 · Lettura di coerenza', 200);
  explain(`Ogni regola confronta una capacità abilitante con una capacità che ne dipende. Se l'abilitante è più avanti è prudenza; se la dipendente è più avanti di almeno ${SC.coherenceThreshold} punti (due livelli pieni) è un punto da esaminare nella call con il leader. La soglia è un'ipotesi del pilot.`);
  if (!R.coherence.length) para('Nessuna regola ancora leggibile con i dati disponibili.', { color: C.ink3 });
  for (const c of R.coherence) {
    ensure(46);
    const st = c.flagged ? ['da esaminare', C.risk] : c.comparisons.some((x) => x.status === 'prudenza') ? ['prudenza', C.teal] : ['coerente', C.ok];
    const y0 = doc.y;
    doc.font('Bold').fontSize(9.6).fillColor(C.ink).text(`${c.id} · ${c.label}`, X0, y0, { continued: false });
    tag(st[0], st[1], X0 + doc.widthOfString(`${c.id} · ${c.label}`) + 8, y0 - 0.5);
    doc.y = y0 + 13;
    for (const x of c.comparisons) para(x.available ? `${x.enabler} ${n1(x.enablerScore)}  »  ${c.dependent} ${n1(x.dependentScore)}   (scarto ${x.diff > 0 ? '+' : ''}${n1(x.diff)})${x.status === 'da_esaminare' ? '  · da esaminare' : ''}` : `${x.enabler} » ${c.dependent}: non ancora disponibile (abilitante N.D.)`, { size: 8, color: C.ink2 });
    if (c.flagged) para(`Segnale: ${c.signal}`, { size: 8 });
    if (c.crossSession) para('Confronta dimensioni misurate in sessioni diverse.', { size: 7.5, color: C.ink3 });
    doc.moveDown(0.4);
  }
  if (R.coherencePending.length) para(`Regole che si attiveranno nelle prossime sessioni: ${R.coherencePending.join(', ')}.`, { size: 7.5, color: C.ink3 });
  if (R.usoDirezione) {
    doc.moveDown(0.3);
    para(`Uso e direzione. Quota di persone che usano l'AI ogni settimana: ${n1(R.usoDirezione.uso)}%; direzione strategica (Q1): livello ${R.usoDirezione.q1}.${R.usoDirezione.q1 <= 2 ? ' Una direzione ancora informale accanto a un uso già presente indica una pratica che può precedere la strategia: da discutere.' : ''} (Lettura qualitativa: la nota non fissa una soglia.)`, { size: 8 });
  }

  // ---------- 3 · Item ----------
  h2('3 · Capacità per item e confronto con il benchmark', 190);
  explain(`Il numero è il livello consolidato in sala, la lettera la sotto-opzione scelta con una scelta forzata tra fatti osservabili. Lo stesso "2B" non vale lo stesso in tutti gli item (dipende da quante sotto-opzioni ha il livello), per questo è indicato anche il valore 0–100.${anyItemBench ? ' Nella barra: il punto blu è l\'azienda, la fascia azzurra va dal primo al terzo quartile delle altre aziende, il trattino è la mediana.' : ''}`);
  if (!anyItemBench) { para(noBench('Confronto con il benchmark'), { size: 8.2, color: C.ink3 }); doc.moveDown(0.4); }
  for (const it of R.items) {
    const desc = `${it.descriptor || ''}${it.subText ? `\n${it.subText}` : ''}${it.override ? `\nOverride: ${it.overrideReason || ''}` : ''}`;
    doc.font('Body').fontSize(8.3);
    const hDesc = doc.heightOfString(desc, { width: 215, lineGap: 1 });
    doc.font('Bold').fontSize(9);
    const hLeft = doc.heightOfString(`${it.itemId} ${it.title}`, { width: 120 }) + 22 + (it.valoriale ? 16 : 0) + 10;
    const h = Math.max(52, hLeft, hDesc + 26);
    ensure(h + 4);
    const y0 = doc.y;
    doc.moveTo(X0, y0).lineTo(X0 + W, y0).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.font('Bold').fontSize(9).fillColor(C.ink).text(`${it.itemId} ${it.title}`, X0, y0 + 5, { width: 120 });
    doc.font('Body').fontSize(7.6).fillColor(C.ink3).text(`Dim. ${it.dimension} · ${it.kind === 'allineato' ? 'modificato nell\'allineamento finale' : it.confidence || ''}`, X0, doc.y + 1, { width: 120 });
    if (it.kind !== 'allineato') doc.text(`${it.validN} ${it.validN === 1 ? 'risposta valida' : 'risposte valide'} · ${it.ndN} N.D.`, X0, doc.y, { width: 120 });
    if (it.valoriale) tag('valoriale', '#F5EDD3', X0, doc.y + 2, C.goldInk);
    doc.font('Display').fontSize(15).fillColor(C.deep).text(lvl(it.level, it.sub), X0 + 126, y0 + 3, { width: 36 });
    doc.font('Body').fontSize(8).fillColor(C.ink2).text(n1(it.score), X0 + 126, y0 + 22, { width: 36 });
    doc.font('Body').fontSize(8.3).fillColor(C.ink).text(desc, X0 + 166, y0 + 5, { width: 215, lineGap: 1 });
    if (it.bench?.available) {
      svg(benchStrip(it.bench, it.score, { w: 220, h: 26 }), X0 + W - 118, y0 + 4, 118, 14);
      doc.font('Body').fontSize(7.3).fillColor(C.ink2).text(benchTxt(it.bench), X0 + W - 118, y0 + 22, { width: 118, lineGap: 0.5 });
    } else if (anyItemBench) doc.font('Body').fontSize(7.3).fillColor(C.ink3).text(benchTxt(it.bench), X0 + W - 118, y0 + 6, { width: 118, lineGap: 0.5 });
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
      doc.font('Bold').fontSize(9).fillColor(C.ink).text(`${d.id} · ${d.name}`, X0 + 285, yy, { width: W - 285 });
      doc.font('Body').fontSize(8.5).fillColor(C.ink2).text(`${d.quadrant.name} · scarto dalla mediana ${d.quadrant.delta > 0 ? '+' : ''}${n1(d.quadrant.delta)}`, X0 + 285, doc.y + 1, { width: W - 285 });
      doc.text(benchTxt(d.bench), X0 + 285, doc.y + 1, { width: W - 285 });
      yy = doc.y + 8;
    }
    doc.y = Math.max(y0 + 206, yy);
  } else {
    para(noBench('Mappa e confronto per dimensione'), { size: 8.2, color: C.ink3 });
  }

  // ---------- La dimensione nella community (§10.3, §10.4) ----------
  const comm = R.dims.filter((d) => d.community);
  if (comm.length) {
    ensure(90);
    doc.moveDown(0.6);
    doc.font('Bold').fontSize(10).fillColor(C.deep).text('La dimensione nella community', X0, doc.y, { width: W });
    doc.moveDown(0.2);
    para('Se il bisogno è condiviso da molte aziende e se ci sono aziende da cui imparare. Dati aggregati, senza nomi di altre aziende.', { size: 7.8, color: C.ink3 });
    doc.moveDown(0.2);
    kv(comm.map((d) => [`${d.id} · ${d.name}`,
      `Bisogno: ${d.community.gapQuadrant} (${Math.round(d.community.fondShare * 100)}% in Fondativa, eterogeneità ${n1(d.community.iqr)} punti).  Con chi accelerare: ${d.community.peerQuadrant} (${d.community.need} con questa priorità, ${d.community.contrib} contributor potenziali).`]), 150);
  }

  // ---------- 5 · Priorità ----------
  h2('5 · Priorità e commitment');
  if (R.finalPriorities?.length) {
    explain('Le tre priorità finali, scelte dall\'azienda nell\'allineamento finale.');
    R.finalPriorities.forEach((p, i) => para(`${i + 1}. ${p.id} · ${p.name} (${n1(p.score)})`, { size: 8.8, bold: true }));
    if (R.finalPrioritiesNote) para(R.finalPrioritiesNote, { size: 8.4, color: C.ink2 });
  } else if (R.mapComplete) {
    explain('Tre priorità provvisorie, confermate dopo l\'allineamento finale di settembre 2027. L\'ordine proposto segue la nota: prima riportare a coerenza, poi i prerequisiti fondativi, poi le dimensioni sotto 70 e sotto la mediana peer. È una proposta trasparente, che non sostituisce il giudizio dell\'azienda.');
    R.priorities.slice(0, 3).forEach((p, i) => para(`${i + 1}. ${p.dimension} · ${p.name} (${n1(p.score)}) — ${p.reasons.join('; ') || 'nessun segnale specifico'}`, { size: 8.5 }));
  } else {
    para(`Le tre priorità complessive si calcolano a Map completa (${R.dimsComplete}/8 dimensioni misurate finora). In ogni sessione l'azienda sceglie la propria priorità e il commitment, riportati qui sotto.`, { size: 8.5, color: C.ink2 });
  }
  doc.moveDown(0.4);
  if (!R.commitments.length) para('Nessun commitment registrato.', { color: C.ink3 });
  for (const c of R.commitments) {
    ensure(90);
    doc.font('Bold').fontSize(9.4).fillColor(C.deep).text(`${c.session_title}: ${c.priority_item} ${I.items[c.priority_item]?.title || ''}`, X0, doc.y, { width: W });
    doc.y += 3;
    kv([['Azione', c.action || '—'], ['Owner', c.owner || '—'], ['Scadenza', dIt(c.due_date)], ['KPI / evidenza', c.kpi || '—'],
      ['Stato', `${c.status || 'aperto'}${c.status_note ? ` · ${c.status_note}` : ''}`], ...(c.peer_interest ? [['Community', 'interesse a un confronto con altre aziende']] : [])], 110);
    doc.moveDown(0.8);
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
    doc.moveDown(0.2);
    kv(prof.map((p) => [p.q, `${p.value}${typeof p.value === 'number' ? '%' : ''}`]), 300);
  }

  // ---------- Note ----------
  h2('Note metodologiche e limiti');
  para(`Autovalutazione strutturata e consolidamento aziendale: non è un audit né una certificazione. Il benchmark è "indicativo" sotto le ${SC.benchmark.stableN} aziende e non è mostrato sotto le ${SC.benchmark.minN}; i sotto-livelli si mostrano solo con almeno ${SC.benchmark.subLevelMinN} aziende per categoria. Le soglie (fasce 44/70, coerenza ${SC.coherenceThreshold} punti, quadranti) e i nomi dei quadranti sono quelli in uso nel pilot. Le regole di coerenza che confrontano sessioni diverse si discutono nella call con il leader. Le dimensioni misurate in sessioni diverse possono riflettere partecipanti diversi; a settembre 2027 l'allineamento finale le riporta a una data unica. Il benchmark usato è una versione congelata: i report consegnati non cambiano.`, { size: 8, color: C.ink2 });

  // ---------- Appendice: trascrizione integrale della call con il leader ----------
  for (const k of R.calls || []) {
    doc.addPage();
    h2(`Appendice · Call con il leader · ${k.session_title}`);
    para(`Trascrizione integrale${k.call_date ? ` della call del ${k.call_date.split('-').reverse().join('/')}` : ''}, così come esportata da Teams.`, { size: 8, color: C.ink3 });
    doc.moveDown(0.4);
    para(k.transcript, { size: 8, color: C.ink2 });
  }

  // ---------- Piè di pagina ----------
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc.moveTo(X0, doc.page.height - 44).lineTo(X0 + W, doc.page.height - 44).lineWidth(0.5).strokeColor(C.line).stroke();
    logo(X0, doc.page.height - 38.5, 11, C.ink3);
    doc.font('Body').fontSize(7.5).fillColor(C.ink3)
      .text(`AI Transformation & Adoption Map · ${R.company.name} · riservato`, X0 + 16, doc.page.height - 36, { width: W - 80, lineBreak: false })
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

export const pdfFileName = (R) => `AITO_Map_${R.final ? 'unificato_' : ''}${R.snapshot ? `v${R.snapshot.version}_` : ''}${R.company.name.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '')}_${R.generatedAt.slice(0, 10)}.pdf`;
