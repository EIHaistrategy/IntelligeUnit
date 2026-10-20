// Crea i dati dimostrativi (14 aziende DEMO + azienda vetrina TEST). Uso: npm run demo
// Tutto finisce nell'ambiente di Prova della console e non entra mai nel benchmark ufficiale (§9).
import { seedDemo, hasDemo } from './demo.js';
if (hasDemo()) console.log('Dati dimostrativi già presenti.');
else console.log('Creati dati dimostrativi:', seedDemo());
