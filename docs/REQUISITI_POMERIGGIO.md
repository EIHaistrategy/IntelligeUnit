# Pomeriggio delle sessioni: votazione dei need · requisiti

Requisiti per aggiungere ad AITO Map la votazione del pomeriggio. Fonte: *AITO · Agenda del pomeriggio v14* (3/11/2026), semplificata con le decisioni del team del 5/11/2026. Prima sessione d'uso: **Governare, 19 novembre 2026**.

Da mettere in `docs/` del repository. Valgono tutte le regole di `CLAUDE.md`: storico mai sovrascritto, registro modifiche, filtro DEMO/Produzione, controllo dell'origine sulle API, testi in italiano semplice, test verdi prima di ogni commit.

---

## 1. Perimetro

**Che cosa fa la piattaforma il pomeriggio: solo la votazione.**

1. Per ogni tavolo il facilitatore inserisce dal telefono fino a 5 need emersi dalla discussione.
2. Ogni persona, dal telefono, sceglie al massimo 2 need del suo tavolo e per ciascuno indica priorità e orizzonte.
3. In plenaria si proietta una mappa per tavolo.
4. A fine pomeriggio ogni azienda sceglie, tra i need votati dalle sue persone, i 3 da portare al vertice.
5. Nel report PDF dell'azienda una sezione "Dai tavoli" riporta che cosa ha votato ogni persona e i 3 need scelti.

**Che cosa resta fuori dalla piattaforma** (lo gestisce ELIS a parte, anche la mattina stessa):
- composizione dei tavoli e distribuzione delle persone;
- ruoli Contributor ed Explorer, canovacci, preparazione dei racconti;
- iscrizione al pomeriggio: le persone sono quelle già registrate al mattino;
- domande della v14 su ambito interessato, supporto ELIS e contesto aziendale;
- segnalazione di un bisogno "non in elenco" e vista aggregata finale delle scelte aziendali.

## 2. Regole da non rompere

- **R1 Separazione dalla Map.** Il pomeriggio è una sezione a sé. Non legge, non mostra e non modifica dati della Map: score, fasce, benchmark, priorità e commitment. Le sue pagine (telefono, facilitatore, plenaria, scelta finale) non contengono nessun dato della Map. I due piani si incontrano solo nel PDF, in sezioni distinte.
- **R2 Fasi proprie.** Il pomeriggio ha fasi indipendenti da quelle della Map. Al pomeriggio il referente può ancora chiudere priorità e commitment della Map, quindi le due cose devono poter procedere insieme.
- **R3 Nessun vincitore.** Nessuna classifica, nessun "primo", nessun ordinamento per voti nelle viste proiettate. I need si mostrano sempre in ordine di codice (T1–T5).
- **R4 Niente risultati mentre si vota.** La mappa di un tavolo si vede solo dopo la chiusura del voto di quel tavolo.
- **R5 Un voto per persona.** Ogni persona vota una sola volta nella sessione, a un solo tavolo. Le correzioni le fa solo la regia, con motivo nel registro, e il voto precedente resta nello storico.
- **R6 Nessun dato personale nuovo.** Del partecipante restano solo nome e funzione, come al mattino.
- **R7 Linguaggio visivo distinto dalla Map.** Niente punteggi 0–100, fasce colorate o radar. Priorità e orizzonte si mostrano con le etichette verbali.
- **R8 Soglie e nomi fuori dal codice.** Etichette, soglie della mappa e nomi dei quadranti stanno in un file di configurazione separato (`server/instrument/pomeriggio-1.0.json`), non in `scoring-1.0.json`, per non toccare la versione dello scoring della Map.

## 3. Svolgimento e fasi

