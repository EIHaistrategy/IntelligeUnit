import { api, esc, $, alt } from './ui.js';

// Anteprima delle domande di una sessione, per presa visione prima della sala: sola lettura, nessun dato raccolto.
const base = location.pathname.split('/').pop().toUpperCase();
const app = $('#app');

async function start() {
  const { instrument: I } = await api('/api/instrument');
  const s = I.sessions.find((x) => x.id === base);
  if (!s) { app.innerHTML = '<div class="card" role="alert"><h1>Anteprima non trovata</h1><p>Controlla il link ricevuto da ELIS.</p></div>'; return; }
  const date = s.date ? new Date(`${s.date}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  $('#sesstitle').textContent = `${s.name}${date ? ` · ${date}` : ''}`;
  const pairs = (s.pairs || []).map(([a, b]) => I.pairQuestion.replace('{a}', `<b>${esc(I.items[a].title.toLowerCase())}</b>`).replace('{b}', `<b>${esc(I.items[b].title.toLowerCase())}</b>`));
  app.innerHTML = `
    <div class="card"><h1>Le domande di ${esc(s.name)}</h1>
      <p class="ink2">Questa è un'anteprima per presa visione. ${date ? `Il ${esc(date)}` : 'In sala'} risponderete dal telefono, ognuno per conto suo, inquadrando il QR della vostra azienda.</p>
      <p class="small ink2" style="margin:0">Per ogni tema sceglierete il livello che descrive la situazione <b>praticata oggi</b> nella vostra azienda: ciò che è solo pianificato non conta. Se su un tema non avete visibilità, sceglierete <b>N.D.</b> (non disponibile).</p></div>
    ${s.items.map((id, i) => { const it = I.items[id]; return `<section class="card" aria-labelledby="t-${id}">
      <div class="qmeta"><span>Domanda ${i + 1} di ${s.items.length}</span><span class="tag navy">${esc(id)}</span></div>
      <h2 id="t-${id}">${esc(it.title)}</h2><p class="statement">${esc(it.statement)}</p>
      <ol class="preview-levels">${it.levels.map((l) => `<li><span class="n" aria-hidden="true">${l.level}${alt(l.level)}</span><span><span class="sr-only">Livello ${l.level}: </span>${esc(l.descriptor)}</span></li>`).join('')}</ol></section>`; }).join('')}
    ${pairs.length ? `<section class="card"><h2>Confronti a coppie</h2><p class="small ink2">Dopo le domande, due confronti: tra due temi della sessione, quale è più avanti nella vostra azienda?</p>
      <ul>${pairs.map((p) => `<li>${p}</li>`).join('')}</ul></section>` : ''}
    <p class="small muted">AITO Map · ELIS. Nessuna risposta viene raccolta da questa pagina.</p>`;
}
start().catch(() => { app.innerHTML = '<div class="card" role="alert"><h1>Pagina non disponibile</h1><p>Controlla la connessione e riprova.</p></div>'; });
