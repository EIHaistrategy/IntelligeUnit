# AITO — AI Transformation & Adoption Map · piattaforma locale (v0.1)

Piattaforma per gestire l'assessment descritto nella **Nota metodologica V1 — Pilot AITO 3 Session-Based**.
Può girare in due modi:
- **in locale** su un portatile ELIS: i telefoni si collegano con un QR sulla stessa rete Wi‑Fi, nessun dato esce dal computer;
- **online** su Render (`Dockerfile` e `render.yaml` inclusi): i telefoni si collegano da qualsiasi rete. In questo caso i dati stanno sul server di Render (Francoforte). Sul piano gratuito **non c'è disco permanente** e i dati si perdono a ogni riavvio, a ogni pubblicazione e quando Render spegne il servizio dopo circa 15 minuti senza visite: per l'uso reale serve un piano con disco e la verifica privacy/IT (accordo sul trattamento dati con Render).

## 1. Avvio

**Requisito unico:** Node.js 22.13 o successivo (versione LTS da https://nodejs.org).

- **Windows:** doppio clic su `Avvia AITO Map.bat`. Alla prima esecuzione Windows chiede se consentire a Node.js l'accesso alla rete: rispondi **Consenti sulle reti private**, altrimenti i telefoni non si collegano.
- **Mac:** doppio clic su `Avvia AITO Map.command` (la prima volta: clic destro → Apri). Se il Mac chiede di accettare connessioni in entrata per "node", consenti.
- **Da terminale:** `npm install` e poi `npm start`.

Al primo avvio la finestra mostra la **password admin iniziale**: annotala e cambiala da *Impostazioni*.
Se la perdi: `npm run reset-password -- NuovaPassword`.

La console ELIS è su `http://localhost:3000/admin`. La finestra mostra anche l'indirizzo per i telefoni (es. `http://192.168.1.20:3000`).

## 2. Prima del test

1. **Aziende e referenti** (ambiente *Produzione*) → aggiungi l'azienda (tipo `TEST` per l'azienda amica: così non entra mai nel benchmark ufficiale) e il suo **referente**. Copia il link personale del referente e mandaglielo.
2. Il referente apre il link e **consulta** le domande della sessione e della scheda pre-sessione (dati fattuali e profilo di approccio), in sola lettura, e le inoltra ai colleghi. Non si compila nulla prima: si risponde in sala (decisione del 20/10/2026).
3. **Impostazioni → Rete**: verifica che l'indirizzo dei QR sia quello della rete Wi-Fi della sala. Prova ad aprirlo da un telefono.
   Le reti per ospiti spesso isolano i dispositivi: in quel caso usa un router dedicato o l'hotspot di un telefono.

## Console ELIS: come è organizzata

