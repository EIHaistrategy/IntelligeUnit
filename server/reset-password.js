// Reimposta la password admin. Uso: npm run reset-password -- NuovaPassword
import crypto from 'node:crypto';
import { setSetting } from './db.js';

const pw = process.argv[2];
if (!pw || pw.length < 8) { console.error('Indica una password di almeno 8 caratteri: npm run reset-password -- NuovaPassword'); process.exit(1); }
const salt = crypto.randomBytes(16).toString('hex');
setSetting('admin_pw', `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`);
setSetting('sess_epoch_admin', crypto.randomBytes(12).toString('base64url')); // chi era dentro deve rientrare
console.log('Password admin aggiornata.');
