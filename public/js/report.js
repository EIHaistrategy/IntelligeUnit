import { api, esc, $, fmtScore, fmtNum, fmtDate, bandTag, levelLabel, demoBar } from './ui.js';
import { radar, whereMap, benchStrip } from './charts.js';

const cid = location.pathname.split('/').pop();
const params = new URLSearchParams(location.search);
const t = params.get('t');
const app = $('#app');

async function boot() {
  const { instrument: I, scoring: SC } = await api('/api/instrument');
  let R;
  const fin = params.get('final') === '1' ? 'final=1&' : ''; // anteprima del report unificato (solo console ELIS)
  try { R = await api(`/api/report/${cid}?${t ? `t=${encodeURIComponent(t)}&` : ''}${fin}${params.get('snap') ? `snap=${params.get('snap')}` : ''}`); }
  catch (e) { app.innerHTML = `<div class="card"><h2>${e.network ? 'Connessione non disponibile' : 'Report non disponibile'}</h2><p>${esc(e.message)}</p>${e.network ? '<button onclick="location.reload()">Riprova</button>' : ''}</div>`; return; }
  const snap = params.get('snap');
  $('#pdfbtn').href = `/api/report/${cid}/pdf?${t ? `t=${encodeURIComponent(t)}&` : ''}${fin}${snap ? `snap=${snap}` : ''}`;
  const AL = R.alignment;
  const shiftTag = (x) => (x == null ? '—' : x === 0 ? '<span class="shift zero">invariato</span>' : `<span class="shift ${x > 0 ? 'up' : 'down'}">${x > 0 ? '▲ +' : '▼ '}${fmtScore(x).replace('-', '−')}</span>`);
  const alignHtml = AL ? `<div class="card"><h2>Allineamento finale: che cosa è cambiato</h2>
    <div class="explain">A settembre 2027 l'azienda ha rivisto le capacità misurate nelle quattro sessioni: le ha confermate o modificate indicando un'evidenza. I valori delle sessioni non sono stati sovrascritti: qui accanto a ciascuno c'è il valore allineato e lo spostamento. Tutte le sezioni seguenti usano i valori allineati.</div>
    <p class="small"><b>${AL.reviewed} di ${AL.total}</b> capacità riviste · <b>${AL.changed}</b> ${AL.changed === 1 ? 'modificata' : 'modificate'}${AL.confirmedAt ? ` · confermato il ${fmtDate(AL.confirmedAt)}` : ' · <span class="tag warn">non ancora confermato</span>'}${AL.overallBefore != null ? ` · indicatore complessivo ${fmtScore(AL.overallBefore)} → <b>${fmtScore(AL.overallAfter)}</b>` : ''}</p>
    <h3>Per dimensione</h3>
    <div class="tablewrap"><table><thead><tr><th>Dimensione</th><th class="num">In sessione</th><th class="num">Allineamento</th><th>Spostamento</th></tr></thead><tbody>
      ${AL.dims.map((d) => `<tr><td><span class="dim-letter">${d.id}</span>${esc(d.name)}</td><td class="num">${fmtScore(d.before)}</td><td class="num"><b>${fmtScore(d.after)}</b></td><td>${d.before == null ? '—' : shiftTag(d.shift)}</td></tr>`).join('')}
    </tbody></table></div>
    <h3>Per capacità</h3>
    <div class="tablewrap"><table><thead><tr><th>Capacità</th><th>Prima rilevazione</th><th>Allineamento</th><th>Spostamento</th><th>Evidenza</th></tr></thead><tbody>
      ${AL.items.map((i) => `<tr><td><b>${esc(i.itemId)}</b> ${esc(i.title)}<div class="small muted">Dim. ${i.dimension} · ${esc(i.session)}</div></td>
        <td>${i.before ? `<b>${levelLabel(i.before.level, i.before.sub)}</b> <span class="small muted">${fmtScore(i.before.score)}</span>` : '—'}</td>
        <td>${i.after ? `<b>${levelLabel(i.after.level, i.after.sub)}</b> <span class="small muted">${fmtScore(i.after.score)}</span>${i.action === 'conferma' ? '<div class="small muted">confermato</div>' : ''}` : '<span class="muted">non rivisto</span>'}</td>
        <td>${i.after ? shiftTag(i.shift) : '—'}</td><td class="small">${esc(i.evidence || '')}</td></tr>`).join('')}
    </tbody></table></div></div>` : '';

  const names = SC.quadrantNames[SC.quadrantNamesInUse];
  const fnLabel = (id) => I.functions.find((f) => f.id === id)?.label || id;
  const benchTxt = (b) => (!b ? '<span class="muted">benchmark non ancora congelato</span>'
    : !b.available ? `<span class="muted">non disponibile (N=${b.n}, servono almeno ${SC.benchmark.minN} aziende)</span>`
    : `mediana <b>${fmtScore(b.median)}</b> · 1°–3° quartile ${fmtScore(b.q1)}–${fmtScore(b.q3)} · N=${b.n}${b.looApplied ? '' : ' <span class="small muted">(azienda inclusa: campione residuo &lt; 5)</span>'}`);

  // l'affidabilità del benchmark (indicativo/stabile) si dice una volta nell'intestazione della colonna, non a ogni riga
  const stab = (list) => { const b = list.find((x) => x?.available); return b ? ` · ${esc(b.label.toLowerCase())}, N=${b.n}` : ''; };
  const radarDims = R.dims.map((d) => ({ id: d.id, score: d.score, peer: d.bench?.available ? d.bench.median : null }));
  const wherePts = R.dims.filter((d) => d.quadrant).map((d) => ({ id: d.id, score: d.score, delta: d.quadrant.delta }));
  const flagged = R.coherence.filter((c) => c.flagged);
  const anyItemBench = R.items.some((it) => it.bench?.available);
  const anyDimBench = R.dims.some((d) => d.bench?.available);
  const noBench = (what) => `<p class="note">${what}: ${Object.keys(R.benchVersions).length ? `servono almeno ${SC.benchmark.minN} aziende nel benchmark congelato` : 'il benchmark della sessione non è ancora stato congelato'}. Il confronto comparirà qui quando sarà disponibile.</p>`;
  const dDate = (s) => (s ? `<span class="nowrap">${new Date(s).toLocaleDateString('it-IT')}</span>` : '—');

  app.innerHTML = `
  ${R.preview ? (demoBar('report non ufficiale'), '') : ''}${R.draft ? `<div class="banner warn noprint">${['', R.draft ? '<b>Bozza</b>: versione calcolata ora, non ancora rilasciata; l\'azienda vede solo le versioni rilasciate, che non cambiano più.' : ''].filter(Boolean).join(' ')}</div>` : ''}
  ${R.snapshot ? `<div class="banner ok">Versione rilasciata v${R.snapshot.version} · ${esc(R.snapshot.sessionTitle)} · ${fmtDate(R.snapshot.releasedAt)}</div>` : ''}
  <div id="versions" class="noprint"></div>
  <div class="cover"><div class="eyebrow">AI Transformation &amp; Adoption Map · ${R.final ? 'report unificato dopo l\'allineamento finale' : 'report riservato'}</div>
    <h1>${esc(R.company.name)}</h1>
    <dl class="covermeta"><div><dt>Perimetro</dt><dd>${esc(R.company.perimeter || 'non indicato')}</dd></div><div><dt>Dimensioni misurate</dt><dd>${R.dimsComplete} di 8</dd></div><div><dt>Generato il</dt><dd>${fmtDate(R.generatedAt)}</dd></div></dl>
    <div class="small" style="color:#AFC0D6;margin-top:14px">Strumento V${esc(R.instrumentVersion)} · scoring ${esc(R.scoringVersion)} · Benchmark: ${[...new Set(Object.values(R.benchVersions))].map(esc).join(' · ') || 'nessuna versione congelata'}</div>
  </div>

  <div class="card"><h2>Come leggere questo report</h2>
    <p class="small ink2">La Map descrive la capacità dell'azienda di trasformare l'AI in pratica governata, adottata e scalabile. Non è una graduatoria e non esiste un livello giusto in assoluto. La lettura principale è la <b>coerenza tra le capacità</b>: livelli bassi ma allineati possono indicare un percorso coerente, mentre una forte distanza tra una capacità e quella da cui dipende segnala un punto da esaminare. Il benchmark confronta l'azienda con le altre aziende AITO (non con il mercato) e indica sempre su quante aziende si basa.</p>
  </div>

  ${alignHtml}

  <div class="card"><h2><span class="secnum">1</span>Il profilo AI</h2>
    <div class="grid c2"><div class="chart">${radar(radarDims)}<div class="legend"><span><i style="background:#005172"></i>Azienda</span>${anyDimBench ? '<span><i style="background:#1FB5B8"></i>Mediana delle altre aziende</span>' : ''}</div></div>
    <div><table><thead><tr><th>Dimensione</th><th class="num">Score</th><th>Fascia</th></tr></thead><tbody>
      ${R.dims.map((d) => `<tr><td><span class="dim-letter">${d.id}</span>${esc(d.name)}</td><td class="num"><b>${fmtScore(d.score)}</b></td><td>${d.score == null ? `<span class="muted small">${R.sessions.some((x) => x.base === d.session) ? 'nessuna visibilità (N.D.)' : `si misura a ${esc(I.sessions.find((s) => s.id === d.session).name)}`}</span>` : bandTag(d.score, SC)}</td></tr>`).join('')}
    </tbody></table>
    <p class="small muted" style="margin-top:8px">Fasce del pilot: Fondativa &lt; 44 · In costruzione 44–69 · Consolidata ≥ 70. Una dimensione ha uno score solo quando entrambi i suoi item sono consolidati; le altre restano N.D. e non sono disegnate come zero.
    ${R.overall != null ? `<br>Indicatore sintetico complessivo (lettura secondaria, Map completa): <b>${fmtScore(R.overall)}</b>` : ''}</p></div></div>
  </div>

  <div class="card"><h2><span class="secnum">2</span>Lettura di coerenza</h2>
    <div class="explain">Ogni regola confronta una capacità abilitante con una capacità che ne dipende. Se l'abilitante è più avanti è prudenza; se la dipendente è più avanti di almeno ${SC.coherenceThreshold} punti (due livelli pieni) è un rischio da esaminare nella call con il leader. La soglia è un'ipotesi del pilot.</div>
    ${R.coherence.length ? R.coherence.map((c) => `<div style="margin-bottom:10px"><b>${c.id} · ${esc(c.label)}</b> ${c.flagged ? '<span class="tag risk">da esaminare</span>' : c.comparisons.some((x) => x.status === 'prudenza') ? '<span class="tag teal">prudenza</span>' : '<span class="tag ok">coerente</span>'}
      ${c.crossSession ? '<div class="small muted">Confronta dimensioni misurate in sessioni diverse.</div>' : ''}
      <div class="small ink2">${c.comparisons.map((x) => x.available ? `${esc(x.enabler)} ${fmtScore(x.enablerScore)} → ${esc(c.dependent)} ${fmtScore(x.dependentScore)} (scarto ${x.diff > 0 ? '+' : ''}${fmtNum(x.diff)})${x.status === 'da_esaminare' ? ' <b>· da esaminare</b>' : ''}` : `${esc(x.enabler)} → ${esc(c.dependent)}: non ancora disponibile (abilitante N.D.)`).join('<br>')}</div>
      ${c.flagged ? `<div class="small">Segnale: ${esc(c.signal)}</div>` : ''}</div>`).join('') : '<p class="muted">Nessuna regola ancora leggibile.</p>'}
    ${R.coherencePending.length ? `<p class="small muted">Regole che si attiveranno nelle prossime sessioni: ${R.coherencePending.join(', ')}.</p>` : ''}
    ${R.usoDirezione ? `<p class="small"><b>Uso e direzione.</b> Quota di persone che usano l'AI ogni settimana: <b>${fmtNum(R.usoDirezione.uso)}%</b>; direzione strategica (Q1): livello <b>${R.usoDirezione.q1}</b>. ${R.usoDirezione.q1 <= 2 ? 'Una direzione ancora informale accanto a un uso già presente indica una pratica che può precedere la strategia: da discutere.' : ''} <span class="muted">(Lettura qualitativa: la nota non fissa una soglia.)</span></p>` : ''}
  </div>

  <div class="card pb"><h2><span class="secnum">3</span>Capacità per item</h2>
    <div class="explain">Il livello è la scelta consolidata in sala${R.final ? ' o, dove indicato, quella modificata nell\'allineamento finale' : ''}; la lettera è la sotto-opzione scelta con una scelta forzata tra fatti osservabili. Lo stesso "2B" non vale lo stesso in tutti gli item (dipende da quante sotto-opzioni ha il livello), per questo è indicato anche il valore numerico.</div>
    <div class="tablewrap"><table><thead><tr><th>Item</th><th>Posizione</th><th class="num">Score</th><th>Qualità del dato</th>${anyItemBench ? `<th>Benchmark AITO${stab(R.items.map((i) => i.bench))}</th>` : ''}</tr></thead><tbody>
    ${R.items.map((it) => `<tr><td><b>${esc(it.itemId)}</b> ${esc(it.title)}<div class="small muted">Dim. ${it.dimension}</div></td>
      <td><b>${levelLabel(it.level, it.sub)}</b> ${it.valoriale ? '<span class="tag gold">valoriale</span>' : ''}<div class="small">${esc(it.descriptor || '')}${it.subText ? `<br><i>${esc(it.subText)}</i>` : ''}</div>
        ${it.override ? `<div class="small"><span class="tag warn">override</span> ${esc(it.overrideReason || '')}</div>` : ''}</td>
      <td class="num"><b>${fmtScore(it.score)}</b></td>
      <td class="small">${it.kind === 'allineato' ? `<b>Modificato nell'allineamento finale</b><br><span class="muted">${esc(it.confidenceReason || '')}</span>` : `${esc(it.confidence || '')}<br><span class="muted">${it.validN} ${it.validN === 1 ? 'risposta valida' : 'risposte valide'} · ${it.ndN} N.D. · range ${it.range ?? '—'}</span>`}</td>
      ${anyItemBench ? `<td class="small">${it.bench?.available ? `${benchStrip(it.bench, it.score)}<br>` : ''}${benchTxt(it.bench)}</td>` : ''}</tr>`).join('')}
    </tbody></table></div>
    ${anyItemBench ? '' : noBench('Confronto con il benchmark')}
  </div>

  <div class="card"><h2><span class="secnum">4</span>Dove intervenire</h2>
    <div class="explain">Ogni punto è una dimensione completa. Orizzontale: lo score dell'azienda. Verticale: quanto è sopra (+) o sotto (−) la mediana delle altre aziende. Essere sopra la mediana non significa essere consolidati: la linea verticale a 70 separa le capacità consolidate.</div>
    ${wherePts.length ? `<div class="grid c2"><div class="chart">${whereMap(wherePts, { names })}</div><div><table><tbody>${R.dims.filter((d) => d.quadrant).map((d) => `<tr><td><span class="dim-letter">${d.id}</span>${esc(d.name)}</td><td><b>${esc(d.quadrant.name)}</b></td><td class="num">${d.quadrant.delta > 0 ? '+' : ''}${fmtNum(d.quadrant.delta)}</td></tr>`).join('')}</tbody></table></div></div>`
      : ''}
    ${anyDimBench ? `<div class="tablewrap" style="margin-top:10px"><table><thead><tr><th>Dimensione</th><th>Benchmark AITO${stab(R.dims.map((d) => d.bench))}</th></tr></thead><tbody>${R.dims.filter((d) => d.score != null).map((d) => `<tr><td>${d.id} ${esc(d.name)}</td><td class="small">${d.bench?.available ? `${benchStrip(d.bench, d.score)}<br>` : ''}${benchTxt(d.bench)}</td></tr>`).join('')}</tbody></table></div>` : noBench('Mappa e confronto per dimensione')}
  </div>

  ${R.dims.some((d) => d.community) ? `<div class="card"><h3>La dimensione nella community</h3>
    <div class="explain">Dove si colloca ogni dimensione nelle mappe di community della sessione: se il bisogno è condiviso da molte aziende e se ci sono aziende da cui imparare. Sono dati aggregati, senza nomi di altre aziende.</div>
    <div class="tablewrap"><table><thead><tr><th>Dimensione</th><th>Il bisogno è individuale o condiviso?</th><th>Con chi accelerare?</th></tr></thead><tbody>
    ${R.dims.filter((d) => d.community).map((d) => `<tr><td><span class="dim-letter">${d.id}</span>${esc(d.name)}</td>
      <td><b>${esc(d.community.gapQuadrant)}</b><div class="small muted">${Math.round(d.community.fondShare * 100)}% delle aziende in fascia Fondativa · eterogeneità ${fmtScore(d.community.iqr)} punti · N=${d.community.n}</div></td>
      <td><b>${esc(d.community.peerQuadrant)}</b><div class="small muted">${d.community.need} ${d.community.need === 1 ? 'azienda l\'ha scelta' : 'aziende l\'hanno scelta'} come priorità · ${d.community.contrib} contributor potenziali</div></td></tr>`).join('')}
    </tbody></table></div></div>` : ''}

  <div class="card"><h2><span class="secnum">5</span>Qualità del dato</h2>
    ${R.pairs.map((p) => `<p><b>${esc(p.session.title)}</b> · ${p.participants} partecipanti · funzioni: ${p.functions.map(fnLabel).map(esc).join(', ') || '—'}</p>
      <ul class="small">${p.pairs.map((x) => `<li>Confronto ${esc(x.a)} vs ${esc(x.b)}: ${x.counts.A} per ${esc(x.a)}, ${x.counts.B} per ${esc(x.b)}, ${x.counts.ND} N.D.${x.discordant ? ` — <b>${x.discordant}</b> ${x.discordant === 1 ? 'risposta' : 'risposte'} in contrasto con i livelli dati dalla stessa persona` : ''}</li>`).join('')}</ul>`).join('') || '<p class="muted">—</p>'}
    <p class="small muted">I confronti a coppie sono un controllo di qualità interno: non entrano nel benchmark.</p>
  </div>

  <div class="card"><h2><span class="secnum">6</span>Priorità</h2>
    <div class="explain">L'ordine segue la nota: prima riportare a coerenza, poi i prerequisiti fondativi, poi le dimensioni sotto 70 e sotto la mediana peer. È una proposta trasparente, non sostituisce il giudizio dell'azienda.</div>
    ${R.finalPriorities?.length ? `<h3>Le tre priorità finali</h3><p class="small muted">Scelte dall'azienda nell'allineamento finale.</p>
      <ol>${R.finalPriorities.map((p) => `<li><b>${p.id} · ${esc(p.name)}</b> (${fmtScore(p.score)})</li>`).join('')}</ol>${R.finalPrioritiesNote ? `<p class="small">${esc(R.finalPrioritiesNote)}</p>` : ''}`
      : R.mapComplete ? `<h3>Tre priorità provvisorie</h3><p class="small muted">Provvisorie dopo Scalare; si confermano dopo l'allineamento finale di settembre 2027, quando tutte le dimensioni hanno la stessa data.</p>
      <ol>${R.priorities.slice(0, 3).map((p) => `<li><b>${p.dimension} · ${esc(p.name)}</b> (${fmtScore(p.score)}) — <span class="small">${esc(p.reasons.join('; ') || 'nessun segnale specifico')}</span></li>`).join('')}</ol>`
      : `<p class="small">Le tre priorità complessive si calcolano a Map completa (${R.dimsComplete}/8 dimensioni misurate finora). In ogni sessione l'azienda sceglie la propria priorità e il commitment, riportati qui sotto.</p>`}
    <h3>Commitment registrati</h3>
    ${R.commitments.length ? `<div class="tablewrap"><table><thead><tr><th>Sessione</th><th>Priorità</th><th>Azione</th><th>Owner</th><th>Scadenza</th><th>KPI / evidenza</th><th>Stato</th></tr></thead><tbody>
      ${R.commitments.map((c) => `<tr><td>${esc(c.session_title)}</td><td>${esc(c.priority_item)} ${esc(I.items[c.priority_item]?.title || '')}</td><td>${esc(c.action)}</td><td>${esc(c.owner)}</td><td>${dDate(c.due_date)}</td><td>${esc(c.kpi)}${c.peer_interest ? '<br><span class="tag teal">interesse peer</span>' : ''}</td><td>${esc(c.status || 'aperto')}${c.status_note ? `<br><span class="small muted">${esc(c.status_note)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nessun commitment registrato.</p>'}
  </div>

  <div class="card"><h2><span class="secnum">7</span>Profilo di approccio</h2>
    <p class="small muted">Caratteristiche non ordinate: descrivono come l'azienda si trasforma, non quanto è avanti. Non entrano nello score.</p>
    ${Object.values(R.profile).length ? `<table><tbody>${Object.values(R.profile).map((p) => `<tr><td>${esc(p.q)}</td><td><b>${esc(p.value)}${typeof p.value === 'number' ? '%' : ''}</b></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Profilo non compilato.</p>'}
  </div>

  <div class="card"><h2>Note metodologiche e limiti</h2>
    <p class="small ink2">Autovalutazione strutturata e consolidamento aziendale, non audit né certificazione. Il benchmark è "indicativo" sotto le ${SC.benchmark.stableN} aziende e non è mostrato sotto le ${SC.benchmark.minN}; nel report l'azienda è esclusa dal proprio benchmark quando il campione residuo resta di almeno ${SC.benchmark.looMinResidual} aziende. Le soglie (fasce 44/70, coerenza ${SC.coherenceThreshold} punti, quadranti) e i nomi dei quadranti sono quelli in uso nel pilot. Le regole di coerenza che confrontano sessioni diverse si discutono nella call con il leader. Le dimensioni misurate in sessioni diverse possono riflettere partecipanti diversi; a settembre 2027 l'allineamento finale le riporta a una data unica.</p>
  </div>
  ${(R.calls || []).length ? `<div class="card"><h2>Appendice · Call con il leader</h2>
    <p class="small ink2">Trascrizione integrale della call in cui il leader dell'azienda ha discusso il report, così come esportata da Teams.</p>
    ${R.calls.map((k) => `<h3>${esc(k.session_title)}${k.call_date ? ` · call del ${k.call_date.split('-').reverse().join('/')}` : ''}</h3><div class="transcript">${esc(k.transcript)}</div>`).join('')}</div>` : ''}`;
  try {
    const list = t ? (await api(`/api/r/${encodeURIComponent(t)}`)).reports : await api(`/api/admin/companies/${cid}/reports`);
    if (list.length) $('#versions').innerHTML = `<p class="small">Versioni rilasciate: ${list.map((v) => `<a href="?${t ? `t=${encodeURIComponent(t)}&` : ''}snap=${v.id}">v${v.version} · ${esc(v.session_title)} · ${fmtDate(v.created_at)}</a>`).join(' · ')}${t ? '' : ` · <a href="?${fin}">bozza corrente</a>`}</p>`;
  } catch { /* elenco non disponibile */ }
}
boot();
