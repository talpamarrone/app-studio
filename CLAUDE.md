# App di studio per esami

App web personale per pianificare lo studio in vista di un esame: programma pesato, ritmo giornaliero, timer pomodoro, streak.

## Principio guida

Tutte le schermate sono viste sugli stessi dati. Si salvano solo esami, argomenti, sessioni e impostazioni.
Ritmo, percentuali, streak e punti si **calcolano sempre** dai dati, non si salvano mai.

## Stack

- HTML, CSS e JavaScript puro (moduli ES), nessun framework, nessun passaggio di build.
- Dati in `localStorage`, dietro un unico modulo `storage.js` (così in futuro si può sostituire con una sincronizzazione).
- Tutta la logica di calcolo in `logic.js`: funzioni pure, senza accesso a DOM o storage, che ricevono la data di "oggi" come parametro.
- Test della logica con il test runner integrato di Node (`node --test`).
- Avvio in sviluppo: `npm start` (`server.js`, server statico senza dipendenze, porta 8080, raggiungibile anche dalla rete locale).
- Deve funzionare bene su telefono (layout mobile-first) e su PC.
- Interfaccia in italiano.

## Modello dati

- **Esame**: `id`, `nome`, `dataEsame`, `giorniRiposo` (giorni della settimana senza studio), `giorniRipasso` (giorni finali riservati al ripasso, esclusi dal calcolo del ritmo).
- **Argomento**: `id`, `esameId`, `titolo`, `peso` (pomodori stimati), `stato` (`da_fare` | `in_corso` | `fatto`), `ordine`, `dataCompletamento`.
- **Sessione**: `id`, `argomentoId`, `data`, `durataMinuti`. Una sessione = un pomodoro portato a termine.
- **Compito**: `id`, `testo`, `fatto`. Promemoria generici che NON entrano nel calcolo della progressione.
- **Impostazioni**: durata pomodoro (default 25), pausa breve (5), pausa lunga (15), pomodori prima della pausa lunga (4).

Il modello supporta più esami fin da subito, anche se l'interfaccia iniziale ne gestisce uno.

## Regole di calcolo (logic.js)

- **Peso rimanente** = peso totale − peso completato (vedi Decisioni: anche i pomodori sugli argomenti `in_corso` lo riducono).
- **Giorni di studio rimasti** = giorni da oggi alla data d'esame, esclusi i giorni di riposo e i `giorniRipasso` finali. Oggi conta se è un giorno di studio.
- **Obiettivo di oggi** = peso rimanente ÷ giorni di studio rimasti, arrotondato per eccesso. Si ricalcola ogni giorno: se resto indietro, sale da solo.
- **Dove dovrei essere** = l'argomento a cui sarei arrivato oggi seguendo un ritmo costante dall'inizio.
- **Stato** = `in anticipo` / `in linea` / `indietro`, confrontando il peso completato con quello previsto a oggi.
- **Streak** = giorni di studio consecutivi con almeno un pomodoro. I giorni di riposo pianificati non la interrompono.
- Casi limite da gestire e testare: esame già passato, zero giorni rimasti, programma vuoto, tutto completato, esame domani.

## Decisioni

- L'Esame ha un campo `dataInizio` (default: data di creazione, modificabile).
- Il giorno dell'esame non è giorno di studio.
- `giorniRipasso` sono giorni di calendario: gli ultimi N giorni prima dell'esame, riposo incluso.
- L'obiettivo di oggi si calcola sul peso rimanente a inizio giornata, ignorando argomenti completati oggi e sessioni di oggi, così non cambia durante il giorno.
- Peso completato: un argomento `in_corso` conta min(pomodori fatti, peso); un argomento `fatto` conta sempre il peso pieno.
- Tolleranza per "in linea": un giorno di ritmo costante (pesoTotale ÷ giorni di studio totali, minimo 1).
- Streak: se oggi non ho ancora studiato vale quella di ieri fino a fine giornata; studiare in un giorno di riposo fa +1.
- Con zero giorni di studio rimasti l'obiettivo è `null` con stato esplicito: `esame_oggi` o `esame_passato`. Nello stato `in_ripasso` con argomenti ancora da fare, invece, l'obiettivo è peso rimanente ÷ giorni che mancano all'esame.
- In un giorno di riposo l'obiettivo è 0 con stato `riposo`; prima di `dataInizio` è 0 con stato `non_iniziato`.
- Se prima dell'esame restano solo giorni di riposo (nessun giorno di studio rimasto, fuori dal ripasso), si applica la regola del ripasso: peso rimanente ÷ giorni di calendario che mancano all'esame.
- Timer: lo stato del timer in corso (`{ attivo, daConfermare }`) si salva nello storage, perché deve sopravvivere a un ricaricamento. Il timer salva orari, non tick: `inizio`, `pausaMs`, `inPausaDa`.
- Timer: la pausa parte dall'orario esatto di fine del pomodoro; a fine pausa il timer si ferma e il pomodoro successivo si avvia a mano.
- Timer: la pausa lunga scatta dopo ogni N-esimo pomodoro della giornata (N = pomodori prima della pausa lunga).
- Timer: la sessione ha la data del momento in cui il pomodoro è finito. Chiudere la domanda "finito?" senza rispondere vale "resta in corso".
- Timer: `?veloce` nell'indirizzo fa durare ogni minuto un secondo, per le prove.

## Schermate

1. **Oggi** (home): obiettivo del giorno e pomodori già fatti, timer, prossimi 2-3 argomenti, stato in linea/indietro.
2. **Programma**: lista argomenti ordinabile, con peso e stato, più un segnaposto "dovresti essere qui". Sotto, la lista dei compiti generici.
3. **Progressi**: percentuale completata, calendario dei giorni studiati, streak.

## Timer pomodoro

- Si avvia scegliendo un argomento; al termine registra una Sessione e chiede se l'argomento è finito o resta in corso.
- Deve restare corretto anche con la scheda in background: calcolare il tempo dall'orario di inizio, non contare i tick.
- Avviso sonoro e notifica a fine pomodoro e a fine pausa.

## Ordine di sviluppo

1. `logic.js` con i test.
2. Esame + lista argomenti pesati + schermata Programma.
3. Timer collegato agli argomenti.
4. Schermata Oggi.
5. Streak, calendario, schermata Progressi.
6. Dopo: ripasso, ricalibrazione delle stime, esporta/importa dati, badge.

## Regole di lavoro

- Una fase alla volta: non anticipare le fasi successive.
- Dopo ogni modifica alla logica, eseguire i test.
- Non aggiungere dipendenze senza chiedere.
- Fare un commit git alla fine di ogni fase funzionante.
