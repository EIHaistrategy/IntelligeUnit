# Handover: stato di AITO Map al 20 ottobre 2026

Questo file serve a chi riprende il lavoro, persona o sessione di Claude Code. Le regole stabili sono in `CLAUDE.md`, il manuale d'uso nel `README.md`.

## Dove siamo

La piattaforma copre il ciclo completo di una sessione e il lavoro dopo la sessione. È online in prova su https://aito-map.onrender.com (piano gratuito: i dati si cancellano a ogni pubblicazione, a ogni riavvio e quando Render spegne il servizio dopo circa 15 minuti senza visite).

| Area | Stato |
|---|---|
| Strumento V1 (16 item, scheda pre-sessione, profilo, regole C1–C6) | Completo come dati; testi verificati contro l'Allegato A della nota |
| Motore di calcolo (score, fasce, confidence, mediana/override, benchmark, coerenza, priorità) | Completo, 17 test |
| Partecipante dal telefono (QR, codice azienda, risposte, confronti a coppie, vista anonima) | Completo |
| Referente (scheda pre-sessione, confronto, consolidamento con sotto-opzioni, commitment, report) | Completo |
| Console ELIS: Programma, sessioni con schede Prima/In sala/Mappe/Follow up, report e call, commitment, aziende | Completa, riorganizzata il 19/10 |
| Ambiente DEMO separato dalla Produzione (cookie `aito_mode`, dati `seeded = 1`, registro modifiche per ambiente) | Completo |
| Allineamento finale (§14.1): revisione delle 16 capacità con evidenza, spostamenti, tre priorità finali, vista d'insieme, report unificato web e PDF (`server/alignment.js`, `public/js/align.js`) | Completo, 5 test; manca il benchmark ricalcolato sui valori allineati |
| Percorso guidato DEMO: azienda fittizia dalla preparazione al report, vista admin e telefono, data simulata, reset (`server/demo.js`, dati in `server/demo/percorso-guidato.json`) | Completo, 10 test |
| Dashboard live, plenaria, mappe a quadranti §10.2–10.4 | Complete |
| Report web e PDF per azienda, con versioni rilasciate immutabili; zip di tutti i PDF | Completi |
| Export Excel (solo produzione), registro modifiche | Completi |

Revisioni già fatte con agenti indipendenti: conformità alla nota, codice, privacy, accessibilità, prestazioni (prova di carico: il piano gratuito regge ~20 richieste/s con poco margine, lo Starter ha circa 10 volte il margine), grafica.

## Prossime scadenze

1. **Test con l'azienda amica** (in produzione, azienda di tipo TEST). Si può fare anche sul piano gratuito, ma tutto in un'unica finestra di tempo: Render gratuito spegne il servizio dopo circa 15 minuti senza visite e alla riaccensione i dati sono vuoti. Lista di controllo:
   - nessun push su `main` il giorno prima e il giorno del test, detto a tutto il team;
   - 30 minuti prima aprire `/healthz` per svegliare il servizio e tenere una scheda che lo ricarica ogni 5 minuti; console aperta in *Produzione* su due computer;
   - azienda di tipo TEST, referente e persone iscritte, email inviata dalla bozza;
   - QR generato, stampato e provato con un telefono fuori dal Wi-Fi ELIS; QR di sala e codice azienda come riserva;
   - cronometrare individuale, confronto e consolidamento; annotare ogni errore con schermata e ora;
   - alla fine rilasciare il report e scaricare subito PDF, zip ed export; controllare che l'azienda TEST non sia nel benchmark.
2. **Dry run**: settimana del 26/10. Serve soprattutto a cronometrare il consolidamento su telefono, che deve stare nei 10 minuti.
3. **Governare, 19 novembre 2026.** Prima servono:
   - piano Render **Starter con disco** (`render.yaml` è pronto). Senza disco, aziende, referenti e persone iscritte inseriti nei giorni prima andrebbero persi;
   - **repository privato** (oggi è pubblico);
   - il processo **privacy/IT ELIS** (README §8): ruoli, informativa da linkare in *Impostazioni*, accordo sul trattamento dati con Render, conservazione, gestione delle richieste degli interessati;
   - aziende reali, referenti e schede pre-sessione entro il 12/11, poi cartoncini dei tavoli e prova del QR sulla rete della sala.

