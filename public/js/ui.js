// Utilità condivise dalle pagine.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export async function api(url, opts = {}) {
  const init = { method: opts.method || 'GET', headers: {} };
  if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
  let res;
  // Senza rete il browser dà un errore tecnico in inglese ("Failed to fetch"): lo si traduce.
  try { res = await fetch(url, init); }
  catch {
    const e = new Error(init.method === 'GET' ? 'Connessione non disponibile. Controlla la rete e riprova.'
      : 'Connessione non disponibile: l\'ultima operazione non è stata salvata. Controlla la rete e riprova.');
    e.status = 0; e.network = true; throw e;
  }
  let data = null;
  try { data = await res.json(); } catch { /* vuoto */ }
  if (!res.ok) { const e = new Error(data?.error || `Errore ${res.status}`); e.status = res.status; throw e; }
  return data;
}

let toastTimer;
export function toast(msg, err = false) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.setAttribute('role', err ? 'alert' : 'status');
  t.textContent = msg; t.classList.toggle('err', err); t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), err ? 6000 : 2500);
}

export const fmtScore = (x) => (x == null ? 'N.D.' : (Math.round(x * 10) / 10).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
export const fmtNum = (x, d = 1) => (x == null ? '—' : (Math.round(x * 10 ** d) / 10 ** d).toLocaleString('it-IT'));
export const fmtDate = (s) => (s ? new Date(s.replace(' ', 'T') + (s.includes('T') || s.endsWith('Z') ? '' : 'Z')).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '—');
export const levelLabel = (level, sub) => (level == null ? 'N.D.' : `${level}${sub || ''}`);

export const PHASES = [
  { id: 'preparazione', label: 'Preparazione' },
  { id: 'individuale', label: 'Individuale' },
  { id: 'confronto', label: 'Confronto' },
  { id: 'consolidamento', label: 'Consolidamento' },
  { id: 'chiusa', label: 'Chiusa' },
];
export function phaseChips(current, { dark = false } = {}) {
  const idx = PHASES.findIndex((p) => p.id === current);
  return `<ol class="phases${dark ? ' on-dark' : ''}" aria-label="Fasi della sessione">${PHASES.map((p, i) => `<li class="phase ${i === idx ? 'on' : i < idx ? 'done' : ''}" ${i === idx ? 'aria-current="step"' : ''}><span class="dot" aria-hidden="true">${i < idx ? icon('check') : ''}</span><span class="lbl">${p.label}</span></li>`).join('')}</ol>`;
}

// I cinque gradini del livello: il segno grafico ricorrente della Map.
export const alt = (level) => `<span class="alt" aria-hidden="true">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= level ? 'on' : ''}"></i>`).join('')}</span>`;

export function bandTag(score, scoring) {
  if (score == null) return '<span class="tag">N.D.</span>';
  const b = scoring.bands.find((x) => x.lt == null || score < x.lt);
  return `<span class="tag band-${b.id}">${esc(b.name)}</span>`;
}

// Distribuzione delle risposte individuali (vista anonima)
export function distBars(summary) {
  const max = Math.max(1, ...Object.values(summary.counts), summary.nd);
  const med = summary.median;
  const rows = [1, 2, 3, 4, 5].map((l) => {
    const c = summary.counts[l];
    const isMed = med != null && (l === med || l === Math.floor(med) || l === Math.ceil(med));
    return `<div class="bar ${isMed ? 'med' : ''}"><span>Liv. ${l}</span><div class="track"><div class="fill" style="width:${(c / max) * 100}%"></div></div><b>${c}</b></div>`;
  });
  rows.push(`<div class="bar nd"><span>N.D.</span><div class="track"><div class="fill" style="width:${(summary.nd / max) * 100}%"></div></div><b>${summary.nd}</b></div>`);
  return `<div class="bars">${rows.join('')}</div>`;
}

export function confTag(conf) {
  const cls = { ALTA: 'ok', MEDIA: 'navy', BASSA: 'warn', DA_VALIDARE: 'risk', ND: '' }[conf.code] ?? '';
  return `<span class="tag ${cls}" title="${esc(conf.reason || '')}">Confidence: ${esc(conf.label)}</span>`;
}

// Icone disegnate (SVG nel codice, nessuna risorsa esterna): stesso tratto e allineamento ovunque, al posto di ✓ ! ← scritti come caratteri.
const ICONS = {
  check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
  alert: '<path d="M12 7.5v6"/><path d="M12 16.8v.2"/>',
  info: '<path d="M12 10.8v6"/><path d="M12 7.2v.2"/>',
  back: '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>',
  dot: '<circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none"/>',
};
export const icon = (name, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;

export function qrImg(text, size = 220) {
  return `<div class="qrbox" style="width:${size}px"><img alt="QR" src="/api/qr.svg?text=${encodeURIComponent(text)}"></div>`;
}

// QR con il nome dell'azienda scritto sotto, nello stesso riquadro: chi inquadra vede subito di quale azienda è.
export function qrLabeled(text, label, size = 220) {
  // nomi lunghi: in stampa un corpo più piccolo, per restare entro 3 righe
  return `<figure class="qrbox qrlabel ${label.length > 40 ? 'long' : ''}" style="width:${size}px"><img alt="QR di registrazione" src="/api/qr.svg?text=${encodeURIComponent(text)}"><figcaption>${esc(label)}</figcaption></figure>`;
}

// Immagine PNG del QR con il nome dell'azienda in basso (per email o slide). Si disegna nel browser:
// nessun servizio esterno, caratteri dell'applicazione.
export async function downloadQrPng(text, label, sub, filename) {
  const res = await fetch(`/api/qr.svg?text=${encodeURIComponent(text)}`);
  if (!res.ok) throw new Error('qr');
  const svg = await res.text();
  const W = 1000, PAD = 90, Q = W - 2 * PAD; // 90 px di bianco attorno: zona di rispetto anche su slide colorate
  const img = new Image();
  const u = URL.createObjectURL(new Blob([svg.replace('<svg ', `<svg width="${Q}" height="${Q}" `)], { type: 'image/svg+xml' }));
  // onload invece di decode(): più affidabile con gli SVG su Safari/iOS
  try { await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = u; }); }
  finally { setTimeout(() => URL.revokeObjectURL(u), 0); }
  await Promise.all([document.fonts.load('600 64px "AITO Display"'), document.fonts.load('400 30px "AITO Sans"')]).catch(() => {});
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  // il nome va a capo su più righe e si rimpicciolisce se è molto lungo
  const lines = (size) => {
    g.font = `600 ${size}px "AITO Display", Georgia, serif`;
    const out = []; let cur = '';
    for (const w of label.split(/\s+/)) { const t = cur ? `${cur} ${w}` : w; if (g.measureText(t).width > Q && cur) { out.push(cur); cur = w; } else cur = t; }
    if (cur) out.push(cur);
    return out;
  };
  let fs = 72, L = lines(fs);
  while ((L.length > 2 || L.some((l) => g.measureText(l).width > Q)) && fs > 36) { fs -= 4; L = lines(fs); }
  cv.width = W; cv.height = PAD + Q + 40 + L.length * fs * 1.15 + (sub ? 50 : 0) + PAD;
  g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
  g.drawImage(img, PAD, PAD, Q, Q);
  g.fillStyle = '#1F3864'; g.textAlign = 'center'; g.textBaseline = 'top';
  g.font = `600 ${fs}px "AITO Display", Georgia, serif`;
  let y = PAD + Q + 40;
  // la larghezza massima stringe il testo invece di tagliarlo (es. un nome di una sola parola lunghissima)
  for (const l of L) { g.fillText(l, W / 2, y, Q); y += fs * 1.15; }
  if (sub) { g.fillStyle = '#4A5568'; g.font = '400 30px "AITO Sans", Arial, sans-serif'; g.fillText(sub, W / 2, y + 12, Q); }
  const blob = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

// Aggiornamento periodico; dopo 3 errori di fila mostra un avviso "connessione persa" finché non torna.
export function poll(fn, ms = 3000) {
  let stopped = false, fails = 0;
  const banner = () => {
    let b = document.getElementById('netwarn');
    if (!b) { b = document.createElement('div'); b.id = 'netwarn'; b.className = 'netwarn hidden'; b.setAttribute('role', 'alert'); b.textContent = 'Connessione persa: i dati potrebbero non essere aggiornati. Riprovo…'; document.body.prepend(b); }
    return b;
  };
  const tick = async () => {
    if (stopped) return;
    try { await fn(); fails = 0; banner().classList.add('hidden'); }
    catch (e) { console.warn(e); if (++fails >= 3) banner().classList.remove('hidden'); }
    if (!stopped) setTimeout(tick, ms);
  };
  tick();
  return () => { stopped = true; };
}
