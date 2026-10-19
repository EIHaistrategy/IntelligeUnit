// Crea i dati dimostrativi (14 aziende DEMO + azienda vetrina TEST). Uso: npm run demo
// Le aziende DEMO e TEST non entrano mai nel benchmark ufficiale (§9): si vedono nelle anteprime.
import { seedDemo, hasDemo } from './demo.js';
if (hasDemo()) console.log('Dati dimostrativi già presenti.');
else console.log('Creati dati dimostrativi:', seedDemo());
