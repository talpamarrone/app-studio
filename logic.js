// Logica di calcolo dell'app: solo funzioni pure, senza DOM né storage.
//
// Convenzioni:
// - Le date sono stringhe 'YYYY-MM-DD' in ora locale; si confrontano come stringhe.
// - "Oggi" arriva sempre come parametro.
// - I giorni della settimana seguono Date#getDay: 0 = domenica … 6 = sabato.
// - Una sessione è un pomodoro portato a termine.

const MS_GIORNO = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- date

// Le date si trattano come mezzanotte UTC: niente salti di ora legale.
function inMs(data) {
  const [anno, mese, giorno] = data.split('-').map(Number);
  return Date.UTC(anno, mese - 1, giorno);
}

function daMs(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function aggiungiGiorni(data, n) {
  return daMs(inMs(data) + n * MS_GIORNO);
}

/** Giorni da `da` ad `a` (positivo se `a` è dopo `da`). */
export function differenzaGiorni(da, a) {
  return Math.round((inMs(a) - inMs(da)) / MS_GIORNO);
}

export function giornoSettimana(data) {
  return new Date(inMs(data)).getUTCDay();
}

// ---------------------------------------------------------------- calendario dell'esame

export function isGiornoRiposo(data, giorniRiposo = []) {
  return giorniRiposo.includes(giornoSettimana(data));
}

/** Primo giorno di ripasso: gli ultimi N giorni di calendario prima dell'esame. */
export function inizioRipasso(esame) {
  return aggiungiGiorni(esame.dataEsame, -(esame.giorniRipasso ?? 0));
}

/** Giorno di studio del piano: da dataInizio, prima del ripasso, non di riposo. */
export function isGiornoStudio(data, esame) {
  return (
    data >= esame.dataInizio &&
    data < inizioRipasso(esame) &&
    !isGiornoRiposo(data, esame.giorniRiposo)
  );
}

/** Giorni di studio nell'intervallo [da, a). */
export function contaGiorniStudio(esame, da, a) {
  let n = 0;
  for (let d = da; d < a; d = aggiungiGiorni(d, 1)) {
    if (isGiornoStudio(d, esame)) n++;
  }
  return n;
}

export function giorniStudioTotali(esame) {
  return contaGiorniStudio(esame, esame.dataInizio, inizioRipasso(esame));
}

/** Giorni di studio da oggi (incluso) all'inizio del ripasso. */
export function giorniStudioRimasti(esame, oggi) {
  return contaGiorniStudio(esame, oggi, inizioRipasso(esame));
}

/** 'studio' | 'in_ripasso' | 'esame_oggi' | 'esame_passato' */
export function faseEsame(esame, oggi) {
  if (oggi > esame.dataEsame) return 'esame_passato';
  if (oggi === esame.dataEsame) return 'esame_oggi';
  if (oggi >= inizioRipasso(esame)) return 'in_ripasso';
  return 'studio';
}

// ---------------------------------------------------------------- pesi

export function pomodoriPerArgomento(sessioni) {
  const conteggio = new Map();
  for (const s of sessioni) {
    conteggio.set(s.argomentoId, (conteggio.get(s.argomentoId) ?? 0) + 1);
  }
  return conteggio;
}

export function pomodoriDelGiorno(sessioni, data) {
  return sessioni.filter((s) => s.data === data).length;
}

// Un argomento fatto vale il peso pieno; in corso vale i pomodori fatti, fino al peso.
function pesoFatto(argomento, pomodori) {
  if (argomento.stato === 'fatto') return argomento.peso;
  if (argomento.stato === 'in_corso') return Math.min(pomodori, argomento.peso);
  return 0;
}

export function pesoTotale(argomenti) {
  return argomenti.reduce((somma, a) => somma + a.peso, 0);
}

export function pesoCompletato(argomenti, sessioni) {
  const pomodori = pomodoriPerArgomento(sessioni);
  return argomenti.reduce((somma, a) => somma + pesoFatto(a, pomodori.get(a.id) ?? 0), 0);
}

export function pesoRimanente(argomenti, sessioni) {
  return pesoTotale(argomenti) - pesoCompletato(argomenti, sessioni);
}

/**
 * Peso completato com'era all'inizio di `oggi`: si ignorano le sessioni di oggi
 * e gli argomenti completati oggi contano come ancora in corso.
 */
export function pesoCompletatoInizioGiornata(argomenti, sessioni, oggi) {
  const pomodori = pomodoriPerArgomento(sessioni.filter((s) => s.data < oggi));
  return argomenti.reduce((somma, a) => {
    const fattoDaOggi = a.stato === 'fatto' && a.dataCompletamento && a.dataCompletamento >= oggi;
    const comEra = fattoDaOggi ? { ...a, stato: 'in_corso' } : a;
    return somma + pesoFatto(comEra, pomodori.get(a.id) ?? 0);
  }, 0);
}

// ---------------------------------------------------------------- obiettivo di oggi

/**
 * Pomodori da fare oggi. Restituisce { stato, obiettivo, pesoRimanente, giorniRimasti }.
 * stato: 'studio' | 'riposo' | 'non_iniziato' | 'in_ripasso' | 'esame_oggi' | 'esame_passato'.
 * obiettivo è null solo il giorno dell'esame e dopo.
 */
export function obiettivoOggi(esame, argomenti, sessioni, oggi) {
  const fase = faseEsame(esame, oggi);
  const rimanente = pesoTotale(argomenti) - pesoCompletatoInizioGiornata(argomenti, sessioni, oggi);

  if (fase === 'esame_oggi' || fase === 'esame_passato') {
    return { stato: fase, obiettivo: null, pesoRimanente: rimanente, giorniRimasti: 0 };
  }

  const giorniAllEsame = differenzaGiorni(oggi, esame.dataEsame);
  const giorniStudio = giorniStudioRimasti(esame, oggi);

  // In ripasso, o senza più giorni di studio pianificati, il peso che resta
  // si distribuisce su tutti i giorni di calendario che mancano all'esame.
  if (fase === 'in_ripasso' || giorniStudio === 0) {
    return {
      stato: fase,
      obiettivo: Math.ceil(rimanente / giorniAllEsame),
      pesoRimanente: rimanente,
      giorniRimasti: giorniAllEsame,
    };
  }

  if (!isGiornoStudio(oggi, esame)) {
    const stato = oggi < esame.dataInizio ? 'non_iniziato' : 'riposo';
    return { stato, obiettivo: 0, pesoRimanente: rimanente, giorniRimasti: giorniStudio };
  }

  return {
    stato: 'studio',
    obiettivo: Math.ceil(rimanente / giorniStudio),
    pesoRimanente: rimanente,
    giorniRimasti: giorniStudio,
  };
}

// ---------------------------------------------------------------- ritmo costante

/** Peso che avrei completato a fine di `oggi` con un ritmo costante dall'inizio. */
export function pesoPrevisto(esame, argomenti, oggi) {
  const totale = pesoTotale(argomenti);
  const giorniTotali = giorniStudioTotali(esame);
  if (giorniTotali === 0) return totale;
  const trascorsi = contaGiorniStudio(esame, esame.dataInizio, aggiungiGiorni(oggi, 1));
  return (totale * trascorsi) / giorniTotali;
}

/** Peso di un giorno di ritmo costante, minimo 1. */
export function tolleranzaInLinea(esame, argomenti) {
  const giorniTotali = giorniStudioTotali(esame);
  if (giorniTotali === 0) return 1;
  return Math.max(1, pesoTotale(argomenti) / giorniTotali);
}

export function ordinaArgomenti(argomenti) {
  return [...argomenti].sort((a, b) => a.ordine - b.ordine);
}

/** L'argomento su cui sarei a fine di oggi con un ritmo costante; null se il programma sarebbe finito. */
export function dovreiEssereQui(esame, argomenti, oggi) {
  const previsto = pesoPrevisto(esame, argomenti, oggi);
  let cumulato = 0;
  for (const a of ordinaArgomenti(argomenti)) {
    cumulato += a.peso;
    if (cumulato > previsto) return a;
  }
  return null;
}

const EPSILON = 1e-9;

/**
 * Confronta il peso completato con quello previsto a fine di oggi.
 * Restituisce { stato, completato, previsto, tolleranza }, con stato
 * 'in_anticipo' | 'in_linea' | 'indietro'.
 */
export function statoAvanzamento(esame, argomenti, sessioni, oggi) {
  const completato = pesoCompletato(argomenti, sessioni);
  const previsto = pesoPrevisto(esame, argomenti, oggi);
  const tolleranza = tolleranzaInLinea(esame, argomenti);
  const scarto = completato - previsto;

  let stato = 'in_linea';
  if (scarto > tolleranza + EPSILON) stato = 'in_anticipo';
  else if (scarto < -tolleranza - EPSILON) stato = 'indietro';

  return { stato, completato, previsto, tolleranza };
}

// ---------------------------------------------------------------- streak

/**
 * Giorni consecutivi con almeno un pomodoro, fino a oggi. I giorni di riposo
 * senza studio non la interrompono; se si studia di riposo contano +1.
 * Se oggi non ho ancora studiato vale la streak di ieri.
 */
export function streak(sessioni, giorniRiposo, oggi) {
  const studiati = new Set(sessioni.map((s) => s.data).filter((d) => d <= oggi));
  if (studiati.size === 0) return 0;
  const primo = [...studiati].sort()[0];

  let n = 0;
  let d = studiati.has(oggi) ? oggi : aggiungiGiorni(oggi, -1);
  while (d >= primo) {
    if (studiati.has(d)) n++;
    else if (!isGiornoRiposo(d, giorniRiposo)) break;
    d = aggiungiGiorni(d, -1);
  }
  return n;
}