## Decisioni aperte (Intelligence Unit)

Le scelte che la piattaforma ha dovuto rendere univoche sono nel README §7. Le più visibili:
- nomi dei quadranti della mappa "Dove intervenire": in uso quelli attuali, gli alternativi proposti sono in `scoring-1.0.json`;
- abbinamento nomi–quadranti delle mappe §10.3 e §10.4 (la nota elenca i nomi ma non l'abbinamento);
- definizione di "bisogno" e "contributor potenziale" nel peer matching;
- soglie pilota delle mappe: 50% / 22 punti e 6 / 5;
- terminologia: oggi l'interfaccia usa i termini della nota ("Confidence", "Score", "Owner", "KPI"). Se si preferisce l'italiano, si cambiano i testi.

## Decisioni prese il 20/10/2026

- **QR per azienda** come QR principale, con il nome dell'azienda sotto il QR (cartoncino A4 e PNG). Il QR di sala resta come riserva, con il codice azienda.
- **Pagina del referente**: solo le sessioni del proprio ambiente (Produzione o Prova), in evidenza la sessione in corso o la prossima, e per ogni sessione la striscia completa delle sei fasi (scheda pre-sessione, partecipanti, consolidamento, commitment; report rilasciato e call con il leader a cura di ELIS). Le sei fasi si ripetono in tutte le sessioni, call con il leader compresa. Nessun passo di "verifica del commitment precedente".
- **Preparazione in cinque passi** (control room, scheda *Prima*): 1 azienda, 2 referente (nome ed email), 3 email al referente (bozza pronta nel programma di posta, una per referente, poi "Segna come inviata"), 4 QR della sessione, 5 schede pre-sessione. Dalla generazione dei QR il referente dell'azienda è **bloccato** fino alla chiusura della sessione; cambiarlo o revocarne il link è un'eccezione con motivo scritto nel registro. Un QR generato per errore si annulla con motivo, solo se nessuno si è ancora registrato. Il QR funziona anche prima della "generazione" (la generazione segna il passo e blocca il referente); un'azienda senza referente entra con il QR di sala e il codice azienda.
- **Persone iscritte e "Chi sei?"**: ELIS inserisce per ogni azienda le persone iscritte (nome e funzione; il referente compreso, perché risponde anche lui). Il referente riceve due email: quella personale e una "da inoltrare" ai colleghi, senza link personale, con l'anteprima delle domande (`/anteprima/GOV`, per presa visione). In sala, dopo il QR del tavolo, ognuno sceglie il proprio nome (nome e cognome visibili); un nome già scelto non si riprende finché il referente non tocca «Rimuovi»; chi ha scelto il nome sbagliato lo cambia da solo finché non ha risposto; chi non è iscritto si aggiunge, ma non con il nome di un iscritto o del referente. L'elenco dei nomi si vede solo durante la registrazione e solo dopo la generazione del QR dell'azienda; i codici azienda sbagliati sono limitati (60 ogni 15 minuti per indirizzo). **Da sentire con il Data Privacy Officer**: l'elenco nominativo è visibile a chi ha il QR del tavolo e resta nel tempo (export compreso); va citato nell'informativa e nella politica di conservazione.
- **Scheda pre-sessione solo da consultare**: prima della sessione il link del referente mostra solo le domande dei temi (con i livelli) e quelle della scheda (dati fattuali e profilo di approccio), in sola lettura, con il pulsante "Inoltra le domande ai colleghi". Non si compila nulla prima: si risponde in sala. Il salvataggio della scheda dal link del referente è disattivato; nel consolidamento, senza dati della scheda, la sotto-opzione preselezionata è la prima.
- **Referente iscritto in automatico**: aggiungendo il referente si sceglie anche la sua funzione reale (le funzioni dello strumento non cambiano) e il referente entra da solo tra le persone iscritte; sul telefono, in «Chi sei?», il suo nome ha l'etichetta «referente».
- **Decisioni del 21/10/2026**: nome completo "AI Transformation & Adoption Map"; logo = mappa di posizionamento a quadranti con i punti (uno in oro); caratteri Fraunces e Plus Jakarta Sans; l'ambiente di prova si chiama **DEMO** (a sinistra, oro) e **Produzione** sta a destra (turchese); le mappe `/mappe/:base` non si proiettano e mostrano i nomi delle aziende di default.
- **Trascrizione Teams della call con il leader**: dalla console (Report e call con i leader, o passo "Call con i leader" della sessione) si incolla il testo; salvando si rilascia una nuova versione del report con la trascrizione **integrale** in appendice, visibile anche al referente. Le versioni precedenti non cambiano; una trascrizione sostituita resta nel registro modifiche. **Da sentire con il Data Privacy Officer**: la trascrizione contiene dati personali (nomi e parole di chi partecipa alla call): va citata nell'informativa, con il consenso dei partecipanti alla registrazione e una durata di conservazione.
- **Consolidamento condotto dal facilitatore ELIS** (come prevede la nota, ruoli): dalla console, pulsante *Tavolo* della control room (`/tavolo-elis/:azienda`), il facilitatore vede la stessa pagina del referente, registra consolidamento, priorità e commitment, e gestisce i partecipanti in ogni fase (corregge nome o funzione, rimuove). Il referente può comunque registrare e correggere dal suo link e completare priorità e commitment nel pomeriggio. Accesso del facilitatore = password della console (una sola, condivisa).
- **Consensi concessi di default**: alla creazione di un'azienda i quattro consensi (benchmark anonimo, peer matching, testimonianza, follow-up) sono già concessi, con una riga nel registro; si toglie la spunta, con il motivo, solo se l'azienda ne nega uno. **Da sentire con il Data Privacy Officer**: un consenso dato per scontato va confermato per iscritto dall'azienda (es. nel modulo di adesione).
- **Report**: ogni rilascio resta com'è oggi (tutta la mappa dell'azienda fino a quella sessione). A settembre 2027 si manda il **report unificato**, generato **dopo l'allineamento finale** (§14.1): costruito il 21/10/2026 (README, «Allineamento finale»). Decisioni del 21/10: si possono rivedere tutte le 16 capacità (le 12 prima di luglio evidenziate), compilano referente ed ELIS, tre priorità finali come dimensioni.

