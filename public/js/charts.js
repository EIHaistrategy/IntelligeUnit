// Grafici SVG senza librerie esterne.
import { esc } from './ui.js';

// colori dai token di app.css: notte per l'azienda, turchese scuro per i peer, inchiostro per soglie e assi (l'oro resta alla DEMO)
const NAVY = '#101D35', TEAL = '#0F766E', GOLD = '#3B4A63', GRID = '#C9D3E0', INK3 = '#56647A';

// Radar sulle 8 dimensioni: azienda vs mediana peer. Le dimensioni N.D. non sono tracciate come zero (§10.1).
export function radar(dims, { size = 380 } = {}) {
  const cx = size / 2, cy = size / 2 + 6, R = size * 0.34, n = dims.length;
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, v) => [cx + Math.cos(ang(i)) * R * (v / 100), cy + Math.sin(ang(i)) * R * (v / 100)];
  let g = '';
  for (const lv of [25, 50, 75, 100]) {
    g += `<polygon points="${dims.map((_, i) => pt(i, lv).join(',')).join(' ')}" fill="none" stroke="${GRID}" stroke-width="1"/>`;
  }
  dims.forEach((d, i) => {
    const [x, y] = pt(i, 100); const [lx, ly] = pt(i, 122);
    g += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${GRID}"/>`;
    const anchor = Math.abs(lx - cx) < 8 ? 'middle' : lx > cx ? 'start' : 'end';
    g += `<text x="${lx}" y="${ly}" font-size="11" text-anchor="${anchor}" dominant-baseline="middle" fill="${d.score == null ? INK3 : '#17212E'}" font-weight="${d.score == null ? 400 : 700}">${esc(d.id)}${d.score == null ? ' · N.D.' : ''}</text>`;
  });
  const series = (key, color, fillOp, dash = '') => {
    const pts = dims.map((d, i) => (d[key] == null ? null : pt(i, d[key])));
    const valid = pts.filter(Boolean);
    let s = '';
    if (valid.length >= 3 && pts.every(Boolean)) s += `<polygon points="${valid.map((p) => p.join(',')).join(' ')}" fill="${color}" fill-opacity="${fillOp}" stroke="${color}" stroke-width="2" ${dash}/>`;
    else {
      // segmenti solo tra dimensioni adiacenti entrambe disponibili
      pts.forEach((p, i) => { const q = pts[(i + 1) % n]; if (p && q) s += `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${color}" stroke-width="2" ${dash}/>`; });
    }
    valid.forEach((p) => { s += `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${color}"/>`; });
    return s;
  };
  g += series('peer', TEAL, 0.10, 'stroke-dasharray="5 4"');
  g += series('score', NAVY, 0.18);
  return `<svg viewBox="-60 0 ${size + 120} ${size + 12}" role="img" aria-label="Radar delle otto dimensioni">${g}</svg>`;
}

// Dove intervenire: X = score dimensione, Y = distanza dalla mediana peer (§10.2)
export function whereMap(points, { names, w = 460, h = 340 } = {}) {
  const m = { l: 44, r: 14, t: 14, b: 40 };
  const pw = w - m.l - m.r, ph = h - m.t - m.b;
  const maxAbs = Math.max(30, ...points.map((p) => Math.abs(p.delta))) + 5;
  const X = (v) => m.l + (v / 100) * pw, Y = (v) => m.t + ph / 2 - (v / maxAbs) * (ph / 2);
  let g = `<rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="#FAFBFC" stroke="${GRID}"/>`;
  g += `<line x1="${X(70)}" y1="${m.t}" x2="${X(70)}" y2="${m.t + ph}" stroke="${GOLD}" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  g += `<line x1="${m.l}" y1="${Y(0)}" x2="${m.l + pw}" y2="${Y(0)}" stroke="${GOLD}" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  const q = (x, y, t, anchor) => `<text x="${x}" y="${y}" font-size="10.5" fill="${INK3}" text-anchor="${anchor}" font-weight="700">${esc(t)}</text>`;
  g += q(m.l + pw - 6, m.t + 14, names.HH, 'end') + q(m.l + pw - 6, m.t + ph - 8, names.HL, 'end') + q(m.l + 6, m.t + 14, names.LH, 'start') + q(m.l + 6, m.t + ph - 8, names.LL, 'start');
  for (const t of [0, 25, 50, 70, 100]) g += `<text x="${X(t)}" y="${m.t + ph + 14}" font-size="10" text-anchor="middle" fill="${INK3}">${t}</text>`;
  g += `<text x="${m.l + pw / 2}" y="${h - 6}" font-size="10.5" text-anchor="middle" fill="#4A5668">Score della dimensione (0–100)</text>`;
  g += `<text x="12" y="${m.t + ph / 2}" font-size="10.5" text-anchor="middle" fill="#4A5668" transform="rotate(-90 12 ${m.t + ph / 2})">Distanza dalla mediana peer</text>`;
  for (const p of points) {
    g += `<circle cx="${X(p.score)}" cy="${Y(p.delta)}" r="13" fill="${NAVY}"/><text x="${X(p.score)}" y="${Y(p.delta)}" font-size="12" fill="#fff" text-anchor="middle" dominant-baseline="central" font-weight="700">${esc(p.id)}</text>`;
  }
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Mappa Dove intervenire">${g}</svg>`;
}

