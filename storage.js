// Unico punto di accesso ai dati salvati. Il resto dell'app non tocca mai
// localStorage: per passare a una sincronizzazione basta cambiare questo modulo.
//
// Si salvano solo esami, argomenti, sessioni, compiti e impostazioni, più lo
// stato del timer in corso (serve a sopravvivere a un ricaricamento).
// Tutto ciò che si può calcolare (ritmo, percentuali, streak) non sta qui.

const CHIAVE = 'app-studio:v1';

export const IMPOSTAZIONI_DEFAULT = Object.freeze({
  durataPomodoro: 25,
  pausaBreve: 5,
  pausaLunga: 15,
  pomodoriPrimaPausaLunga: 4,
});

const TIMER_VUOTO = Object.freeze({ attivo: null, daConfermare: null });

function datiVuoti() {
  return {
    versione: 1,
    esami: [],
    argomenti: [],
    sessioni: [],
    compiti: [],
    impostazioni: { ...IMPOSTAZIONI_DEFAULT },
    timer: { ...TIMER_VUOTO },
  };
}

let backend = globalThis.localStorage;
let dati = null;

/** Sostituisce il backend (un oggetto con getItem/setItem); usato nei test. */
export function usaBackend(nuovo) {
  backend = nuovo;
  dati = null;
}

/** Dimentica la copia in memoria: la prossima lettura riparte dal backend (es. dopo modifiche da un'altra scheda). */
export function ricarica() {
  dati = null;
}

function leggi() {
  if (dati) return dati;
  const grezzo = backend.getItem(CHIAVE);
  if (!grezzo) {
    dati = datiVuoti();
    return dati;
  }
  try {
    dati = { ...datiVuoti(), ...JSON.parse(grezzo) };
  } catch {
    // Dati illeggibili: si mettono da parte invece di sovrascriverli.
    backend.setItem(`${CHIAVE}:corrotto:${Date.now()}`, grezzo);
    dati = datiVuoti();
  }
  return dati;
}

function scrivi() {
  backend.setItem(CHIAVE, JSON.stringify(dati));
}

const copia = (x) => structuredClone(x);

// crypto.randomUUID esiste solo in contesti sicuri (https o localhost):
// dal telefono via indirizzo di rete locale non è disponibile.
export function nuovoId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function upsert(lista, elemento) {
  const i = lista.findIndex((x) => x.id === elemento.id);
  if (i === -1) lista.push(elemento);
  else lista[i] = elemento;
}

// ---------------------------------------------------------------- esami

export function getEsami() {
  return copia(leggi().esami);
}

export function getEsame(id) {
  const esame = leggi().esami.find((e) => e.id === id);
  return esame ? copia(esame) : null;
}

/** Crea o aggiorna un esame. Senza id ne assegna uno nuovo. Restituisce l'esame salvato. */
export function salvaEsame(esame) {
  const salvato = { ...copia(esame), id: esame.id ?? nuovoId() };
  upsert(leggi().esami, salvato);
  scrivi();
  return copia(salvato);
}

/** Elimina l'esame con i suoi argomenti e le sessioni di quegli argomenti. */
export function eliminaEsame(id) {
  const d = leggi();
  const argomentiIds = new Set(d.argomenti.filter((a) => a.esameId === id).map((a) => a.id));
  d.esami = d.esami.filter((e) => e.id !== id);
  d.argomenti = d.argomenti.filter((a) => a.esameId !== id);
  d.sessioni = d.sessioni.filter((s) => !argomentiIds.has(s.argomentoId));
  scrivi();
}

// ---------------------------------------------------------------- argomenti

/** Argomenti dell'esame, in ordine. */
export function getArgomenti(esameId) {
  return copia(
    leggi()
      .argomenti.filter((a) => a.esameId === esameId)
      .sort((a, b) => a.ordine - b.ordine),
  );
}

/** Aggiunge in coda nuovi argomenti da fare. `nuovi` è una lista di { titolo, peso }. */
export function aggiungiArgomenti(esameId, nuovi) {
  const d = leggi();
  const ordini = d.argomenti.filter((a) => a.esameId === esameId).map((a) => a.ordine);
  let ordine = ordini.length ? Math.max(...ordini) : 0;
  const creati = nuovi.map(({ titolo, peso }) => ({
    id: nuovoId(),
    esameId,
    titolo,
    peso,
    stato: 'da_fare',
    ordine: ++ordine,
    dataCompletamento: null,
  }));
  d.argomenti.push(...creati);
  scrivi();
  return copia(creati);
}

export function salvaArgomento(argomento) {
  upsert(leggi().argomenti, copia(argomento));
  scrivi();
}

/** Elimina l'argomento. Le sue sessioni restano: sono pur sempre giorni di studio. */
export function eliminaArgomento(id) {
  const d = leggi();
  d.argomenti = d.argomenti.filter((a) => a.id !== id);
  scrivi();
}

/** Rinumera l'ordine degli argomenti dell'esame seguendo la lista di id. */
export function riordinaArgomenti(esameId, idsInOrdine) {
  const posizione = new Map(idsInOrdine.map((id, i) => [id, i + 1]));
  for (const a of leggi().argomenti) {
    if (a.esameId === esameId && posizione.has(a.id)) a.ordine = posizione.get(a.id);
  }
  scrivi();
}

// ---------------------------------------------------------------- sessioni

export function getSessioni() {
  return copia(leggi().sessioni);
}

/**
 * Registra un pomodoro portato a termine: { id?, argomentoId, data, durataMinuti }.
 * Se l'id è già registrato non fa nulla: il timer lo usa per non contare due volte
 * un pomodoro chiuso da due schede aperte insieme.
 */
export function aggiungiSessione(sessione) {
  const d = leggi();
  const esistente = sessione.id && d.sessioni.find((s) => s.id === sessione.id);
  if (esistente) return copia(esistente);
  const salvata = { id: nuovoId(), ...copia(sessione) };
  d.sessioni.push(salvata);
  scrivi();
  return copia(salvata);
}

/** Elimina tutte le sessioni di una data ('YYYY-MM-DD'). Restituisce quante ne ha tolte. */
export function eliminaSessioniDelGiorno(data) {
  const d = leggi();
  const prima = d.sessioni.length;
  d.sessioni = d.sessioni.filter((s) => s.data !== data);
  const tolte = prima - d.sessioni.length;
  if (tolte) scrivi();
  return tolte;
}

// ---------------------------------------------------------------- compiti

export function getCompiti() {
  return copia(leggi().compiti);
}

export function aggiungiCompito(testo) {
  const compito = { id: nuovoId(), testo, fatto: false };
  leggi().compiti.push(compito);
  scrivi();
  return copia(compito);
}

export function salvaCompito(compito) {
  upsert(leggi().compiti, copia(compito));
  scrivi();
}

export function eliminaCompito(id) {
  const d = leggi();
  d.compiti = d.compiti.filter((c) => c.id !== id);
  scrivi();
}

// ---------------------------------------------------------------- impostazioni

export function getImpostazioni() {
  return { ...IMPOSTAZIONI_DEFAULT, ...leggi().impostazioni };
}

export function salvaImpostazioni(impostazioni) {
  leggi().impostazioni = { ...getImpostazioni(), ...impostazioni };
  scrivi();
}

// ---------------------------------------------------------------- timer

/** Stato del timer: { attivo, daConfermare } (vedi logic.js). */
export function getTimer() {
  return { ...TIMER_VUOTO, ...copia(leggi().timer ?? {}) };
}

export function salvaTimer(stato) {
  leggi().timer = copia(stato);
  scrivi();
}
