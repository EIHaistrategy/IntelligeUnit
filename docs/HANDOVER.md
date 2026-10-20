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
| Console ELIS: Programma, sessioni con schede Prima/In sala/Dopo/Risultati, report e call, commitment, aziende | Completa, riorganizzata il 19/10 |
| Ambiente di Prova separato dalla Produzione (cookie `aito_mode`, dati `seeded = 1`) | Completo |
| Dashboard live, plenaria, mappe a quadranti §10.2–10.4 | Complete |
| Report web e PDF per azienda, con versioni rilasciate immutabili; zip di tutti i PDF | Completi |
| Export Excel (solo produzione), registro modifiche | Completi |

Revisioni già fatte con agenti indipendenti: conformità alla nota, codice, privacy, accessibilità, prestazioni (prova di carico: il piano gratuito regge ~20 richieste/s con poco margine, lo Starter ha circa 10 volte il margine), grafica.

## Prossime scadenze

1. **Test con l'azienda amica** (in produzione, azienda di tipo TEST). Si può fare anche sul piano gratuito, ma tutto in un'unica finestra di tempo: Render gratuito spegne il servizio dopo circa 15 minuti senza visite e alla riaccensione i dati sono vuoti. Lista di controllo:
   - nessun push su `main` il giorno prima e il giorno del test, detto a tutto il team;
   - 30 minuti prima aprire `/healthz` per svegliare il servizio e tenere una scheda che lo ricarica ogni 5 minuti; console aperta in *Produzione* su due computer;
   - azienda di tipo TEST, referente con email, email inviata dalla bozza; scheda pre-sessione compilata lo stesso giorno, subito prima (non giorni prima);
   - QR generato, stampato e provato con un telefono fuori dal Wi-Fi ELIS; QR di sala e codice azienda come riserva;
   - cronometrare individuale, confronto e consolidamento; annotare ogni errore con schermata e ora;
   - alla fine rilasciare il report e scaricare subito PDF, zip ed export; controllare che l'azienda TEST non sia nel benchmark.
2. **Dry run**: settimana del 26/10. Serve soprattutto a cronometrare il consolidamento su telefono, che deve stare nei 10 minuti.
3. **Governare, 19 novembre 2026.** Prima servono:
   - piano Render **Starter con disco** (`render.yaml` è pronto). Senza disco, la scheda pre-sessione compilata una settimana prima andrebbe persa;
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
- **Report**: ogni rilascio resta com'è oggi (tutta la mappa dell'azienda fino a quella sessione). A settembre 2027 si manda un **report cumulativo**, generato **dopo l'allineamento finale** (§14.1): va costruita la funzione, insieme all'allineamento.

## Non ancora costruito

Dal README §6: item pulse (da Efficientare), ordinamento delle 8 dimensioni e tre priorità registrabili (Scalare), classificazione degli use case (Allegato D), abbinamento nominativo del peer matching (§13), allineamento finale e benchmark allineato di settembre 2027 (§14.1) con il report cumulativo che ne deriva, distribuzioni del profilo in plenaria, vista degli indicatori del pilot (§19.1), account ELIS nominativi e ruoli distinti (§21).

Limiti noti:
- una sola password admin condivisa;
- nessuna cancellazione o export per singola persona (diritti dell'interessato) e nessuna anonimizzazione automatica a fine conservazione;
- alcune azioni usano le finestre del browser (`prompt`/`confirm`): annotazione della call, correzione di un valore, consensi;
- generare lo zip dei PDF occupa il server per alcuni secondi: durante una sessione in corso la piattaforma chiede conferma.

## Come riprendere

```
git clone https://github.com/EIHaistrategy/IntelligeUnit.git && cd IntelligeUnit
npm install
npm test                                   # 17 test
ADMIN_PASSWORD=una-password npm start      # console su http://localhost:3000/admin
```

Per vedere la piattaforma piena: nella console scegli **Prova** e poi *Carica i dati di prova*. Per la prova completa nel browser: `test/e2e/e2e.mjs`, le istruzioni sono in testa al file.

Cronologia: `git log` racconta le tappe principali, dalla prima versione (piattaforma e motore) alle ultime (grafica, control room guidata, mappe, Produzione/Prova).