- **DEMO | Produzione** (selettore in alto). In *Produzione* si vedono solo le aziende reali (e quelle TEST, come l'azienda amica, sempre fuori dal benchmark) e le sessioni del calendario. In *Prova* la barra diventa a strisce oro e si vedono solo i dati dimostrativi: 4 sessioni di prova, 14 aziende DEMO e l'azienda vetrina. Le aziende e le sessioni create in Prova sono di prova e si cancellano con *Cancella tutti i dati di prova*. Il benchmark ufficiale, l'export e le versioni congelate riguardano solo la Produzione. La scelta vale per il browser in uso.
- **Programma** (pagina iniziale): la linea del tempo delle 4 sessioni fino all'allineamento finale di settembre 2027 e l'elenco *Da fare*, calcolato dai dati (referenti mancanti, schede pre-sessione, cartoncini, benchmark da congelare, report da rilasciare, call da annotare, commitment scaduti).
- **Sessioni**: le 4 sessioni in ordine di calendario, più le sessioni ad hoc. Ogni sessione ha quattro schede: *Prima* (preparazione), *In sala* (risposte individuali, confronto, consolidamento), *Mappe* (dashboard live, plenaria, mappe, versioni del benchmark), *Follow up* (benchmark, report, call con i leader). In fondo a ogni scheda i pulsanti portano alla precedente e alla successiva; da tastiera i tasti 1–4 aprono le schede e le frecce ← → passano alla precedente o alla successiva. In alto, i collegamenti rapidi: QR delle aziende, dashboard live, plenaria, mappe, report e call.
- **Domande delle sessioni**: le domande di ogni sessione (livelli, sotto-opzioni, confronti a coppie, dati fattuali e profilo), uguali in DEMO e in Produzione, con il link all'anteprima da mandare alle aziende.
- **Dopo le sessioni**: *Report e call con i leader* (tutte le sessioni in una pagina) e *Commitment e verifica* (stato di ogni commitment, scadenze superate evidenziate).
- **Aziende e referenti**: per ogni azienda il percorso nelle 4 sessioni, i consensi (concessi di default alla creazione; si toglie la spunta se l'azienda ne nega uno), i referenti, i report rilasciati.
- In fondo: *Registro modifiche* e *Impostazioni* (divise in *Per la sala* e *Sistema*).

## 3. In sala (Control room della sessione)

La control room segue la sessione in sette passi: **Prima della sessione** (Preparazione), **In sala** (Risposte individuali, Confronto al tavolo, Consolidamento), **Follow up** (Congelare il benchmark, Rilasciare i report, Call con i leader). A sinistra c'è l'elenco dei passi con lo stato di ciascuno; a destra il passo selezionato: cosa succede, cosa controllare (aziende senza referente, schede mancanti, tavoli con meno di 3 partecipanti, consolidamenti mancanti…) e il pulsante del passo successivo, con le conseguenze scritte prima della conferma. Per tornare indietro serve un motivo, che resta nel registro. *Stampa i cartoncini dei tavoli* prepara un cartoncino con QR e codice per ogni azienda.

| Fase | Chi fa cosa |
|---|---|
| Preparazione | Proietta il *QR a schermo intero* (o stampa i *QR tavolo*, con l'azienda già selezionata). I partecipanti scelgono l'azienda, inseriscono nome e funzione. |
| Individuale (10') | Ognuno risponde dal telefono ai 4 item (1–5 o N.D.) e ai 2 confronti a coppie. Nessuno vede le risposte altrui. |
| Confronto (10') | Telefoni e referente vedono la distribuzione anonima delle risposte dell'azienda: divergenze, N.D., confronti a coppie in contrasto. Le risposte individuali sono bloccate. |
| Consolidamento (10') | Lo conduce il **facilitatore ELIS** al tavolo: dalla control room, pulsante *Tavolo* dell'azienda, registra con il gruppo il livello ufficiale (parte dalla mediana; se cambia, deve motivare), poi la sotto-opzione con scelta forzata, conferma; poi priorità e commitment. Anche il referente può registrare e correggere dal suo link (se mancano i minuti, completa priorità e commitment nel pomeriggio); se due persone confermano insieme, la seconda riceve un avviso e ricarica i valori. |
| Chiusa | Si congela il benchmark, si apre la plenaria, si genera il report. |

Il pulsante *Tavolo* apre, in una nuova scheda, la pagina dell'azienda per il facilitatore: chi si è registrato e chi ha inviato, il confronto, il consolidamento. Da lì, in ogni fase della sessione aperta, il facilitatore corregge nome o funzione di un partecipante o rimuove una registrazione sbagliata (resta nel registro).

Dopo la sessione: *Rilascia* il report al referente (lo vede dal suo link), registra l'esito della *call con il leader* e incolla la **trascrizione di Teams**: salvandola si rilascia una nuova versione del report con la trascrizione integrale in appendice.

## 4. Dashboard live, report e PDF

- **Dashboard del benchmark in tempo reale** (Control room → *Dashboard live*, indirizzo `/live/<sessione>`): da proiettare in sala. Si aggiorna ogni 5 secondi man mano che le aziende consolidano. Mostra contatori di avanzamento e, da 5 aziende in su, mediana e Q1–Q3 per dimensione, aziende per fascia, eterogeneità e distribuzione dei livelli per item. Sotto 5 aziende mostra solo l'avanzamento (§9.1). Non è la versione ufficiale: a fine sessione si congela il benchmark.
- **Report riservato e PDF per azienda**: dalla Control room *Rilascia* salva una copia del report che l'azienda vede da quel momento e che non cambia più (§9, §17). Un nuovo rilascio crea una versione successiva, marcata come tale. Il PDF si scarica per singola azienda o in uno zip per sessione (le aziende non ancora rilasciate escono come `BOZZA_…`). Il referente vede solo le versioni rilasciate, sessione per sessione.

**Mappe a quadranti** (`/mappe/GOV`, `/mappe/EFF`, `/mappe/GROW`, `/mappe/SCALE`; dalla control room, pulsante *Mappe a quadranti*). Una pagina per sessione con le tre mappe del §10, sulla versione congelata del benchmark (o in anteprima con i dati dimostrativi):
- *Dove intervenire* (§10.2): quante aziende cadono in ciascun quadrante per le due dimensioni della sessione e una piccola mappa per azienda (un punto per dimensione). Su una sola dimensione la distanza dalla mediana cresce insieme allo score, quindi la mappa si legge azienda per azienda.
- *Il bisogno è individuale o condiviso?* (§10.3): un punto per dimensione, quota in fascia Fondativa e IQR; le dimensioni delle altre sessioni compaiono in grigio.
- *Con chi accelerare?* (§10.4): un punto per dimensione, aziende che l'hanno scelta come priorità e contributor potenziali.
I nomi delle aziende sono nascosti di default (pagina proiettabile); *mostra i nomi* li rivela per l'uso interno ELIS.
Dove compaiono: voce *Mappe* nel menu della console; pulsante nella control room; la **plenaria** mostra in fondo le mappe §10.3 e §10.4 (solo dati aggregati); il **report aziendale** (web e PDF) ha la sezione *La dimensione nella community*, che per ogni dimensione dell'azienda indica il quadrante delle due mappe di community, senza nomi di altre aziende.

## 5. Che cosa c'è in questa versione

- Strumento V1 completo come dati (`server/instrument/v1.0.json`): 16 item, descrittori, sotto-opzioni, opzioni valoriali, 30 dati fattuali della scheda, 14 domande di profilo, 6 regole di coerenza. Le quattro sessioni sono già create.
- Motore di calcolo (`server/engine/index.js`) con 17 test automatici (`npm test`): score 0–100 con sotto-opzioni, dimensioni e fasce 44/70, confidence §7, mediana e override, confronti a coppie, benchmark con soglie 5/15 e leave-one-out, regola dei 5 sui sotto-livelli, quadranti, coerenza C1–C6, ordine delle priorità. Un test verifica anche che nessun punteggio di dimensione ottenibile cada su 44 o 70 (§8.2).
- Ruoli: admin ELIS (password), referente aziendale (link personale), partecipante (QR, senza account).
- Storico mai sovrascritto: ogni ri-consolidamento o correzione crea una nuova riga; registro modifiche con autore, prima/dopo e motivo.
- Benchmark congelati per versione; solo aziende `REALE` con consenso al benchmark. Le aziende `TEST` (es. l'azienda amica) seguono il flusso vero ma restano fuori dal benchmark; le aziende `DEMO` vivono solo nell'ambiente di **Prova**.
- Plenaria anonima, report riservato stampabile in PDF, export Excel di tutti i dati.
- Sessioni ad hoc per aziende assenti (stesso flusso, modalità registrata).
- Dati dimostrativi: nell'ambiente **Prova** della console (o con `npm run demo`, o con la variabile d'ambiente `DEMO_DATA=1` all'avvio) si creano 4 sessioni di prova, 14 aziende DEMO e un'azienda vetrina (TEST) con scheda, partecipanti, consolidamento e commitment. Restano separati dai dati reali e si cancellano con un clic.
- Mappe a quadranti per sessione (§10.2 dove intervenire, §10.3 gap della community, §10.4 peer matching), anche in plenaria e nel report.

## 6. Non ancora presente (fasi successive)

Item pulse (da Efficientare), ordinamento delle 8 dimensioni e tre priorità provvisorie registrabili (Scalare), classificazione degli use case (Allegato D), abbinamento nominativo del peer matching con verifica dei contributor (§13; la mappa §10.4 c'è), allineamento finale e benchmark allineato di settembre 2027 (§14.1), distribuzioni del profilo di approccio in plenaria (Allegato C), indicatori di funzionamento del pilot in una vista dedicata (§19.1, oggi ricavabili dall'export), distinzione dei ruoli ELIS (§21).

## 7. Scelte che la piattaforma ha dovuto rendere univoche (da confermare)

| Punto della nota | Scelta implementata |
|---|---|
| §10.4 Peer matching: "aziende con bisogno" e "contributor potenziali" | Bisogno = azienda che ha scelto come priorità del commitment una capacità della dimensione. Contributor potenziale = azienda in fascia Consolidata (≥ 70) sulla dimensione che ha dato il consenso al peer matching. |
| §10.3 e §10.4: abbinamento nomi–quadranti | La nota elenca i nomi ma non dice quale quadrante corrisponde a quale combinazione di soglie: l'abbinamento è in `scoring-1.0.json` e va confermato. |
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
| Ordine delle tre priorità (§11.1) | Criterio 2 reso come "dimensione prerequisito sotto 70"; il criterio 4 (rilevanza strategica, readiness) non è calcolabile e lascia il posto all'ordine per score crescente. Le tre priorità si mostrano solo a Map completa, come provvisorie |
| Coerenza C6 | Leggibile appena almeno un'abilitante è disponibile; i confronti mancanti sono indicati come non disponibili |
| Ritorno di fase | Dopo il confronto non si torna alla fase individuale; gli altri ritorni richiedono un motivo, registrato |
| Sotto-opzione suggerita | Nel consolidamento è preselezionata quella indicata dal dato della scheda pre-sessione; senza dato, la prima opzione |
| Etichetta "valoriale" | Applicata al livello che contiene un'opzione valoriale |
| Conteggi per livello in plenaria e dashboard | Mostrati da 5 aziende complessive; la regola dei 5 per categoria è applicata ai sotto-livelli (§9), non ai livelli |
| Profilo Q11 | "Come si formano i team" diviso in due domande; P_NOMISURA ha anche "Non applicabile" |
| Scelta dell'azienda alla registrazione | Di default con il codice azienda (QR del tavolo o codice comunicato dal referente): il QR di sala non mostra l'elenco delle aziende. In *Impostazioni* si può tornare all'elenco |
| Anonimato nel confronto | Con meno di 3 risposte valide i partecipanti vedono solo mediana e range; il referente vede la distribuzione per consolidare |

Tutte le soglie sono in `server/instrument/scoring-1.0.json` (versione S1.0) e si cambiano lì, con una nuova versione.

## 8. Privacy: cosa fa la piattaforma e cosa serve da ELIS

La piattaforma raccoglie solo nome e funzione del partecipante (niente email), mostra alla registrazione chi vede cosa e chiede di confermarlo, può linkare l'informativa ELIS (*Impostazioni*), protegge i link dei referenti (nessun invio verso altri siti, link rigenerabile), registra ogni modifica. Prima dell'uso reale servono dal processo privacy/IT di ELIS: ruoli (titolare/responsabili), base giuridica, informativa, accordo sul trattamento dati con Render e verifica dei trasferimenti, voce nel registro dei trattamenti, tempi di conservazione, gestione delle richieste degli interessati, chi custodisce password admin ed export.

## 9. Dati e backup

Tutto è nella cartella `data/` (database SQLite). Backup: copia la cartella a server fermo. L'export Excel è in *Impostazioni*.
La piattaforma non sostituisce l'informativa privacy: per la rilevazione reale va verificata con il processo privacy/IT (§16).

## 10. Struttura

```
server/instrument/  strumento V1 e regole di scoring (dati versionati)
server/engine/      motore di calcolo (funzioni pure, testate)
server/             database, API, export, script
public/             pagine: admin, referente, partecipante, report, plenaria, dashboard live
public/fonts/       caratteri Plus Jakarta Sans e Fraunces (licenza SIL OFL), serviti dal server
server/fonts/       gli stessi caratteri in WOFF per i PDF
test/               test del motore; test/e2e/e2e.mjs prova completa nel browser (Playwright)
CLAUDE.md           istruzioni per Claude Code (regole da non rompere, comandi, agenti, pubblicazione)
.claude/agents/     13 agenti revisori per Claude Code (agency-agents, licenza MIT)
docs/HANDOVER.md    stato del lavoro, scadenze, decisioni aperte
```

Grafica: palette ELIS (notte #1F3864, petrolio #005172, oro #C9A84C, turchese #1FB5B8) e un segno ricorrente, i cinque gradini dei livelli, usato nel marchio, nelle scelte dei livelli e nei grafici. I caratteri sono incorporati nell'applicazione: nessuna pagina carica risorse da Google o da altri siti esterni.
