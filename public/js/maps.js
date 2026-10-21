// Mappe di community (§10.3 gap, §10.4 peer matching): usate dalla pagina delle mappe e dalla plenaria.
import { esc, fmtScore } from './ui.js';
import { quadrantMap } from './charts.js';

const pct = (v) => `${Math.round(v * 100)}%`;
const allDimsOf = (M) => [...M.dims.map((d) => ({ ...d, main: true })), ...M.others.map((d) => ({ ...d, main: false }))];

export function gapMapHtml(M) {
  const T = M.thresholds, allDims = allDimsOf(M);
  const gapPts = allDims.filter((d) => d.gap.available).map((d) => ({ x: d.gap.fondShare * 100, y: d.gap.iqr, letter: d.dimension, tone: d.main ? 'main' : 'muted',
    title: `${d.dimension} ${d.name}: ${pct(d.gap.fondShare)} in Fondativa, IQR ${fmtScore(d.gap.iqr)}` }));
  const cq = M.communityQuadrants;
  const gapMax = Math.max(40, ...gapPts.map((p) => p.y + 6));
  const gapHtml = `<div class="card"><div class="mapgrid"><div class="chart">${gapPts.length ? quadrantMap({ points: gapPts, quads: { TR: cq.HF_HI, BR: cq.HF_LI, TL: cq.LF_HI, BL: cq.LF_LI },
      x: { min: 0, max: 100, t: T.community.fondShare * 100, label: 'Quota di aziende in fascia Fondativa', fmt: (v) => `${v}%` },
      y: { min: 0, max: Math.ceil(gapMax / 10) * 10, t: T.community.iqr, label: 'Eterogeneità della community (IQR, punti)' } }) : `<div class="banner warn">Servono almeno ${M.minN} aziende per dimensione.</div>`}</div>
    <div><div class="tablewrap"><table><thead><tr><th>Dimensione</th><th class="num">Fondativa</th><th class="num">Eterogeneità (IQR)</th><th>Quadrante</th></tr></thead><tbody>
      ${allDims.map((d) => `<tr class="${d.main ? '' : 'muted'}"><td><span class="dim-letter" style="${d.main ? '' : 'background:#fff;color:#56647A;box-shadow:inset 0 0 0 1.5px #56647A'}">${d.dimension}</span>${esc(d.name)}</td>
        ${d.gap.available ? `<td class="num">${pct(d.gap.fondShare)}</td><td class="num">${fmtScore(d.gap.iqr)}</td><td><b>${esc(d.gap.quadrant)}</b></td>` : `<td colspan="3" class="small muted">N = ${d.gap.n}: non disponibile</td>`}</tr>`).join('')}</tbody></table></div>
      <p class="small muted" style="margin-top:10px">${M.others.length ? 'Pieni le dimensioni di questa sessione; con il solo contorno quelle misurate nelle sessioni precedenti.' : 'È la prima sessione: le dimensioni delle sessioni successive compariranno nelle loro mappe.'} IQR: quanto sono diverse tra loro le aziende (distanza in punti tra il primo e il terzo quartile). Un punto esattamente su una linea di soglia conta nel quadrante a destra o in alto.</p></div></div></div>`;

  return gapHtml;
}

export function peerMapHtml(M, { showNames = false } = {}) {
  const T = M.thresholds, allDims = allDimsOf(M);
  const pq = M.peerQuadrants;
  const peerPts = allDims.map((d) => ({ x: d.peer.need, y: d.peer.contrib, letter: d.dimension, tone: d.main ? 'main' : 'muted',
    title: `${d.dimension} ${d.name}: ${d.peer.need} aziende con la priorità, ${d.peer.contrib} contributor potenziali` }));
  const peerHtml = `<div class="card"><div class="mapgrid"><div class="chart">${quadrantMap({ points: peerPts, quads: { TR: pq.HN_HC, BR: pq.HN_LC, TL: pq.LN_HC, BL: pq.LN_LC },
      x: { min: 0, max: Math.max(T.peer.need * 2, ...peerPts.map((p) => p.x + 1)), t: T.peer.need, label: 'Aziende che hanno scelto la dimensione come priorità' },
      y: { min: 0, max: Math.max(T.peer.contrib * 2, ...peerPts.map((p) => p.y + 1)), t: T.peer.contrib, label: 'Contributor potenziali' } })}</div>
    <div><div class="tablewrap"><table><thead><tr><th>Dimensione</th><th class="num">Con priorità</th><th class="num">Contributor</th><th>Quadrante</th></tr></thead><tbody>
      ${allDims.map((d) => `<tr class="${d.main ? '' : 'muted'}"><td><span class="dim-letter" style="${d.main ? '' : 'background:#fff;color:#56647A;box-shadow:inset 0 0 0 1.5px #56647A'}">${d.dimension}</span>${esc(d.name)}
        ${showNames && d.main ? `<div class="small" style="margin-top:4px">Priorità: ${d.peer.needNames.map(esc).join(', ') || '—'}<br>Contributor: ${d.peer.contribNames.map(esc).join(', ') || '—'}</div>` : ''}</td>
        <td class="num">${d.peer.need}${d.peer.interest ? `<div class="small muted">${d.peer.interest} chiedono un confronto</div>` : ''}</td><td class="num">${d.peer.contrib}</td><td><b>${esc(d.peer.quadrant)}</b></td></tr>`).join('')}</tbody></table></div>
      <p class="small muted" style="margin-top:10px">Un punto esattamente su una linea di soglia conta nel quadrante a destra o in alto. Priorità = commitment registrati su una capacità della dimensione. Contributor potenziale = azienda in fascia Consolidata sulla dimensione che ha dato il consenso al peer matching.</p></div></div></div>`;

  return peerHtml;
}
