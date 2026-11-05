# Pomeriggio delle sessioni: votazione dei need · requisiti

**Versione 2 · 5 novembre 2026.** Aggiorna la versione 1 con le decisioni del team e le correzioni emerse durante la realizzazione e le revisioni dello stesso giorno. L'elenco delle modifiche è al paragrafo 8.

Fonte: *AITO · Agenda del pomeriggio v14* (3/11/2026), semplificata con le decisioni del team del 5/11/2026. Prima sessione d'uso: **Governare, 19 novembre 2026**.

Valgono tutte le regole di `CLAUDE.md`: storico mai sovrascritto, registro modifiche, filtro DEMO/Produzione, controllo dell'origine sulle API, testi in italiano semplice, test verdi prima di ogni commit.

**Stato:** tutti i requisiti sono realizzati e pubblicati su https://aito-map.onrender.com. Restano aperti i punti del paragrafo 7.

---

## 1. Perimetro

**Che cosa fa la piattaforma il pomeriggio: solo la votazione.**

1. Per ogni tavolo il facilitatore inserisce dal telefono fino a 5 need emersi dalla discussione.
2. Ogni persona, dal telefono, sceglie al massimo 2 need del suo tavolo e per ciascuno indica priorità e orizzonte.
3. In plenaria si proietta una mappa per tavolo.
4. A fine pomeriggio ogni azienda sceglie, tra i need votati dalle sue persone, i 3 da portare al vertice.
5. Nel report dell'azienda (web e PDF), una sezione «Dai tavoli» riporta i 3 need scelti e come hanno votato le persone dell'azienda, **in forma anonima**.

**Che cosa resta fuori dalla piattaforma** (lo gestisce ELIS a parte, anche la mattina stessa):
- composizione dei tavoli e distribuzione delle persone;
- ruoli Contributor ed Explorer, canovacci, preparazione dei racconti;
- iscrizione al pomeriggio: le persone sono quelle già registrate al mattino, più chi arriva solo al pomeriggio (VOT-02);
- domande della v14 su ambito interessato, supporto ELIS e contesto aziendale;
- segnalazione di un bisogno «non in elenco» e vista aggregata finale delle scelte aziendali.

## 2. Regole da non rompere

- **R1 Separazione dalla Map.** Il pomeriggio è una sezione a sé. Non legge, non mostra e non modifica dati della Map: score, fasce, benchmark, priorità e commitment. Le sue pagine (telefono, facilitatore, plenaria, scelta finale) non contengono nessun dato della Map. I due piani si incontrano solo nel report, in sezioni distinte.
- **R2 Fasi proprie.** Il pomeriggio ha fasi indipendenti da quelle della Map. Al pomeriggio il referente può ancora chiudere priorità e commitment della Map, quindi le due cose devono poter procedere insieme.
- **R3 Nessun vincitore.** Nessuna classifica, nessun «primo», nessun ordinamento per voti nelle viste proiettate. I need si mostrano sempre in ordine di codice (T1–T5).
- **R4 Niente risultati mentre si vota.** La mappa di un tavolo si vede solo dopo la chiusura del voto di quel tavolo. Anche il referente vede i voti della sua azienda solo nella fase di scelta (SCE-02).
- **R5 Un voto per persona.** Ogni persona vota una sola volta nella sessione, a un solo tavolo. Le correzioni le fa solo la regia, con motivo nel registro, e il voto precedente resta nello storico. Il vincolo è garantito anche dal database.
- **R6 Nessun dato personale nuovo.** Del partecipante restano solo nome e funzione, come al mattino.
- **R7 Linguaggio visivo distinto dalla Map.** Niente punteggi 0–100, fasce colorate o radar. Priorità e orizzonte si mostrano con le etichette a parole.
- **R8 Soglie e nomi fuori dal codice.** Etichette, soglie della mappa e nomi dei quadranti stanno in un file di configurazione separato (`server/instrument/pomeriggio-1.0.json`, versione P1.0), non in `scoring-1.0.json`, per non toccare la versione dello scoring della Map.
- **R9 Voti anonimi** *(nuova, 5/11/2026)*. Fuori da ELIS nessuno vede chi ha votato che cosa: il referente, il report e la plenaria vedono solo conteggi. I nomi di chi ha votato li vede solo il team ELIS: nella console, per poter annullare un voto, e nell'export Excel.