| Ora (Governare) | Momento | Che cosa succede in piattaforma |
|---|---|---|
| Mattina o prima delle 14:15 | Preparazione | La regia crea i tavoli (numero e titolo) e stampa i QR dei tavoli e i link dei facilitatori |
| 14:15–15:25 | Tavoli | Nessuna azione |
| 15:25–15:35 | Sintesi | Ogni facilitatore inserisce fino a 5 need e preme «Conferma e apri il voto» |
| 15:35–15:45 | Voto | Le persone scansionano il QR del tavolo e votano |
| 15:45 | Chiusura del voto | La regia chiude il voto (tutti i tavoli o uno alla volta) |
| 15:45–16:30 | Plenaria | Si proietta la mappa di ogni tavolo, tavoli 1–9 in ordine |
| 16:30–17:00 | Scelta finale | Referente o facilitatore registra i 3 need dell'azienda; la regia chiude alle 17:00 |
| Entro 7 giorni | Report | La sezione "Dai tavoli" entra nel PDF con la stessa versione del report della Map |

**Fasi del pomeriggio** (campo nuovo sulla sessione, indipendente da `phase`):
`chiuso → tavoli → plenaria → scelta → chiuso_def`

Ogni tavolo ha anche un proprio stato: `bozza` (need in inserimento) → `voto` (need congelati, voto aperto) → `chiuso`. Le fasi vanno avanti una alla volta. Tornare indietro richiede un motivo, che finisce nel registro.

## 4. Requisiti funzionali

### 4.1 Tavoli (console, regia)

- **TAV-01** Nella console, per ogni sessione, una nuova scheda **Pomeriggio**. Da lì la regia crea i tavoli con numero e titolo, e facoltativamente il tema del mattino a cui il tavolo appartiene. Un tavolo replicato è un tavolo in più con la sua etichetta (es. "4a", "4b").
- **TAV-02** I tavoli si creano e si modificano fino all'apertura del voto, anche la mattina stessa. Ogni modifica va nel registro.
- **TAV-03** Per ogni tavolo la console genera:
  - il **QR del tavolo**, come cartoncino A4 con numero e titolo, sul modello dei QR delle aziende;
  - il **link del facilitatore**, da aprire sul telefono.

  Il link del facilitatore si può revocare e rigenerare (con riga nel registro) e scade alla chiusura del pomeriggio.
- **TAV-04** La scheda Pomeriggio mostra un quadro per tavolo: stato, numero di need inseriti, persone che hanno votato. Il quadro mostra solo quante persone hanno votato, non che cosa hanno votato (R4).

### 4.2 Need del tavolo (telefono del facilitatore)

- **NEED-01** Con il suo link il facilitatore vede solo il proprio tavolo e inserisce fino a 5 need, ciascuno con:
  - **titolo**: obbligatorio, massimo 90 caratteri;
  - **descrizione**: una frase, facoltativa, massimo 200 caratteri.

  Il codice T1–T5 lo assegna la piattaforma in ordine di inserimento. Il facilitatore può riordinare i need finché il tavolo è in bozza.
- **NEED-02** Il codice univoco di un need è tavolo + codice (es. `4-T2`, `4a-T2`), perché il T1 di un tavolo è diverso dal T1 di un altro.
- **NEED-03** Il pulsante **«Conferma e apri il voto»** congela i need del tavolo e apre il voto. Prima di premerlo compare una conferma che spiega che dopo i need non si possono più aggiungere né togliere.
- **NEED-04** Dopo il congelamento solo la regia può correggere il testo di un need, per esempio un errore di battitura, indicando il motivo. Aggiungere o togliere need non è possibile, e i voti già dati restano.
- **NEED-05** Il facilitatore vede in diretta solo quante persone del suo tavolo hanno votato, non i risultati. Può chiudere il voto del suo tavolo; altrimenti lo chiude la regia.

### 4.3 Voto (telefono del partecipante)

- **VOT-01 Accesso.** La persona scansiona il QR del tavolo e:
  - se il telefono è quello usato al mattino, viene riconosciuta senza inserire nulla. Il riconoscimento usa il codice del partecipante che la piattaforma ha già salvato sul telefono per quella sessione. Compare "Sei *Nome Cognome*, *Azienda*. Tavolo *4 · titolo*";
  - se il telefono non è riconosciuto (altro telefono, browser pulito, persona arrivata solo al pomeriggio), inserisce il codice azienda e sceglie il proprio nome, come al mattino. Se quel nome aveva già un profilo al mattino, il voto si collega a quel profilo e non se ne crea un secondo. Se il profilo ha già votato, compare "Hai già votato al tavolo N".
