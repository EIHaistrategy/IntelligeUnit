// Avvio con controllo della versione di Node.js (serve il modulo SQLite integrato, Node ≥ 22.13).
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 13)) {
  console.error(`\n  Serve Node.js 22.13 o successivo (installato: ${process.versions.node}).\n  Scarica la versione LTS da https://nodejs.org e riprova.\n`);
  process.exit(1);
}
const { start } = await import('./index.js');
start();