## 3. Svolgimento e fasi

| Ora (Governare) | Momento | Che cosa succede in piattaforma |
|---|---|---|
| Mattina o prima delle 14:15 | Preparazione | La regia crea i tavoli (numero e titolo), stampa i QR dei tavoli e manda i link ai facilitatori |
| 14:15–15:25 | Tavoli | La regia avvia la fase «Tavoli e voto». I facilitatori possono già scrivere i need, che si salvano da soli |
| 15:25–15:35 | Sintesi | Ogni facilitatore completa fino a 5 need e preme «Conferma e apri il voto» |
| 15:35–15:45 | Voto | Le persone inquadrano il QR del tavolo e votano |
| 15:45 | Chiusura del voto | Si chiude il voto: un tavolo alla volta (facilitatore o regia) o tutti insieme (regia) |
| 15:45–16:30 | Plenaria | Si proietta la mappa di ogni tavolo, tavoli in ordine di numero |
| 16:30–17:00 | Scelta finale | Referente o facilitatore registra i 3 need dell'azienda; la regia chiude il pomeriggio alle 17:00 |
| Entro 7 giorni | Report | La sezione «Dai tavoli» entra nel report rilasciato, con la stessa versione del report della Map |

**Fasi del pomeriggio** (campo `pm_phase` della sessione, indipendente da `phase`), con i nomi che si vedono nella console:

| Fase | Nome nella console | Che cosa si può fare |
|---|---|---|
| `chiuso` | Non iniziato | La regia prepara i tavoli; i facilitatori scrivono e salvano i need, ma non aprono il voto |
| `tavoli` | Tavoli e voto | Si aprono e si chiudono i voti dei tavoli; le persone si registrano e votano |
| `plenaria` | Plenaria | I tavoli ancora aperti si chiudono da soli; nessuno vota più; si proiettano le mappe |
| `scelta` | Scelta dei 3 need | Referenti e facilitatori scelgono i need; la regia può riaprire una scelta |
| `chiuso_def` | Concluso | Nulla si modifica più; i link dei facilitatori smettono di funzionare |

Ogni tavolo ha anche un proprio stato: `bozza` (need in scrittura) → `voto` (need congelati, voto aperto) → `chiuso`. Le fasi vanno avanti una alla volta. Tornare indietro richiede un motivo, che finisce nel registro. Un voto chiuso per errore si riapre (TAV-05).

## 4. Requisiti funzionali

### 4.1 Tavoli (console, regia)

- **TAV-01** Nella control room di ogni sessione c'è una scheda **Pomeriggio**. Da lì la regia crea i tavoli con numero e titolo e, se vuole, il tema del mattino a cui il tavolo appartiene. Un tavolo replicato è un tavolo in più con la sua etichetta (es. «4a», «4b»).
- **TAV-02** I tavoli si creano, si modificano e si tolgono fino all'apertura del voto, anche la mattina stessa. Ogni modifica va nel registro.
- **TAV-03** Per ogni tavolo la console genera:
  - il **QR del tavolo**, come cartoncino A4 con numero, titolo e QR (pagina «QR dei tavoli», da stampare tutti insieme);
  - il **link del facilitatore**, da copiare e aprire sul telefono.

  Il link del facilitatore si può revocare e rigenerare, con un motivo che va nel registro, e scade alla chiusura del pomeriggio.
- **TAV-04** La scheda Pomeriggio mostra un quadro per tavolo: stato, need inseriti e quante persone hanno votato, mai che cosa (R4). Per annullare un voto la regia vede l'elenco di chi ha votato, senza il contenuto del voto.
- **TAV-05** *(nuovo)* Un voto chiuso per errore si riapre dalla console con un motivo, ma solo mentre il pomeriggio è nella fase «Tavoli e voto». I voti già dati restano.
- **TAV-06** *(nuovo)* A pomeriggio concluso la console non offre più correzioni dei need né link dei facilitatori.

