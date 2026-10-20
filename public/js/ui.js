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
  catch { throw new Error('Connessione non disponibile: l\'ultima operazione non è stata salvata. Controlla la rete e riprova.'); }
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
  return `<ol class="phases${dark ? ' on-dark' : ''}" aria-label="Fasi della sessione">${PHASES.map((p, i) => `<li class="phase ${i === idx ? 'on' : i < idx ? 'done' : ''}" ${i === idx ? 'aria-current="step"' : ''}><span class="dot" aria-hidden="true">${i < idx ? '✓' : ''}</span><span class="lbl">${p.label}</span></li>`).join('')}</ol>`;
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

export function qrImg(text, size = 220) {
  return `<div class="qrbox" style="width:${size}px"><img alt="QR" src="/api/qr.svg?text=${encodeURIComponent(text)}"></div>`;
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
