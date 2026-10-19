// Grafici SVG senza librerie esterne.
import { esc } from './ui.js';

const NAVY = '#005172', TEAL = '#1FB5B8', GOLD = '#C9A84C', GRID = '#DDE3EA', INK3 = '#7B8798';

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
  return `<svg viewBox="0 0 ${w} ${h}" style="max-width:${w}px">${g}</svg>`;
}