### 4.2 Need del tavolo (telefono del facilitatore)

- **NEED-01** Con il suo link il facilitatore vede solo il proprio tavolo e inserisce fino a 5 need, ciascuno con:
  - **titolo**: obbligatorio, massimo 90 caratteri;
  - **descrizione**: una frase, facoltativa, massimo 200 caratteri, su un campo di due righe.

  Il codice T1–T5 lo assegna la piattaforma in ordine. Il facilitatore può riordinare i need con le frecce finché il tavolo è in bozza.
- **NEED-02** Il codice univoco di un need è tavolo + codice (es. `4-T2`, `4a-T2`), perché il T1 di un tavolo è diverso dal T1 di un altro.
- **NEED-03** Il pulsante **«Conferma e apri il voto»** congela i need del tavolo e apre il voto. Prima compare un riepilogo dei need e una conferma che spiega che dopo i need non si possono più aggiungere né togliere. Il pulsante resta grigio finché la regia non avvia la fase dei tavoli, con un avviso che lo spiega sopra il pulsante.
- **NEED-04** Dopo il congelamento solo la regia può correggere il testo di un need, per esempio un errore di battitura, indicando il motivo. Aggiungere o togliere need non è possibile, e i voti già dati restano.
- **NEED-05** Il facilitatore vede in diretta solo quante persone del suo tavolo hanno votato, non i risultati. Può chiudere il voto del suo tavolo; altrimenti lo chiude la regia.
- **NEED-06** *(nuovo)* Per non perdere il lavoro:
  - i need si salvano da soli poco dopo l'ultima modifica, e la pagina dice l'ora dell'ultimo salvataggio;
  - la prima riga è già aperta;
  - prima di togliere un need già scritto si chiede conferma;
  - dopo uno spostamento il fuoco resta sul need spostato.

### 4.3 Voto (telefono del partecipante)

- **VOT-01 Accesso.** La persona inquadra il QR del tavolo e:
  - se il telefono è quello usato al mattino, viene riconosciuta senza inserire nulla, dal codice del partecipante che la piattaforma ha salvato sul telefono. Compare «Sei *Nome Cognome*, *Azienda*. Tavolo *4 · titolo*»;
  - se il telefono non è riconosciuto (altro telefono, browser pulito, persona arrivata solo al pomeriggio), compare «Non ti abbiamo riconosciuto»: la persona inserisce il codice azienda e sceglie il proprio nome, come al mattino. Se quel nome aveva già un profilo al mattino, il voto si collega a quel profilo e non se ne crea un secondo.
- **VOT-01a Protezione del nome** *(nuovo)*. Un nome già entrato al pomeriggio da un telefono non si può prendere da un altro: compare «Questo nome è già entrato da un altro telefono. Se sei tu, usa quel telefono oppure chiedi alla regia ELIS». Così chi conosce il codice azienda non può votare al posto di un collega. Nell'elenco dei nomi questi compaiono come «già entrato da un altro telefono»; l'elenco non dice chi ha votato.
- **VOT-01b «Non sei tu?»** *(nuovo)*. Accanto a «Sei *Nome*» c'è il collegamento «Non sei tu?», per un telefono prestato o un nome toccato per sbaglio: il telefono dimentica il riconoscimento e torna a «Chi sei?». Dopo il voto il collegamento non c'è più.
- **VOT-02 Registrazione aperta al pomeriggio.** Il percorso del pomeriggio è separato da quello del mattino e non riapre nulla della Map: chi si registra al pomeriggio non compare tra i partecipanti della Map. *(precisato)* L'elenco dei nomi e la registrazione sono disponibili solo mentre i tavoli sono aperti (fase «Tavoli e voto», tavolo non chiuso). Chi si aggiunge al pomeriggio, o sceglie un nome che non aveva un profilo al mattino, conferma di aver letto come viene usato il voto. C'è un limite largo alle persone aggiunte per azienda, contro gli inserimenti a raffica.
- **VOT-03 Selezione.** La persona vede i need del suo tavolo per esteso (codice, titolo e descrizione) e ne seleziona da 0 a 2. Il testo della domanda è *«Quali di questi bisogni o problemi sono più rilevanti per la tua azienda? Puoi sceglierne al massimo due, oppure nessuno.»*, con la nota «Need: un bisogno o un problema emerso al tavolo». *(precisato)*
  - Il contatore «N di 2 scelti» sta sopra l'elenco. Il terzo tocco è bloccato e il messaggio compare accanto al contatore. Con 2 need scelti, gli altri si vedono attenuati.
  - Senza scelte c'è il pulsante **«Non scelgo nessuno»**, perché la mancata selezione non è una valutazione negativa. Quando la persona ha già scelto dei need, al suo posto compare **«Togli le scelte»**, così non si invia per errore un voto vuoto.
