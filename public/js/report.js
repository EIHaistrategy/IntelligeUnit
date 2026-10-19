import { api, esc, $, fmtScore, fmtNum, fmtDate, bandTag, levelLabel } from './ui.js';
import { radar, whereMap, benchStrip } from './charts.js';

const cid = location.pathname.split('/').pop();
const params = new URLSearchParams(location.search);
const t = params.get('t');
const preview = params.get('preview') === '1';
const app = $('#app');

async function boot() {
  const { instrument: I, scoring: SC } = await api('/api/instrument');
  let R;
  try { R = await api(`/api/report/${cid}?${t ? `t=${encodeURIComponent(t)}&` : ''}${preview ? 'preview=1' : ''}`); }
  catch (e) { app.innerHTML = `<div class="card"><h2>Report non disponibile</h2><p>${esc(e.message)}</p></div>`; return; }
  if (!t) { $('#prevwrap').classList.remove('hidden'); $('#prev').checked = preview; $('#prev').onchange = (e) => { params.set('preview', e.target.checked ? '1' : '0'); location.search = params.toString(); }; }

  const names = SC.quadrantNames[SC.quadrantNamesInUse];
  const fnLabel = (id) => I.functions.find((f) => f.id === id)?.label || id;
  const benchTxt = (b) => (!b ? '<span class="muted">benchmark non ancora congelato</span>'
    : !b.available ? `<span class="muted">non disponibile (N=${b.n}, servono almeno ${SC.benchmark.minN} aziende)</span>`
    : `mediana <b>${fmtScore(b.median)}</b> · Q1–Q3 ${fmtScore(b.q1)}–${fmtScore(b.q3)} · N=${b.n} <span class="tag ${b.code === 'STAB' ? 'ok' : 'warn'}">${b.label}</span>${b.looApplied ? '' : ' <span class="small muted">(azienda inclusa: campione residuo &lt; 5)</span>'}`);

  const radarDims = R.dims.map((d) => ({ id: d.id, score: d.score, peer: d.bench?.available ? d.bench.median : null }));
  const wherePts = R.dims.filter((d) => d.quadrant).map((d) => ({ id: d.id, score: d.score, delta: d.quadrant.delta }));
  const flagged = R.coherence.filter((c) => c.flagged);

  app.innerHTML = `
  ${R.preview ? '<div class="banner preview">ANTEPRIMA: il benchmark include aziende DEMO e TEST. Non è un report ufficiale.</div>' : ''}
  <div class="cover"><div class="gold">AI TRANSFORMATION &amp; ADOPTION MAP · REPORT RISERVATO</div>
    <h1>${esc(R.company.name)}</h1>
    <div>Perimetro: ${esc(R.company.perimeter || 'non indicato')} · Dimensioni misurate: <b>${R.dimsComplete}/8</b> · Generato il ${fmtDate(R.generatedAt)}</div>
    <div class="small" style="opacity:.8;margin-top:6px">Strumento V${esc(R.instrumentVersion)} · scoring ${esc(R.scoringVersion)} · Benchmark: ${[...new Set(Object.values(R.benchVersions))].map(esc).join(' · ') || 'nessuna versione congelata'}</div>
  </div>

  <div class="card"><h2>Come leggere questo report</h2>
    <p class="small ink2">La Map descrive la capacità dell'azienda di trasformare l'AI in pratica governata, adottata e scalabile. Non è una graduatoria e non esiste un livello giusto in assoluto. La lettura principale è la <b>coerenza tra le capacità</b>: livelli bassi ma allineati possono indicare un percorso coerente, mentre una forte distanza tra una capacità e quella da cui dipende segnala un punto da esaminare. Il benchmark confronta l'azienda con le altre aziende AITO (non con il mercato) e indica sempre su quante aziende si basa.</p>
  </div>

  <div class="card"><h2>1 · Il profilo AI</h2>
    <div class="grid c2"><div class="chart">${radar(radarDims)}<div class="legend"><span><i style="background:#005172"></i>Azienda</span><span><i style="background:#1FB5B8"></i>Mediana peer</span></div></div>
    <div><table><thead><tr><th>Dimensione</th><th class="num">Score</th><th>Fascia</th></tr></thead><tbody>
      ${R.dims.map((d) => `<tr><td><span class="dim-letter">${d.id}</span>${esc(d.name)}</td><td class="num"><b>${fmtScore(d.score)}</b></td><td>${d.score == null ? `<span class="muted small">${esc(I.sessions.find((s) => s.id === d.session).name)}</span>` : bandTag(d.score, SC)}</td></tr>`).join('')}
    </tbody></table>
    <p class="small muted" style="margin-top:8px">Fasce del pilot: Fondativa &lt; 44 · In costruzione 44–69 · Consolidata ≥ 70. Una dimensione ha uno score solo quando entrambi i suoi item sono consolidati; le altre restano N.D. e non sono disegnate come zero.
    ${R.overall != null ? `<br>Indicatore sintetico complessivo (lettura secondaria, Map completa): <b>${fmtScore(R.overall)}</b>` : ''}</p></div></div>
  </div>

  <div class="card"><h2>2 · Lettura di coerenza</h2>
    <div class="explain">Ogni regola confronta una capacità abilitante con una capacità che ne dipende. Se l'abilitante è più avanti è prudenza; se la dipendente è più avanti di almeno ${SC.coherenceThreshold} punti (due livelli pieni) è un rischio da esaminare nella call con il leader. La soglia è un'ipotesi del pilot.</div>
    ${R.coherence.length ? R.coherence.map((c) => `<div style="margin-bottom:10px"><b>${c.id} · ${esc(c.label)}</b> ${c.flagged ? '<span class="tag risk">da esaminare</span>' : c.comparisons.some((x) => x.status === 'prudenza') ? '<span class="tag teal">prudenza</span>' : '<span class="tag ok">coerente</span>'}
      ${c.crossSession ? '<span class="tag">confronta sessioni diverse: da validare nella call</span>' : ''}
      <div class="small ink2">${c.comparisons.map((x) => `${esc(x.enabler)} ${fmtScore(x.enablerScore)} → ${esc(c.dependent)} ${fmtScore(x.dependentScore)} (scarto ${x.diff > 0 ? '+' : ''}${fmtNum(x.diff)})`).join('<br>')}</div>
      ${c.flagged ? `<div class="small">Segnale: ${esc(c.signal)}</div>` : ''}</div>`).join('') : '<p class="muted">Nessuna regola ancora leggibile.</p>'}
    ${R.coherencePending.length ? `<p class="small muted">Regole che si attiveranno nelle prossime sessioni: ${R.coherencePending.join(', ')}.</p>` : ''}
    ${R.usoDirezione ? `<p class="small"><b>Uso e direzione.</b> Quota di persone che usano l'AI ogni settimana: <b>${fmtNum(R.usoDirezione.uso)}%</b>; direzione strategica (Q1): livello <b>${R.usoDirezione.q1}</b>. ${R.usoDirezione.q1 <= 2 ? 'Una direzione ancora informale accanto a un uso già presente indica una pratica che può precedere la strategia: da discutere.' : ''} <span class="muted">(Lettura qualitativa: la nota non fissa una soglia.)</span></p>` : ''}
  </div>

  <div class="card pb"><h2>3 · Capacità per item</h2>
    <div class="explain">Il livello è la scelta consolidata in sala; la lettera è la sotto-opzione scelta con una scelta forzata tra fatti osservabili. Lo stesso "2B" non vale lo stesso in tutti gli item (dipende da quante sotto-opzioni ha il livello), per questo è indicato anche il valore numerico.</div>
    <div class="tablewrap"><table><thead><tr><th>Item</th><th>Posizione</th><th class="num">Score</th><th>Qualità del dato</th><th>Benchmark AITO</th></tr></thead><tbody>
    ${R.items.map((it) => `<tr><td><b>${esc(it.itemId)}</b> ${esc(it.title)}<div class="small muted">Dim. ${it.dimension}</div></td>
      <td><b>${levelLabel(it.level, it.sub)}</b> ${it.valoriale ? '<span class="tag gold">valoriale</span>' : ''}<div class="small">${esc(it.descriptor || '')}${it.subText ? `<br><i>${esc(it.subText)}</i>` : ''}</div>
        ${it.override ? `<div class="small"><span class="tag warn">override</span> ${esc(it.overrideReason || '')}</div>` : ''}</td>
      <td class="num"><b>${fmtScore(it.score)}</b></td>
      <td class="small">${esc(it.confidence || '')}<br><span class="muted">${it.validN} risposte valide · ${it.ndN} N.D. · range ${it.range ?? '—'}</span></td>
      <td class="small">${benchStrip(it.bench, it.score)}<br>${benchTxt(it.bench)}</td></tr>`).join('')}
    </tbody></table></div>
  </div>

  <div class="card"><h2>4 · Dove intervenire</h2>
    <div class="explain">Ogni punto è una dimensione completa. Orizzontale: lo score dell'azienda. Verticale: quanto è sopra (+) o sotto (−) la mediana delle altre aziende. Essere sopra la mediana non significa essere consolidati: la linea verticale a 70 separa le capacità consolidate.</div>
    ${wherePts.length ? `<div class="grid c2"><div class="chart">${whereMap(wherePts, { names })}</div><div><table><tbody>${R.dims.filter((d) => d.quadrant).map((d) => `<tr><td><span class="dim-letter">${d.id}</span>${esc(d.name)}</td><td><b>${esc(d.quadrant.name)}</b><div class="small muted">nome alternativo proposto: ${esc(d.quadrant.altName)}</div></td><td class="num">${d.quadrant.delta > 0 ? '+' : ''}${fmtNum(d.quadrant.delta)}</td></tr>`).join('')}</tbody></table></div></div>`
      : '<p class="muted">La mappa richiede un benchmark disponibile (almeno 5 aziende) per le dimensioni misurate.</p>'}
    <table style="margin-top:10px"><thead><tr><th>Dimensione</th><th>Benchmark</th></tr></thead><tbody>${R.dims.filter((d) => d.score != null).map((d) => `<tr><td>${d.id} ${esc(d.name)}</td><td class="small">${benchStrip(d.bench, d.score)}<br>${benchTxt(d.bench)}</td></tr>`).join('')}</tbody></table>
  </div>

  <div class="card"><h2>5 · Qualità del dato</h2>
    ${R.pairs.map((p) => `<p><b>${esc(p.session.title)}</b> · ${p.participants} partecipanti · funzioni: ${p.functions.map(fnLabel).map(esc).join(', ') || '—'}</p>
      <ul class="small">${p.pairs.map((x) => `<li>Confronto ${esc(x.a)} vs ${esc(x.b)}: ${x.counts.A} per ${esc(x.a)}, ${x.counts.B} per ${esc(x.b)}, ${x.counts.ND} N.D.${x.discordant ? ` — <b>${x.discordant}</b> ${x.discordant === 1 ? 'risposta' : 'risposte'} in contrasto con i livelli dati dalla stessa persona` : ''}</li>`).join('')}</ul>`).join('') || '<p class="muted">—</p>'}
    <p class="small muted">I confronti a coppie sono un controllo di qualità interno: non entrano nel benchmark.</p>
  </div>

  <div class="card"><h2>6 · Priorità</h2>
    <div class="explain">L'ordine proposto segue la nota: prima riportare a coerenza, poi i prerequisiti fondativi, poi le dimensioni sotto 70 e sotto la mediana peer. È una proposta trasparente, non sostituisce il giudizio dell'azienda.</div>
    <ol>${R.priorities.slice(0, 3).map((p) => `<li><b>${p.dimension} · ${esc(p.name)}</b> (${fmtScore(p.score)}) — <span class="small">${esc(p.reasons.join('; ') || 'nessun segnale specifico')}</span></li>`).join('')}</ol>
    <h3>Commitment registrati</h3>
    ${R.commitments.length ? `<table><thead><tr><th>Sessione</th><th>Priorità</th><th>Azione</th><th>Owner</th><th>Scadenza</th><th>KPI / evidenza</th></tr></thead><tbody>
      ${R.commitments.map((c) => `<tr><td>${esc(c.session_title)}</td><td>${esc(c.priority_item)} ${esc(I.items[c.priority_item]?.title || '')}</td><td>${esc(c.action)}</td><td>${esc(c.owner)}</td><td>${esc(c.due_date)}</td><td>${esc(c.kpi)}${c.peer_interest ? '<br><span class="tag teal">interesse peer</span>' : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nessun commitment registrato.</p>'}
  </div>

  <div class="card"><h2>7 · Profilo di approccio</h2>
    <p class="small muted">Caratteristiche non ordinate: descrivono come l'azienda si trasforma, non quanto è avanti. Non entrano nello score.</p>
    ${Object.values(R.profile).length ? `<table><tbody>${Object.values(R.profile).map((p) => `<tr><td>${esc(p.q)}</td><td><b>${esc(p.value)}${typeof p.value === 'number' ? '%' : ''}</b></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Profilo non compilato.</p>'}
  </div>

  <div class="card"><h2>Note metodologiche e limiti</h2>
    <p class="small ink2">Autovalutazione strutturata e consolidamento aziendale, non audit né certificazione. Il benchmark è "indicativo" sotto le ${SC.benchmark.stableN} aziende e non è mostrato sotto le ${SC.benchmark.minN}; nel report l'azienda è esclusa dal proprio benchmark quando il campione residuo resta di almeno ${SC.benchmark.looMinResidual} aziende. Le soglie (fasce 44/70, coerenza ${SC.coherenceThreshold} punti, quadranti) sono ipotesi del pilot da ratificare. Le dimensioni misurate in sessioni diverse possono riflettere partecipanti diversi; a settembre 2027 l'allineamento finale le riporta a una data unica.</p>
  </div>`;
}
boot();