## Non ancora costruito

Dal README §6: item pulse (da Efficientare), ordinamento delle 8 dimensioni e tre priorità registrabili (Scalare), classificazione degli use case (Allegato D), abbinamento nominativo del peer matching (§13), benchmark allineato di settembre 2027 (§14.1; allineamento e report unificato ci sono), distribuzioni del profilo in plenaria, vista degli indicatori del pilot (§19.1), account ELIS nominativi e ruoli distinti (§21).

Limiti noti:
- una sola password admin condivisa;
- nessuna cancellazione o export per singola persona (diritti dell'interessato) e nessuna anonimizzazione automatica a fine conservazione;
- alcune azioni usano le finestre del browser (`prompt`/`confirm`): annotazione della call, correzione di un valore, consensi;
- generare lo zip dei PDF occupa il server per alcuni secondi: durante una sessione in corso la piattaforma chiede conferma.

## Come riprendere

```
git clone https://github.com/EIHaistrategy/IntelligeUnit.git && cd IntelligeUnit
npm install
npm test                                   # 33 test (17 motore + 11 DEMO + 5 allineamento)
ADMIN_PASSWORD=una-password npm start      # console su http://localhost:3000/admin
```

Per vedere la piattaforma piena: nella console scegli **Prova** e poi *Carica i dati di prova*. Per la prova completa nel browser: `test/e2e/e2e.mjs`, le istruzioni sono in testa al file.

Cronologia: `git log` racconta le tappe principali, dalla prima versione (piattaforma e motore) alle ultime (grafica, control room guidata, mappe, Produzione/Prova).