- **VOT-04 Domande per ogni need scelto.** Per ciascun need scelto, con titolo e descrizione sempre visibili, la persona risponde a due domande:
  - **Priorità**, una risposta: *«Quanto è prioritario per la tua azienda affrontare questo bisogno o problema?»* 1 Nessuna priorità · 2 Priorità bassa · 3 Priorità media · 4 Priorità alta · 5 Priorità massima.
  - **Orizzonte**, una risposta: *«Entro quando sarebbe necessario iniziare ad affrontarlo?»* Entro 3 mesi · Tra 3 e 6 mesi · Tra 6 e 12 mesi · Oltre 12 mesi · Orizzonte non definito.

  Tutte e due sono obbligatorie per ogni need scelto. *(precisato)* Se manca una risposta, il messaggio «Manca la priorità» o «Manca l'orizzonte» compare accanto al need, e la pagina porta la persona alla prima domanda senza risposta.
- **VOT-05 Invio.** Prima dell'invio compare un riepilogo, con il pulsante «Rivedi e invia il voto». Dopo l'invio il voto non si modifica dal telefono, e la persona vede «Voto registrato» senza i risultati del tavolo. *(precisato)* La conferma ha un segno verde ben visibile, l'ora di registrazione e la frase «Puoi chiudere la pagina».
- **VOT-05a Avviso sul telefono** *(nuovo, 5/11/2026)*. Prima dell'invio la persona legge: *«Il tuo voto è anonimo: il referente della tua azienda, il report e la plenaria vedono solo quante persone hanno scelto ogni need.»*
- **VOT-06 Un tavolo per persona.** Una persona che ha votato e inquadra il QR di un altro tavolo vede «Hai già votato al tavolo N». Uno spostamento o un voto da annullare lo gestisce la regia, con motivo; dopo l'annullamento la persona può votare di nuovo, anche a un altro tavolo. Una registrazione del mattino annullata dal referente non vota nemmeno al pomeriggio.
- **VOT-07 Tempo.** Il voto deve stare in meno di 2 minuti su telefono. *(esito)* Prova di carico in locale: 100 telefoni che si registrano e votano insieme, tutti i voti registrati in meno di un secondo. Va ripetuta online, sul piano Render che si userà il 19/11.
- **VOT-08 Voto che si chiude mentre si vota** *(nuovo)*. Mentre la persona vota, la pagina controlla ogni 10 secondi lo stato del tavolo. Se il voto si chiude, compare l'avviso «Il voto di questo tavolo è stato chiuso» e l'invio si blocca, senza perdere quanto era sullo schermo.
- **VOT-09 Nessun dato in più sul telefono** *(nuovo)*. La pagina del QR del tavolo non riceve il codice della sessione del mattino. Per riconoscere la persona, il telefono manda i codici che ha salvato al mattino e il server tiene solo quello della sessione giusta.

### 4.4 Mappe in plenaria (vista proiettata)

