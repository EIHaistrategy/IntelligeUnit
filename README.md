# AITO — AI Transformation & Adoption Map · piattaforma locale (v0.1)

Piattaforma per gestire l'assessment descritto nella **Nota metodologica V1 — Pilot AITO 3 Session-Based**.
Gira su un portatile ELIS: i partecipanti si collegano dal telefono con un QR, sulla stessa rete Wi-Fi.
Nessun servizio esterno, nessun dato fuori dal computer.

## 1. Avvio

**Requisito unico:** Node.js 22.13 o successivo (versione LTS da https://nodejs.org).

- **Windows:** doppio clic su `Avvia AITO Map.bat`. Alla prima esecuzione Windows chiede se consentire a Node.js l'accesso alla rete: rispondi **Consenti sulle reti private**, altrimenti i telefoni non si collegano.
- **Mac:** doppio clic su `Avvia AITO Map.command` (la prima volta: clic destro → Apri). Se il Mac chiede di accettare connessioni in entrata per "node", consenti.
- **Da terminale:** `npm install` e poi `npm start`.

Al primo avvio la finestra mostra la **password admin iniziale**: annotala e cambiala da *Impostazioni*.
Se la perdi: `npm run reset-password -- NuovaPassword`.

La console ELIS è su `http://localhost:3000/admin`. La finestra mostra anche l'indirizzo per i telefoni (es. `http://192.168.1.20:3000`).

## 2. Prima del test

1. **Aziende** → aggiungi l'azienda (tipo `TEST` per l'azienda amica: così non entra mai nel benchmark ufficiale) e il suo **referente**. Copia il link personale del referente e mandaglielo.
2. Il referente apre il link e compila la **scheda pre-sessione** (dati fattuali per le sotto-opzioni + profilo di approccio).
3. **Impostazioni → Rete**: verifica che l'indirizzo dei QR sia quello della rete Wi-Fi della sala. Prova ad aprirlo da un telefono.
   Le reti per ospiti spesso isolano i dispositivi: in quel caso usa un router dedicato o l'hotspot di un telefono.

## 3. In sala (Control room della sessione)

| Fase | Chi fa cosa |
|---|---|
| Preparazione | Proietta il *QR a schermo intero* (o stampa i *QR tavolo*, con l'azienda già selezionata). I partecipanti scelgono l'azienda, inseriscono nome e funzione. |
| Individuale (10') | Ognuno risponde dal telefono ai 4 item (1–5 o N.D.) e ai 2 confronti a coppie. Nessuno vede le risposte altrui. |
| Confronto (10') | Telefoni e referente vedono la distribuzione anonima delle risposte dell'azienda: divergenze, N.D., confronti a coppie in contrasto. Le risposte individuali sono bloccate. |
| Consolidamento (10') | Il referente sceglie il livello ufficiale (parte dalla mediana; se cambia, deve motivare), poi la sotto-opzione con scelta forzata (suggerita dalla scheda pre-sessione), conferma; poi priorità e commitment. |
| Chiusa | Si congela il benchmark, si apre la plenaria, si genera il report. |

Dopo la sessione: *Rilascia* il report al referente (lo vede dal suo link), registra l'esito della *call con il leader*.

## 4. Che cosa c'è in questa versione

- Strumento V1 completo come dati (`server/instrument/v1.0.json`): 16 item, descrittori, sotto-opzioni, opzioni valoriali, 30 dati fattuali della scheda, 14 domande di profilo, 6 regole di coerenza. Le quattro sessioni sono già create.
- Motore di calcolo (`server/engine/index.js`) con 16 test automatici (`npm test`): score 0–100 con sotto-opzioni, dimensioni e fasce 44/70, confidence §7, mediana e override, confronti a coppie, benchmark con soglie 5/15 e leave-one-out, regola dei 5 sui sotto-livelli, quadranti, coerenza C1–C6, ordine delle priorità. Un test verifica anche che nessun punteggio di dimensione ottenibile cada su 44 o 70 (§8.2).
- Ruoli: admin ELIS (password), referente aziendale (link personale), partecipante (QR, senza account).
- Storico mai sovrascritto: ogni ri-consolidamento o correzione crea una nuova riga; registro modifiche con autore, prima/dopo e motivo.
- Benchmark congelati per versione; solo aziende `REALE` con consenso al benchmark. Le aziende `TEST` e `DEMO` compaiono solo nelle **anteprime** (con banner).
- Plenaria anonima, report riservato stampabile in PDF, export Excel di tutti i dati.
- Sessioni ad hoc per aziende assenti (stesso flusso, modalità registrata).
- `npm run demo` crea 14 aziende DEMO con dati fittizi per provare plenaria e report in anteprima.

## 5. Non ancora presente (fasi successive)

Item pulse (da Efficientare), ordinamento delle 8 dimensioni (Scalare), classificazione degli use case (Allegato D), peer matching operativo con verifica dei contributor, allineamento finale di settembre 2027, distinzione dei ruoli ELIS (Program manager / Methodology owner / Data steward).

## 6. Scelte che la piattaforma ha dovuto rendere univoche (da confermare)

| Punto della nota | Scelta implementata |
|---|---|
| "Almeno 2 prospettive" (§7) | Due funzioni diverse dall'elenco chiuso di 11 funzioni |
| Confronti a coppie (§6.5) | Risposta A / B / N.D., senza "pari" (`pairAllowsTie` nello strumento). Discordanza calcolata sui livelli individuali della stessa persona; livelli uguali = non valutabile |
| Mediana frazionaria | Nessun livello proposto; la scelta del gruppo non è un override |
| Override | Livello ufficiale diverso da una mediana intera: motivazione obbligatoria |
| Leave-one-out "se il campione residuo resta utilizzabile" | Residuo ≥ 5 aziende |
| Regola dei 5 sui sotto-livelli | Si mostrano le sotto-opzioni di un livello solo se ogni sotto-opzione non vuota ha ≥ 5 aziende |
| Quartili | Metodo QUARTILE.INC di Excel |
| Uso e direzione (§10.5) | Lettura qualitativa nel report, senza soglia automatica |
| Quadranti delle mappe community e peer | Abbinamento nomi–quadranti proposto (in `scoring-1.0.json`) |
| Priorità di sessione | Item della sessione (necessario per il pulse) |

Tutte le soglie sono in `server/instrument/scoring-1.0.json` (versione S1.0) e si cambiano lì, con una nuova versione.

## 7. Dati e backup

Tutto è nella cartella `data/` (database SQLite). Backup: copia la cartella a server fermo. L'export Excel è in *Impostazioni*.
La piattaforma non sostituisce l'informativa privacy: per la rilevazione reale va verificata con il processo privacy/IT (§16).

## 8. Struttura

```
server/instrument/  strumento V1 e regole di scoring (dati versionati)
server/engine/      motore di calcolo (funzioni pure, testate)
server/             database, API, export, script
public/             pagine: admin, referente, partecipante, report, plenaria
test/               test del motore
```