- **VOT-02 Registrazione aperta al pomeriggio.** Oggi `POST /api/join/:code` rifiuta le registrazioni dopo la fase individuale della Map. Per il pomeriggio serve un percorso che resti aperto quando il voto è aperto. Quel percorso non deve riaprire nulla della Map: chi si registra al pomeriggio non compare tra i partecipanti della Map.
- **VOT-03 Selezione.** La persona vede i need del suo tavolo per esteso (codice, titolo e descrizione) e ne seleziona da 0 a 2. Il terzo tocco è bloccato con un messaggio. Il testo della domanda è *"Quali di questi bisogni o problemi sono più rilevanti per la tua azienda? Puoi sceglierne al massimo due, oppure nessuno."* C'è un pulsante esplicito «Non scelgo nessun need», perché la mancata selezione non è una valutazione negativa.
- **VOT-04 Domande per ogni need scelto.** Per ciascun need scelto, con titolo e descrizione sempre visibili, la persona risponde a due domande:
  - **Priorità**, una risposta: *"Quanto è prioritario per la tua azienda affrontare questo bisogno o problema?"* 1 Nessuna priorità · 2 Priorità bassa · 3 Priorità media · 4 Priorità alta · 5 Priorità massima.
  - **Orizzonte**, una risposta: *"Entro quando sarebbe necessario iniziare ad affrontarlo?"* Entro 3 mesi · Tra 3 e 6 mesi · Tra 6 e 12 mesi · Oltre 12 mesi · Orizzonte non definito.

  Tutte e due sono obbligatorie per ogni need scelto.