// Fascia benchmark su una riga: Q1–Q3, mediana, punto azienda
export function benchStrip(stats, own, { w = 220, h = 26 } = {}) {
  const X = (v) => 6 + (v / 100) * (w - 12);
  let g = `<line x1="6" y1="${h / 2}" x2="${w - 6}" y2="${h / 2}" stroke="${GRID}" stroke-width="2"/>`;
  for (const t of [44, 70]) g += `<line x1="${X(t)}" y1="4" x2="${X(t)}" y2="${h - 4}" stroke="${GRID}"/>`;
  if (stats?.available) {
    g += `<rect x="${X(stats.q1)}" y="${h / 2 - 6}" width="${Math.max(2, X(stats.q3) - X(stats.q1))}" height="12" rx="3" fill="${TEAL}" fill-opacity=".35"/>`;
    g += `<line x1="${X(stats.median)}" y1="${h / 2 - 8}" x2="${X(stats.median)}" y2="${h / 2 + 8}" stroke="${TEAL}" stroke-width="3"/>`;
  }
  if (own != null) g += `<circle cx="${X(own)}" cy="${h / 2}" r="6" fill="${NAVY}" stroke="#fff" stroke-width="2"/>`;
  return `<svg viewBox="0 0 ${w} ${h}" style="max-width:${w}px" aria-hidden="true" focusable="false">${g}</svg>`;
}

