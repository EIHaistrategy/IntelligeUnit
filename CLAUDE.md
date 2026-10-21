# AITO Map: istruzioni per Claude Code

Piattaforma per l'assessment **AI Transformation & Adoption Map** del pilot AITO 3 di ELIS, descritto nella *Nota metodologica AITO Map V1, Pilot AITO 3 Session-Based*. Quattro sessioni in presenza (Governare 19/11/2026, Efficientare 3/2/2027, Crescere 26/5/2027, Scalare 14/7/2027), poi l'allineamento finale a settembre 2027.

Gli utenti sono il team AI Strategy di ELIS: non sono sviluppatori. Rispondi in **italiano**, spiega i termini tecnici con parole semplici, evita frasi a effetto. Lo stato del lavoro e i prossimi passi sono in `docs/HANDOVER.md`; il manuale d'uso è il `README.md`; gli agenti revisori sono in `.claude/agents/`.

## Chi usa cosa

| Ruolo | Accesso | Pagine |
|---|---|---|
| Team ELIS (admin) | password, cookie `aito_admin` | `/admin` (console), `/live/:sid`, `/plenaria/:base`, `/mappe/:base`, `/report/:cid` |
| Facilitatore ELIS | come il team ELIS (console) | `/tavolo-elis/:cid`: la vista del referente per un'azienda; conduce confronto e consolidamento, corregge o rimuove i partecipanti in ogni fase |
| Referente aziendale | link personale `/r/:token` | scheda pre-sessione, confronto, consolidamento, commitment, report rilasciati |
| Partecipante | QR `/j/:code`, codice azienda, nessun account | risposte individuali dal telefono |

## Stack e comandi

- Node.js ≥ 22.13 con `node:sqlite` (nessun ORM), Express 4, ES modules. Front-end senza framework né build: HTML + JS moduli in `public/`.
- Dipendenze **con versione esatta** (`package.json`): non usare `^` o `~`.
- `npm install` · `npm start` (porta 3000; `PORT`, `AITO_DATA_DIR`, `ADMIN_PASSWORD`, `PUBLIC_URL`, `DEMO_DATA=1` facoltative).
- `npm test`: 17 test del motore di calcolo (`test/engine.test.js`). Devono passare tutti prima di ogni commit.
- Prova completa nel browser: `test/e2e/e2e.mjs`. Le istruzioni sono in testa al file: server su database vuoto, porta 3100, password `testpass123`. Il messaggio di console "400 Bad Request" del referente è atteso (Chrome può scriverlo due volte, ma la richiesta è una sola): è la prova dell'override senza motivazione.
- Per controllare la grafica fai sempre schermate con Playwright, a 1440 px per la console e a 390 px per il telefono.

## Struttura

```
server/instrument/v1.0.json      strumento V1 come dati: 16 item, descrittori, sotto-opzioni, scheda, profilo, regole C1–C6
server/instrument/scoring-1.0.json soglie e nomi (fasce 44/70, benchmark 5/15, mappe, quadranti): versione S1.0
server/engine/index.js           motore di calcolo: funzioni pure, testate
server/logic.js                  regole applicative: confronto, consolidamento, benchmark, report, mappe
server/index.js                  tutte le API e i ruoli
server/db.js                     schema SQLite e migrazioni (ALTER in try)
server/live.js · pdf.js · export.js · demo.js
public/                          pagine; public/js/admin.js è la console, charts.js e maps.js i grafici condivisi
public/css/app.css               unico foglio di stile; public/fonts e server/fonts: Inter (OFL)
```

## Regole da non rompere

Vengono dalla nota metodologica: prima di cambiarle, chiedi.