- **MAP-01 Pagina separata.** La vista è una pagina a sé (`/plenaria-pomeriggio/:sid`), riservata al team ELIS come la plenaria della mattina e distinta da essa (R1). Mostra un tavolo alla volta, in ordine di numero (quindi per tema del mattino). Ci si sposta con i pulsanti o con le frecce della tastiera, e c'è una vista d'insieme con tutti i tavoli in griglia. Le mappe dei tavoli che chiudono il voto compaiono senza ricaricare la pagina.
- **MAP-02 Una mappa per tavolo.** Ogni need del tavolo è un punto etichettato con il suo codice (T1…T5), sullo stile delle mappe a quadranti già in uso (`quadrantMap` in `charts.js`):
  - **asse orizzontale: quanto è condiviso.** Quota dei votanti del tavolo che hanno scelto il need. La soglia è la quota media attesa, cioè 2 voti diviso il numero di need del tavolo (con 5 need, 40%): a destra il need è stato scelto più della media del tavolo, a sinistra meno;
  - **asse verticale: quanto è prioritario per chi lo ha scelto.** Quota di chi l'ha scelto che lo indica a priorità alta o massima (4–5). Soglia al 50%. Sopra il 100% c'è un po' di spazio, così un need al massimo non finisce sotto il nome del quadrante.

  Sopra la mappa: quante persone hanno votato, quante senza scegliere nessun need, e il valore delle due soglie.
- **MAP-03 Accanto alla mappa** c'è una tabella con, per ogni need: codice e titolo, numero di voti, distribuzione della priorità e dell'orizzonte con le etichette a parole. Nessuna media e nessun punteggio unico.
- **MAP-04 Need con pochi voti.** Un need con 0 voti non si disegna come punto, perché non ha un valore verticale: compare nella tabella come «nessun voto» e in un elenco sotto la mappa. Un need con 1–2 voti si disegna con il solo contorno e la nota «pochi voti», perché la sua quota verticale dipende da una o due persone.
- **MAP-05 Nomi dei quadranti** (in `pomeriggio-1.0.json`, da validare):

  | Quadrante | Nome proposto |
  |---|---|
  | in alto a destra | Condiviso e prioritario |
  | in basso a destra | Condiviso, priorità più bassa |
  | in alto a sinistra | Meno condiviso, prioritario per chi l'ha scelto |
  | in basso a sinistra | Meno condiviso, priorità più bassa |

  Un punto esattamente su una soglia conta a destra o in alto, come nelle mappe della Map.
- **MAP-06 Anonimato.** La plenaria non mostra né aziende né persone, solo conteggi per need.
- **MAP-07 Disponibilità.** La mappa di un tavolo compare solo con il tavolo in stato `chiuso` (R4). Prima la pagina dice «Voto in corso».

### 4.5 Scelta finale dei 3 need (referente o facilitatore)