// Mappa a quattro quadranti generica (§10.2–10.4).
// x / y: { min, max, t (soglia), label, fmt }; quads: { TR, TL, BR, BL } nomi dei quadranti;
// points: [{ x, y, label, title, tone: 'main' | 'muted', letter }] — i punti con le stesse coordinate si raggruppano.
export function quadrantMap({ points, x, y, quads, w = 600, h = 440, labels = false, compact = false }) {
  const m = compact ? { l: 30, r: 8, t: 8, b: 24 } : { l: 56, r: 18, t: 18, b: 50 };
  const pad = compact ? 12 : 18;
  const pw = w - m.l - m.r, ph = h - m.t - m.b;
  const X = (v) => m.l + pad + ((Math.min(x.max, Math.max(x.min, v)) - x.min) / (x.max - x.min)) * (pw - 2 * pad);
  const Y = (v) => m.t + ph - pad - ((Math.min(y.max, Math.max(y.min, v)) - y.min) / (y.max - y.min)) * (ph - 2 * pad);
  const fx = x.fmt || ((v) => String(v)), fy = y.fmt || ((v) => String(v));
  const tx = X(x.t), ty = Y(y.t);
  // conteggio per quadrante
  const q = (p) => (p.x >= x.t ? (p.y >= y.t ? 'TR' : 'BR') : (p.y >= y.t ? 'TL' : 'BL'));
  const count = { TR: 0, TL: 0, BR: 0, BL: 0 };
  points.filter((p) => p.tone !== 'muted').forEach((p) => count[q(p)]++);
  let g = '';
  const tint = { TL: '#F4F7FA', TR: '#EEF5F8', BL: '#F9F7F1', BR: '#F4F7FA' };
  g += `<rect x="${m.l}" y="${m.t}" width="${tx - m.l}" height="${ty - m.t}" fill="${tint.TL}"/><rect x="${tx}" y="${m.t}" width="${m.l + pw - tx}" height="${ty - m.t}" fill="${tint.TR}"/>`;
  g += `<rect x="${m.l}" y="${ty}" width="${tx - m.l}" height="${m.t + ph - ty}" fill="${tint.BL}"/><rect x="${tx}" y="${ty}" width="${m.l + pw - tx}" height="${m.t + ph - ty}" fill="${tint.BR}"/>`;
  g += `<rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="none" stroke="${GRID}"/>`;
  g += `<line x1="${tx}" y1="${m.t}" x2="${tx}" y2="${m.t + ph}" stroke="${GOLD}" stroke-width="1.6" stroke-dasharray="5 4"/>`;
  g += `<line x1="${m.l}" y1="${ty}" x2="${m.l + pw}" y2="${ty}" stroke="${GOLD}" stroke-width="1.6" stroke-dasharray="5 4"/>`;
  const halo = 'paint-order="stroke" stroke="#fff" stroke-width="3" stroke-linejoin="round"';
  const qn = (key, xx, yy, anchor) => (compact
    ? `<text x="${xx}" y="${yy}" font-size="10" font-weight="600" fill="${INK3}" text-anchor="${anchor}" ${halo}>${esc(quads[key])}</text>`
    : `<text x="${xx}" y="${yy}" font-size="13" font-weight="700" fill="#44505F" text-anchor="${anchor}" ${halo}>${esc(quads[key])}</text>`
      + `<text x="${xx}" y="${yy + 16}" font-size="11.5" fill="${INK3}" text-anchor="${anchor}" ${halo}>${count[key]} ${count[key] === 1 ? 'punto' : 'punti'}</text>`);
  const qlabels = compact
    ? qn('TL', m.l + 5, m.t + 12, 'start') + qn('TR', m.l + pw - 5, m.t + 12, 'end') + qn('BL', m.l + 5, ty + 14, 'start') + qn('BR', m.l + pw - 5, ty + 14, 'end')
    : qn('TL', m.l + 10, m.t + 20, 'start') + qn('TR', m.l + pw - 10, m.t + 20, 'end') + qn('BL', m.l + 10, ty + 22, 'start') + qn('BR', m.l + pw - 10, ty + 22, 'end');
  // assi
  const fs = compact ? 9.5 : 11;
  for (const v of [x.min, x.t, x.max]) g += `<text x="${X(v)}" y="${m.t + ph + (compact ? 12 : 16)}" font-size="${fs}" text-anchor="middle" fill="${v === x.t ? '#17253E' : INK3}" font-weight="${v === x.t ? 700 : 400}">${esc(fx(v))}</text>`;
  for (const v of [y.min, y.t, y.max]) g += `<text x="${m.l - (compact ? 4 : 8)}" y="${Y(v) + 4}" font-size="${fs}" text-anchor="end" fill="${v === y.t ? '#17253E' : INK3}" font-weight="${v === y.t ? 700 : 400}">${esc(fy(v))}</text>`;
  if (!compact) {
    g += `<text x="${m.l + pw / 2}" y="${h - 8}" font-size="12" text-anchor="middle" fill="#44505F">${esc(x.label)}</text>`;
    g += `<text x="14" y="${m.t + ph / 2}" font-size="12" text-anchor="middle" fill="#44505F" transform="rotate(-90 14 ${m.t + ph / 2})">${esc(y.label)}</text>`;
  }
  // punti, raggruppati per coordinate uguali
  const groups = new Map();
  for (const p of points) { const k = `${Math.round(X(p.x))}:${Math.round(Y(p.y))}:${p.tone || 'main'}:${p.letter || ''}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
  const placed = [];
  const sorted = [...groups.values()].sort((a, b) => (a[0].tone === 'muted' ? -1 : 1) - (b[0].tone === 'muted' ? -1 : 1));
  for (const grp of sorted) {
    const p = grp[0], cx = X(p.x), muted = p.tone === 'muted';
    let cy = Y(p.y);
    // punti con lettera troppo vicini: si spostano di poco in verticale, così nessuno copre l'altro
    if (p.letter) { const rr0 = compact ? 11 : 15; for (let k = 0; k < 6 && placed.some((z) => Math.hypot(z[0] - cx, z[1] - cy) < rr0 * 1.9); k++) cy += (k % 2 ? -1 : 1) * rr0 * 1.9 * (k + 1); placed.push([cx, cy]); }
    // le dimensioni delle sessioni precedenti: cerchio bianco con contorno e lettera scura (contrasto AA)
    const fill = muted ? '#FFFFFF' : NAVY;
    const title = grp.map((z) => z.title || z.label).join('\n');
    if (p.letter) {
      const rr = compact ? 11 : 15;
      g += `<g><title>${esc(title)}</title><circle cx="${cx}" cy="${cy}" r="${rr}" fill="${fill}" stroke="${muted ? INK3 : '#fff'}" stroke-width="2"/><text x="${cx}" y="${cy}" font-size="${compact ? 11 : 13}" fill="${muted ? INK3 : '#fff'}" text-anchor="middle" dominant-baseline="central" font-weight="700">${esc(p.letter)}</text></g>`;
    } else {
      const r = grp.length > 1 ? 9 + Math.min(6, grp.length) : 7;
      g += `<g><title>${esc(title)}</title><circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" fill-opacity=".88" stroke="#fff" stroke-width="1.5"/>${grp.length > 1 ? `<text x="${cx}" y="${cy}" font-size="10.5" fill="#fff" text-anchor="middle" dominant-baseline="central" font-weight="700">${grp.length}</text>` : ''}</g>`;
      if (labels) {
        const t = grp.map((z) => z.label).join(', ');
        const right = cx < m.l + pw * 0.7;
        g += `<text x="${cx + (right ? r + 5 : -r - 5)}" y="${cy + 4}" font-size="10.5" fill="#16202D" text-anchor="${right ? 'start' : 'end'}" paint-order="stroke" stroke="#fff" stroke-width="3">${esc(t.length > 42 ? t.slice(0, 40) + '…' : t)}</text>`;
      }
    }
  }
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Mappa a quattro quadranti">${g}${qlabels}</svg>`;
}