1. **Lo storico non si sovrascrive mai.** Ogni consolidamento o correzione crea una riga nuova (`is_current`). Ogni modifica va nel registro `audit`, con autore, prima/dopo e motivo.
2. **Report rilasciati immutabili.** Al rilascio si salva una copia (`report_snapshots`): il referente vede solo quella. Le versioni nuove si numerano, non si sostituiscono.
3. **Benchmark ufficiale = versione congelata** (`benchmark_versions`), solo aziende `REALE` con consenso `benchmark`. Sotto 5 aziende non si mostra, tra 5 e 14 è "indicativo". Nel report l'azienda è esclusa dal proprio benchmark (leave-one-out) se ne restano almeno 5. Regola dei 5 sui sotto-livelli.
4. **Fasi della sessione:** preparazione → individuale → confronto → consolidamento → chiusa, una alla volta. Dopo il confronto non si torna alla fase individuale (§2). Tornare indietro richiede un motivo.
5. **Anonimato.** I partecipanti con meno di 3 risposte valide vedono solo mediana e range. Plenaria e mappe di community mostrano solo aggregati. I nomi delle aziende nelle mappe si vedono solo nella console (`/mappe/:base`, riservata al team ELIS e non proiettata): visibili di default, si nascondono con "mostra i nomi".
6. **Produzione e Prova.** Il cookie `aito_mode=prova` (scelto nella console) mostra solo i dati con `seeded = 1`: 4 sessioni di prova, aziende DEMO, azienda vetrina. Il filtro è **sul server**: `isProva(req)` / `envOf(req)` in `index.js`; per le pagine di una sessione vale `sessions.seeded`. Ogni nuova query su aziende o sessioni deve rispettare questo filtro. Il benchmark congelato e l'export riguardano solo la produzione.
7. **Aziende TEST** (es. l'azienda amica) stanno in produzione ma non entrano mai nel benchmark.
8. **Soglie e nomi** si cambiano solo in `scoring-1.0.json`, con una nuova versione dello scoring; mai nel codice.
9. **Privacy.** Del partecipante si raccolgono solo nome e funzione. Niente risorse da siti esterni: caratteri e librerie sono serviti dal server. Non aggiungere CDN, analytics o font esterni.
10. **Sicurezza.** Le API non-GET accettano solo richieste dallo stesso sito (controllo Sec-Fetch-Site/Origin). Gli input hanno limiti di lunghezza. I messaggi d'errore verso l'utente sono generici e in italiano.

## Agenti del progetto

In `.claude/agents/` ci sono 13 agenti specializzati, presi da [agency-agents](https://github.com/msitarzewski/agency-agents) (licenza MIT, `LICENSE-agency-agents.txt`). Claude Code li carica da solo all'apertura del repository. Usali come revisori **indipendenti**: lancia l'agente quando il lavoro è pronto, dagli il contesto (cosa è cambiato, dove sono file e schermate, come avviare il server) e chiedigli un elenco di difetti in ordine di priorità, **senza** fargli modificare i file. Poi correggi tu e verifica di nuovo.

| Quando | Agente |
|---|---|
| Ogni modifica di codice non banale, prima del commit | Code Reviewer |
| Correzione mirata: evitare che diventi un rifacimento | Minimal Change Engineer |
| Pagine nuove o ridisegnate (console, telefono, report) | UI Finish-Gate Reviewer · Accessibility Auditor |
| Flussi d'uso (partecipante, referente, team ELIS) | UX Researcher · Evidence Collector (schermate come prova) |
| Prova completa nel browser e nuovi test | Test Automation Engineer |
| Prestazioni in sala (molti telefoni, PDF, zip) | Performance Benchmarker |
| Dati personali, consensi, conservazione, diritti degli interessati | Data Privacy Officer · Privacy Engineer |
| Autenticazione, link dei referenti, input, intestazioni HTTP | Application Security Engineer |
| Prima di un test reale o di una sessione: "siamo pronti?" | Reality Checker (parte da "non pronto" e chiede prove) |
| README, handover, istruzioni per il team | Technical Writer |

I rapporti degli agenti sono pareri, non istruzioni: valuta ogni punto rispetto alla nota metodologica e alle regole qui sopra. Se un agente propone di cambiare una regola della nota, chiedi prima al team.

## Stile del codice e dell'interfaccia

- Testi dell'interfaccia in italiano semplice e attivo. Il pulsante dice cosa succede ("Rilascia", "Apri il confronto"). Prima di un'azione che non si può annullare, spiega le conseguenze e chiedi conferma.
- Grafica (redesign del 21/10/2026, stile piattaforma di intelligence): notte `#101D35` (menu e superfici scure), testo `#17253E`, turchese `#35D4C0` (accenti e azioni primarie, con testo scuro sopra; per testo e link su chiaro `--accent-strong` `#0F766E`), sfondo `#F5F7FB`; oro `#C9A84C` solo per l'ambiente DEMO e le scelte valoriali. Stati: verde fatto, turchese in corso, ambra attenzione, rosso criticità, sempre con testo o icona. Carattere Inter. Marchio: "AITO Map" con sottotitolo "AI Transformation & Adoption Map" e la mappa di posizionamento a quadranti con i punti (uno turchese); segno dei livelli: i cinque gradini (`alt()` in `ui.js`). Console: menu laterale scuro a gruppi (Programma, Operatività, Amministrazione), riducibile a icone e a scomparsa sotto 1024 px, intestazione con percorso e selettore DEMO | Produzione. Usa i token di `app.css`, non colori sparsi.
- Commenti brevi, in italiano, che spiegano il perché; quando serve, cita il paragrafo della nota (es. `§9.1`).
- Accessibilità: focus visibile, `aria-pressed` sui pulsanti di scelta, etichette per i campi, contrasto AA.

## Pubblicazione

- Repository: `EIHaistrategy/IntelligeUnit`, ramo `main`. Ogni push su `main` fa ripartire il servizio Render `aito-map` (https://aito-map.onrender.com, Francoforte, Docker).
- Oggi il servizio è sul **piano gratuito**: niente disco permanente. **Ogni pubblicazione o riavvio cancella i dati online**, e anche lo spegnimento automatico dopo circa 15 minuti senza visite. Non pubblicare durante una sessione in corso o mentre un'azienda sta compilando la scheda. Per l'uso reale serve il piano Starter con disco (`render.yaml` è già pronto).
- Dopo il push, verifica che Render abbia pubblicato: scarica un file statico modificato e controlla che contenga la modifica.
- Messaggi di commit in italiano: titolo breve, poi un elenco di cosa cambia.