- **VOT-05 Invio.** Prima dell'invio compare un riepilogo. Dopo l'invio il voto non si modifica dal telefono, e la persona vede "Voto registrato" senza i risultati del tavolo.
- **VOT-06 Un tavolo per persona.** Una persona che ha votato e scansiona il QR di un altro tavolo vede "Hai già votato al tavolo N". Uno spostamento o un voto da annullare lo gestisce la regia, con motivo.
- **VOT-07 Tempo.** Il voto deve stare in meno di 2 minuti su telefono (due tocchi per need più l'invio). Va provato con almeno 100 telefoni simultanei, considerando i limiti del piano Render indicati nel documento di passaggio.

### 4.4 Mappe in plenaria (vista proiettata)

- **MAP-01 Pagina separata.** La vista è una pagina nuova (es. `/plenaria-pomeriggio/:sid`), riservata al team ELIS come la plenaria attuale e distinta da essa (R1). Mostra un tavolo alla volta, nell'ordine 1–9, quindi per tema del mattino. Ci si sposta con le frecce e c'è anche una vista d'insieme con tutti i tavoli in griglia.
- **MAP-02 Una mappa per tavolo.** Ogni need del tavolo è un punto etichettato con il suo codice (T1…T5), sullo stile delle mappe a quadranti già in uso (`quadrantMap` in `charts.js`):
  - **asse orizzontale: quanto è condiviso.** Quota di votanti del tavolo che hanno scelto il need. La soglia è la quota media attesa, cioè 2 voti diviso il numero di need del tavolo (con 5 need, 40%): a destra il need è stato scelto più della media del tavolo, a sinistra meno;
  - **asse verticale: quanto è prioritario per chi lo ha scelto.** Quota di chi l'ha scelto che lo indica a priorità alta o massima (4–5). Soglia al 50%.
- **MAP-03 Accanto alla mappa** c'è una tabella con, per ogni need: codice e titolo, numero di voti, distribuzione della priorità con le etichette verbali, distribuzione dell'orizzonte (quante risposte entro 3 mesi, tra 3 e 6, ecc.). Nessuna media e nessun punteggio unico.
- **MAP-04 Need con pochi voti.** Un need con 0 voti non si disegna come punto, perché non ha un valore verticale: compare nella tabella come "nessun voto" e in un elenco sotto la mappa. Un need con 1–2 voti si disegna con il solo contorno e la nota "pochi voti", perché la sua quota verticale dipende da una o due persone.
- **MAP-05 Nomi dei quadranti** (in `pomeriggio-1.0.json`, da validare):

  | Quadrante | Nome proposto |
  |---|---|
  | in alto a destra | Condiviso e prioritario |
  | in basso a destra | Condiviso, priorità più bassa |
  | in alto a sinistra | Meno condiviso, prioritario per chi l'ha scelto |
  | in basso a sinistra | Meno condiviso, priorità più bassa |

  Un punto esattamente su una soglia conta a destra o in alto, come nelle mappe della Map.
- **MAP-06 Anonimato.** La plenaria non mostra né aziende né persone, solo conteggi per need.
- **MAP-07 Disponibilità.** La mappa di un tavolo compare solo con il tavolo in stato `chiuso` (R4). Prima la pagina dice "Voto in corso".

### 4.5 Scelta finale dei 3 need (referente o facilitatore)

- **SCE-01 Chi.** La registra il **referente** dal suo link (`/r/:token`) oppure il **facilitatore** dalla console (vista `/tavolo-elis/:azienda`), come per il consolidamento della Map. È disponibile solo nella fase `scelta`.
- **SCE-02 Che cosa vede.** Tutti i need votati dalle persone dell'azienda, raggruppati per tavolo. Per ciascuno: chi l'ha votato (nome), con quale priorità e orizzonte, e il titolo del tavolo. Non vede nessun dato della Map (R1).
- **SCE-03 Che cosa sceglie.** Esattamente 3 need, solo tra quelli votati dalle proprie persone. Se i need votati sono meno di 3 (per esempio delegazione di una persona, o persone che non hanno scelto nulla), si scelgono tutti quelli disponibili e il report lo segnala.
- **SCE-04 Campo facoltativo.** Per ogni need scelto: *"Che cosa chiediamo al vertice?"* (massimo 300 caratteri, con l'avviso di non inserire dati personali o informazioni riservate). È facoltativo per non rallentare la chiusura.
- **SCE-05 Una scelta per azienda.** Il pulsante «Conferma i 3 need» chiude la scelta. Dopo, solo la regia può riaprirla con un motivo, e la scelta precedente resta nello storico.
- **SCE-06 Controllo della regia.** Nella scheda Pomeriggio la regia vede per ogni azienda lo stato della scelta (non iniziata, in corso, confermata) e chiude la fase alle 17:00.

### 4.6 Report PDF: sezione "Dai tavoli"

- **REP-01** Il report dell'azienda ha una sezione nuova, **"Dai tavoli · sessione *Governare*"**, dopo le sezioni della Map e prima delle note metodologiche. Si congela nella stessa copia del report (`report_snapshots`), con la stessa versione e la stessa data.
- **REP-02** In apertura una frase dichiara: *"Questi dati vengono dalla votazione del pomeriggio: non entrano nello score né nel benchmark della Map."*
- **REP-03** **I 3 need scelti dall'azienda**, ciascuno con tavolo di provenienza e "che cosa chiediamo al vertice" se compilato. Se i need sono meno di 3, il report lo segnala.
- **REP-04** *(modificato il 5/11/2026: i voti nel report sono anonimi; il report mostra per ogni tavolo quante persone dell'azienda hanno votato e, per ogni need, voti, priorità e orizzonte, senza nomi)*. Testo originale: **Che cosa ha votato ogni persona**: una riga per persona con nome, tavolo e titolo del tavolo. Sotto, i 5 need del tavolo, con i 2 votati evidenziati e, per questi, priorità e orizzonte con le etichette verbali. Chi non ha scelto nessun need lo vede scritto ("nessun need scelto").
- **REP-05** Grafica distinta dalla Map (R7): niente punteggi, fasce o radar.
- **REP-06** Se l'azienda non ha voti né scelta (nessuno al pomeriggio), la sezione non compare.

### 4.7 Export e registro

- **EXP-01** L'export Excel (solo Produzione) aggiunge tre fogli:
  - need per tavolo;
  - voti per persona, con priorità e orizzonte;
  - scelte aziendali con il campo "vertice".
- **EXP-02** Vanno nel registro modifiche:
  - creazione e modifica dei tavoli;
  - congelamento dei need, correzioni e chiusure;
  - voti annullati;
  - scelte confermate e riaperte;
  - revoca dei link.

## 5. Indicazioni per l'implementazione

Sono una proposta, da adattare al codice esistente.

- **Tabelle nuove** in `server/db.js`, con la colonna `seeded` per il filtro DEMO/Produzione:
  - `pm_tables` (id, session_id, label, title, morning_theme, status, fac_token, frozen_at, closed_at);
  - `pm_needs` (id, table_id, code, title, descr, created_at), con `UNIQUE(table_id, code)`;
  - `pm_votes` (id, participant_id, table_id, none INTEGER, is_current, created_at, created_by);
  - `pm_vote_items` (vote_id, need_id, priority 1–5, horizon);
  - `pm_choices` (id, session_id, company_id, items_json, is_current, created_at, created_by).
- **Migrazione:** `ALTER TABLE sessions ADD COLUMN pm_phase TEXT NOT NULL DEFAULT 'chiuso'`.
- **Configurazione:** `server/instrument/pomeriggio-1.0.json` con testi delle domande, etichette, soglie della mappa (quota media attesa, 50%, pochi voti < 3) e nomi dei quadranti.
- **Percorsi nuovi:**
  - `/t/:code`: QR del tavolo, telefono del partecipante;
  - `/ft/:token`: telefono del facilitatore. Attenzione: `/api/f/:c` esiste già ed è il facilitatore per azienda;
  - `/plenaria-pomeriggio/:sid`.
- **Riuso:** il riconoscimento del partecipante dal codice salvato sul telefono (`join.js`), il percorso "Chi sei?" per il ripiego, `quadrantMap` per le mappe, le conferme con motivo e il registro.
- **DEMO:** aggiungere un pomeriggio dimostrativo alle sessioni DEMO, con tavoli, need, voti e scelte, così il comitato e il percorso guidato vedono anche le mappe del pomeriggio.
- **Test:**
  - limite di 2 need;
  - un voto per persona;
  - need congelati;
  - mappa non disponibile prima della chiusura;
  - nessun dato della Map nelle API del pomeriggio;
  - scelta di esattamente 3 need, o meno se non ce ne sono;
  - separazione DEMO/Produzione;
  - presenza della sezione nel PDF.
- **Revisori dopo l'implementazione:** Code Reviewer, UX Researcher sul telefono del partecipante e del facilitatore, Performance Benchmarker su 100 telefoni, Data Privacy Officer (nomi nel PDF), Reality Checker prima del 19/11.

## 6. Priorità di consegna

| Entro | Che cosa |
|---|---|
| **Prova generale prima del 19/11** | 4.1 Tavoli · 4.2 Need · 4.3 Voto · 4.4 Mappe · 4.5 Scelta finale |
| **Entro 7 giorni dalla sessione** | 4.6 Sezione del PDF · 4.7 Export |
| **Dopo Governare** | DEMO del pomeriggio, rifiniture |

## 7. Punti ancora aperti

- **Nomi delle persone nel PDF.** Sono previsti perché il team vuole vedere che cosa ha votato ogni persona, e il report lo legge solo l'azienda. Va citato nell'informativa: da sentire con il Data Privacy Officer, come gli altri punti aperti nel documento di passaggio.
- **Nomi dei quadranti e soglie della mappa** (MAP-02, MAP-05): proposti dalla piattaforma, da validare con il team.
- **Allineamento con la v14.** La v14 prevede anche ambito interessato, supporto ELIS, contesto aziendale e altri campi della scheda aziendale. Qui sono esclusi per scelta del team. Se l'Agenda viene aggiornata, conviene portarla in linea con questo perimetro.