- **SCE-01 Chi.** La registra il **referente** dal suo link (`/r/:token#/pomeriggio/:sid`) oppure il **facilitatore** dal tavolo dell'azienda nella console (`/tavolo-elis/:azienda#/pomeriggio/:sid`), come per il consolidamento della Map. Si fa solo nella fase «Scelta dei 3 need»; in quella fase la pagina del referente la propone in alto.
- **SCE-02 Che cosa vede** *(modificato, 5/11/2026)*. Tutti i need votati dalle persone dell'azienda, raggruppati per tavolo. Per ciascuno: codice, titolo e descrizione, **quante persone l'hanno votato** e con quali priorità e orizzonti (es. «2 voti · priorità: alta 1, massima 1 · orizzonte: entro 3 mesi 2»), **senza nomi** (R9). I voti si vedono solo nelle fasi «Scelta dei 3 need» e «Concluso»: prima la pagina lo spiega e non mostra nulla (R4). Nessun dato della Map (R1).
- **SCE-03 Che cosa sceglie.** Esattamente 3 need, solo tra quelli votati dalle proprie persone. Se i need votati sono meno di 3 (per esempio una delegazione di una persona, o persone che non hanno scelto nulla), si scelgono tutti quelli disponibili: la pagina lo dice, il pulsante diventa «Conferma i 2 need (votati solo 2)» e il report lo segnala.
- **SCE-04 Campo facoltativo.** Per ogni need scelto: *«Che cosa chiediamo al vertice?»* (massimo 300 caratteri, con l'avviso di non inserire dati personali o informazioni riservate). È facoltativo per non rallentare la chiusura. *(precisato)* Le scelte e le note si salvano da sole quando si tocca un need o si lascia il campo.
- **SCE-05 Una scelta per azienda.** Il pulsante «Conferma i 3 need» chiude la scelta, dopo un riepilogo. Dopo, solo la regia può riaprirla, con un motivo e solo nella fase «Scelta dei 3 need»; la scelta precedente resta nello storico.
- **SCE-06 Controllo della regia.** Nella scheda Pomeriggio la regia vede per ogni azienda quante persone hanno votato e lo stato della scelta (non iniziata, in corso, confermata), apre il tavolo dell'azienda e chiude il pomeriggio alle 17:00.

### 4.6 Report: sezione «Dai tavoli» (web e PDF)

- **REP-01** Il report dell'azienda ha una sezione **«Dai tavoli · sessione *Governare*»** per ogni sessione con voti o scelta, dopo le sezioni della Map e prima delle note metodologiche, sia nella pagina web sia nel PDF. Si congela nella stessa copia del report (`report_snapshots`), con la stessa versione e la stessa data.
- **REP-02** In apertura una frase dichiara: *«Questi dati vengono dalla votazione del pomeriggio: non entrano nello score né nel benchmark della Map.»*
- **REP-03** **I need scelti dall'azienda per il vertice**, ciascuno con codice, tavolo di provenienza, descrizione e «che cosa chiediamo al vertice» se compilato. Se i need sono meno di 3, il report lo segnala. Se la scelta non è stata confermata, il report lo dice.
- **REP-04** *(modificato, 5/11/2026: voti anonimi)* **Come hanno votato le persone dell'azienda (voti anonimi).** Per ogni tavolo: quante persone dell'azienda hanno votato e quante senza scegliere nessun need. Sotto, tutti i need del tavolo: quelli votati in evidenza, con il numero di voti, la distribuzione della priorità e dell'orizzonte con le etichette a parole (es. «T4 Un referente per il rischio AI · 2 voti · priorità: bassa 1, media 1 · orizzonte: tra 3 e 6 mesi 1, orizzonte non definito 1»); gli altri con «nessun voto». **Nessun nome di persona.**
- **REP-05** Grafica distinta dalla Map (R7): niente punteggi, fasce o radar.
- **REP-06** Se l'azienda non ha voti né scelta (nessuno al pomeriggio), la sezione non compare.

### 4.7 Export e registro

- **EXP-01** L'export Excel (solo Produzione, solo team ELIS) aggiunge tre fogli:
  - **Pomeriggio need**: need per tavolo, con codice, titolo, descrizione, tema e stato del tavolo;
  - **Pomeriggio voti**: voti per persona, con priorità e orizzonte, compresi i voti annullati e il motivo;
  - **Pomeriggio scelte**: scelte aziendali con i need e il campo «vertice», comprese le versioni precedenti.
- **EXP-02** Vanno nel registro modifiche:
  - cambi di fase (con il motivo se si torna indietro);
  - creazione, modifica e rimozione dei tavoli;
  - salvataggio e congelamento dei need, correzioni, chiusure e riaperture del voto;
  - voti annullati;
  - scelte confermate e riaperte;
  - revoca dei link dei facilitatori.

## 5. Come è stato realizzato

- **Tabelle** in `server/db.js`. L'ambiente (DEMO o Produzione) di tavoli, need e voti è quello della loro sessione (`sessions.seeded`), quindi non serve una colonna `seeded` in ogni tabella:
  - `pm_tables` (sessione, numero, titolo, tema, stato, codice del QR, link del facilitatore, date di congelamento e chiusura), con numero unico per sessione;
  - `pm_needs` (tavolo, codice T1–T5, titolo, descrizione), con `UNIQUE(table_id, code)`;
  - `pm_people`: chi vota. È il profilo del mattino se c'è (`participant_id`), altrimenti solo nome e funzione. Tenerlo separato dai partecipanti della Map garantisce VOT-02. Un solo profilo per partecipante del mattino;
  - `pm_votes` (persona, tavolo, «nessun need», `is_current`, motivo dell'annullamento): un solo voto corrente per persona, garantito dal database;
  - `pm_vote_items` (voto, need, priorità 1–5, orizzonte);
  - `pm_choices` (sessione, azienda, need scelti con la nota per il vertice, data di conferma, `is_current`): ogni salvataggio è una riga nuova.
- **Migrazione:** `ALTER TABLE sessions ADD COLUMN pm_phase TEXT NOT NULL DEFAULT 'chiuso'`.
- **Configurazione:** `server/instrument/pomeriggio-1.0.json` (versione P1.0) con testi delle domande, etichette di priorità e orizzonte, limiti di lunghezza, soglie della mappa (quota media attesa, 50%, pochi voti sotto 3), nomi dei quadranti e nomi delle fasi.
- **Codice:** regole in `server/pomeriggio.js`; API in `server/index.js` (sezione «Pomeriggio»); pagine in `public/pm-voto.html`, `public/pm-tavolo.html`, `public/pm-plenaria.html` con gli script `public/js/pm-voto.js`, `pm-tavolo.js`, `pm-plenaria.js`, `pm-choice.js` (scelta) e `pm-admin.js` (scheda della console e cartoncini QR).
- **Percorsi:**
  - `/t/:code`: QR del tavolo, telefono della persona;
  - `/ft/:token`: telefono del facilitatore del tavolo (diverso da `/api/f/:c`, che è il facilitatore per azienda);
  - `/plenaria-pomeriggio/:sid`: plenaria, solo team ELIS;
  - `#/pomeriggio/:sid` nella pagina del referente e nel tavolo dell'azienda: scelta dei 3 need;
  - `#/pm-qr/:sid` nella console: cartoncini QR dei tavoli.
- **Riuso:** codice del partecipante salvato sul telefono al mattino, percorso «Chi sei?» con lo stesso confronto dei nomi, limite ai codici azienda sbagliati, `quadrantMap` per le mappe, conferme con motivo, registro modifiche, controllo dell'ambiente sulle API della console.
- **DEMO:** ogni sessione DEMO ha un pomeriggio dimostrativo con due tavoli, need, voti delle persone dell'azienda guidata e di due persone per ogni azienda della community, scelte confermate. È svolto con le regole vere e fa parte del report dell'azienda guidata. «Riparti da zero» e «Cancella tutti i dati DEMO» lo tolgono.
- **Test** (`test/pomeriggio.test.js`, 7 test, insieme agli altri 41):
  - limite di 2 need;
  - un voto per persona, anche cambiando tavolo;
  - protezione del nome;
  - need congelati;
  - mappa solo a voto chiuso, con quote e soglie;
  - nessun dato della Map nelle API del pomeriggio;
  - nessun nome in plenaria, nella pagina di scelta e nel report;
  - scelta di esattamente 3 need, o meno se non ce ne sono;
  - riaperture con motivo;
  - separazione DEMO/Produzione;
  - presenza della sezione nel PDF;
  - export.
- **Revisori:** Code Reviewer e UX Researcher (5/11/2026); tutti i punti segnalati sono stati corretti (paragrafo 8). Restano da fare: Data Privacy Officer sull'informativa e Reality Checker prima del 19/11.

## 6. Priorità di consegna

| Entro | Che cosa | Stato |
|---|---|---|
| **Prova generale prima del 19/11** | 4.1 Tavoli · 4.2 Need · 4.3 Voto · 4.4 Mappe · 4.5 Scelta finale | Fatto, pubblicato; manca la prova generale online |
| **Entro 7 giorni dalla sessione** | 4.6 Sezione del report · 4.7 Export | Fatto, pubblicato |
| **Dopo Governare** | DEMO del pomeriggio, rifiniture | DEMO fatta, pubblicata |

## 7. Punti ancora aperti

- **Piano Render.** Sul piano gratuito ogni riavvio, e ogni pausa di circa 15 minuti senza visite, cancella i dati: i voti del pomeriggio andrebbero persi. Prima del 19/11 serve il piano Starter con disco (`render.yaml` è già pronto).
- **Prova generale online** con telefoni veri: riconoscimento dal telefono del mattino, voto, chiusura, plenaria, scelta, report. Va ripetuta online anche la prova con molti telefoni (VOT-07).
- **Nomi dei quadranti e soglie della mappa** (MAP-02, MAP-05): proposti dalla piattaforma, da validare con il team. Si cambiano in `pomeriggio-1.0.json`, con una nuova versione del file, senza toccare il codice.
- **Informativa privacy.** I voti sono anonimi per referente, report e plenaria (R9), ma ELIS conserva chi ha votato che cosa (console ed export). Va detto nell'informativa: da sentire con il Data Privacy Officer.
- **Un nome già entrato da un altro telefono** (VOT-01a). Se una persona perde il telefono con cui è entrata al pomeriggio, oggi la regia può annullare un voto ma non liberare il nome. Se il caso si presenta in prova generale, si aggiunge un comando nella console.
- **Allineamento con la v14.** La v14 prevede anche ambito interessato, supporto ELIS, contesto aziendale e altri campi della scheda aziendale. Qui sono esclusi per scelta del team. Se l'Agenda viene aggiornata, conviene portarla in linea con questo perimetro.

## 8. Modifiche del 5 novembre 2026 rispetto alla versione 1

**Decisioni del team**
- **Voti anonimi** (R9 nuova, REP-04, SCE-02, VOT-05a). Il report non mostra più che cosa ha votato ogni persona: mostra conteggi per tavolo e per need. Anche il referente, nella pagina di scelta, vede solo conteggi. L'avviso sul telefono lo dice prima dell'invio. Il punto aperto «nomi delle persone nel PDF» è superato.

**Sicurezza e regole, dalla revisione del codice**
- **Protezione del nome** (VOT-01a): un nome già entrato al pomeriggio non si prende da un altro telefono. Nessuno può votare al posto di un collega usando il codice azienda.
- **I voti dell'azienda si vedono solo nella fase di scelta** (R4, SCE-02).
- **Registrazione ed elenco dei nomi solo con i tavoli aperti**, presa visione per ogni profilo nuovo, limite alle persone aggiunte (VOT-02).
- **Un voto corrente per persona e un profilo per partecipante**, garantiti anche dal database (R5).
- **Riaperture limitate alla fase giusta:**
  - un voto chiuso per errore si riapre solo nella fase dei tavoli (TAV-05);
  - una scelta si riapre solo nella fase di scelta (SCE-05).
- **Il QR del tavolo non riceve più il codice della sessione del mattino** (VOT-09). Una registrazione del mattino annullata non vota al pomeriggio (VOT-06).

**Uso dal telefono, dalla revisione UX**
- **Persona:**
  - «Non sei tu?» (VOT-01b);
  - testo «Non ti abbiamo riconosciuto» (VOT-01);
  - nota sul termine «need», limite di 2 scritto accanto al contatore, «Togli le scelte» al posto di «Non scelgo nessuno» quando ci sono scelte (VOT-03);
  - risposte mancanti segnate accanto al need (VOT-04);
  - conferma con segno verde e ora (VOT-05);
  - avviso se il voto si chiude mentre si vota (VOT-08).
- **Facilitatore:**
  - salvataggio automatico, prima riga aperta, descrizione su due righe, conferma prima di togliere un need, fuoco dopo uno spostamento (NEED-06);
  - pulsante grigio finché la regia non avvia i tavoli (NEED-03).
- **Referente:**
  - codici del tavolo uguali ovunque, pulsante che dice quanti need si confermano quando sono meno di 3 (SCE-03);
  - salvataggio automatico delle note (SCE-04).

**Precisazioni dalla realizzazione**
- **Tabelle:** la tabella `pm_people` tiene separate le persone del pomeriggio dai partecipanti della Map. L'ambiente si ricava dalla sessione (paragrafo 5).
- **Report:** la sezione «Dai tavoli» è anche nel report web, non solo nel PDF, una per ogni sessione con voti (REP-01).
- **Console:** a pomeriggio concluso la console nasconde correzioni e link dei facilitatori (TAV-06).
- **Plenaria:** spazio sopra il 100% sulla mappa; aggiornamento senza ricaricare (MAP-01, MAP-02).
- **Stato:** esito della prova di carico locale (VOT-07); stato di consegna (paragrafo 6).
