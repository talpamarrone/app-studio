// Schermata Programma con il timer: legge dallo storage, calcola con logic.js, disegna.
// Ogni modifica salva e ridisegna tutto: i dati sono pochi.

import * as storage from './storage.js';
import {
  MS_MINUTO,
  argomentoProposto,
  avanzaTimer,
  avviaFase,
  conStato,
  dataLocale,
  differenzaGiorni,
  dovreiEssereQui,
  faseEsame,
  formattaTempo,
  giorniStudioRimasti,
  giorniStudioTotali,
  isScaduto,
  mettiInPausa,
  percentualeCompletata,
  pesoRimanente,
  pomodoriDelGiorno,
  pomodoriPerArgomento,
  riprendi,
  tempoRimanente,
  tempoTrascorso,
  titoliDaElenco,
} from './logic.js';

// Lunedì per primo; i valori seguono Date#getDay (0 = domenica).
const GIORNI = [
  { valore: 1, nome: 'Lun' },
  { valore: 2, nome: 'Mar' },
  { valore: 3, nome: 'Mer' },
  { valore: 4, nome: 'Gio' },
  { valore: 5, nome: 'Ven' },
  { valore: 6, nome: 'Sab' },
  { valore: 0, nome: 'Dom' },
];

const NOMI_STATO = { da_fare: 'Da fare', in_corso: 'In corso', fatto: 'Fatto' };
const STATO_SUCCESSIVO = { da_fare: 'in_corso', in_corso: 'fatto', fatto: 'da_fare' };

const $ = (selettore) => document.querySelector(selettore);

// ---------------------------------------------------------------- utilità

/** Data locale di oggi come 'YYYY-MM-DD'. */
function oggi() {
  return dataLocale(Date.now());
}

function formattaData(data, opzioni = { weekday: 'short', day: 'numeric', month: 'short' }) {
  const [anno, mese, giorno] = data.split('-').map(Number);
  return new Date(anno, mese - 1, giorno).toLocaleDateString('it-IT', opzioni);
}

function esc(testo) {
  return String(testo).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function plurale(n, singolare, plurale) {
  return `${n} ${n === 1 ? singolare : plurale}`;
}

function leggiPeso(valore) {
  const n = Number(valore);
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
}

// L'interfaccia per ora gestisce un solo esame.
function esameCorrente() {
  return storage.getEsami()[0] ?? null;
}

// ---------------------------------------------------------------- disegno

function render() {
  // Prima si registrano i pomodori scaduti (anche a pagina chiusa), poi si disegna.
  aggiornaStatoTimer();

  const esame = esameCorrente();
  const giorno = oggi();
  const argomenti = esame ? storage.getArgomenti(esame.id) : [];
  const sessioni = storage.getSessioni();

  $('#benvenuto').hidden = Boolean(esame);
  $('#esame').hidden = !esame;
  $('#riepilogo').hidden = !esame;
  $('#sezione-argomenti').hidden = !esame;

  if (esame) {
    renderEsame(esame, giorno);
    renderRiepilogo(esame, argomenti, sessioni, giorno);
    renderArgomenti(esame, argomenti, sessioni, giorno);
  }
  renderTimer(esame, argomenti, sessioni, giorno);
  renderEsito(argomenti);
  renderCompiti();
}

function renderEsame(esame, giorno) {
  const mancano = differenzaGiorni(giorno, esame.dataEsame);
  let quando;
  if (mancano > 1) quando = `tra ${mancano} giorni`;
  else if (mancano === 1) quando = 'domani';
  else if (mancano === 0) quando = 'oggi';
  else quando = 'passato';

  const riposo = GIORNI.filter((g) => esame.giorniRiposo.includes(g.valore)).map((g) => g.nome);
  const dettagli = [
    riposo.length ? `Riposo: ${riposo.join(', ')}` : 'Nessun giorno di riposo',
    esame.giorniRipasso ? `${plurale(esame.giorniRipasso, 'giorno', 'giorni')} di ripasso` : null,
  ].filter(Boolean);

  $('#esame').innerHTML = `
    <div class="esame-testo">
      <h2>${esc(esame.nome)}</h2>
      <p class="esame-data">${esc(formattaData(esame.dataEsame, { weekday: 'long', day: 'numeric', month: 'long' }))}
        · <strong>${quando}</strong></p>
      <p class="nota">${esc(dettagli.join(' · '))}</p>
    </div>
    <button type="button" class="secondario piccolo" data-apri="esame">Modifica</button>`;
}

function renderRiepilogo(esame, argomenti, sessioni, giorno) {
  const percentuale = percentualeCompletata(argomenti, sessioni);
  const rimanente = pesoRimanente(argomenti, sessioni);
  const giorni = giorniStudioRimasti(esame, giorno);
  const fase = faseEsame(esame, giorno);

  let nota = '';
  if (fase === 'in_ripasso') nota = `Sei nei giorni di ripasso: mancano ${plurale(differenzaGiorni(giorno, esame.dataEsame), 'giorno', 'giorni')} all'esame.`;
  else if (fase === 'esame_oggi') nota = 'L\'esame è oggi. In bocca al lupo!';
  else if (fase === 'esame_passato') nota = 'La data dell\'esame è passata.';
  else if (giorno < esame.dataInizio) nota = `Lo studio inizia ${formattaData(esame.dataInizio)}.`;

  $('#riepilogo').innerHTML = `
    <div class="statistiche">
      <div><strong>${percentuale}%</strong><span>completato</span></div>
      <div><strong>${rimanente}</strong><span>${rimanente === 1 ? 'pomodoro rimasto' : 'pomodori rimasti'}</span></div>
      <div><strong>${giorni}</strong><span>${giorni === 1 ? 'giorno di studio' : 'giorni di studio'}</span></div>
    </div>
    <div class="barra-progresso" role="progressbar" aria-label="Programma completato"
         aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentuale}">
      <div style="width: ${percentuale}%"></div>
    </div>
    ${nota ? `<p class="nota">${esc(nota)}</p>` : ''}`;
}

function renderArgomenti(esame, argomenti, sessioni, giorno) {
  const lista = $('#lista-argomenti');
  if (argomenti.length === 0) {
    lista.innerHTML = `<li class="vuoto">Nessun argomento. Aggiungine uno qui sotto o incolla un elenco.</li>`;
    return;
  }

  const pomodori = pomodoriPerArgomento(sessioni);
  const qui = dovreiEssereQui(esame, argomenti, giorno);
  const segnaposto = (testo) => `<li class="segnaposto" aria-label="${esc(testo)}"><span>${esc(testo)}</span></li>`;

  const righe = argomenti.map((a, i) => {
    const fatti = pomodori.get(a.id) ?? 0;
    const riga = `
      <li class="argomento" data-id="${esc(a.id)}" data-stato="${a.stato}">
        <button type="button" class="stato" data-azione="stato"
                aria-label="${NOMI_STATO[a.stato]}: tocca per segnare ${NOMI_STATO[STATO_SUCCESSIVO[a.stato]].toLowerCase()}"></button>
        <button type="button" class="titolo" data-azione="modifica">
          <span>${esc(a.titolo)}</span>
          <small>${NOMI_STATO[a.stato]}</small>
        </button>
        <span class="peso" title="Pomodori fatti / stimati">${fatti}/${a.peso}<span aria-hidden="true">🍅</span></span>
        <span class="sposta">
          <button type="button" data-azione="su" aria-label="Sposta su" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button type="button" data-azione="giu" aria-label="Sposta giù" ${i === argomenti.length - 1 ? 'disabled' : ''}>▼</button>
        </span>
      </li>`;
    return a === qui ? segnaposto('Dovresti essere qui') + riga : riga;
  });
  if (!qui) righe.push(segnaposto('A questo punto dovresti aver finito'));

  lista.innerHTML = righe.join('');
}

function renderCompiti() {
  const compiti = storage.getCompiti();
  $('#pulisci-compiti').hidden = !compiti.some((c) => c.fatto);
  $('#lista-compiti').innerHTML = compiti.length
    ? compiti
        .map(
          (c) => `
      <li class="compito ${c.fatto ? 'fatto' : ''}" data-id="${esc(c.id)}">
        <label>
          <input type="checkbox" ${c.fatto ? 'checked' : ''}>
          <span>${esc(c.testo)}</span>
        </label>
        <button type="button" class="elimina" data-azione="elimina" aria-label="Elimina compito">×</button>
      </li>`,
        )
        .join('')
    : `<li class="vuoto">Nessun compito.</li>`;
}

// ---------------------------------------------------------------- dialog

function apriDialog(dialog) {
  dialog.showModal();
  dialog.querySelector('input, textarea')?.focus();
}

for (const dialog of document.querySelectorAll('dialog')) {
  // Tocco sullo sfondo: chiude.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target.closest('[data-chiudi]')) dialog.close();
  });
}

document.addEventListener('click', (e) => {
  const bottone = e.target.closest('[data-apri]');
  if (!bottone) return;
  if (bottone.dataset.apri === 'esame') apriEsame();
  if (bottone.dataset.apri === 'elenco') apriElenco();
});

// ---------------------------------------------------------------- esame

const formEsame = $('#form-esame');

$('#scelta-riposo').innerHTML = GIORNI.map(
  (g) => `<label class="chip"><input type="checkbox" name="giorniRiposo" value="${g.valore}"><span>${g.nome}</span></label>`,
).join('');

function esameDalForm() {
  const f = formEsame.elements;
  return {
    nome: f.nome.value.trim(),
    dataInizio: f.dataInizio.value,
    dataEsame: f.dataEsame.value,
    giorniRiposo: [...formEsame.querySelectorAll('[name=giorniRiposo]:checked')].map((c) => Number(c.value)),
    giorniRipasso: Number(f.giorniRipasso.value),
  };
}

function erroreEsame(e) {
  if (!e.nome) return 'Dai un nome all\'esame.';
  if (!e.dataInizio || !e.dataEsame) return 'Inserisci le due date.';
  if (e.dataEsame <= e.dataInizio) return 'La data dell\'esame deve venire dopo l\'inizio dello studio.';
  if (!Number.isInteger(e.giorniRipasso) || e.giorniRipasso < 0) return 'I giorni di ripasso devono essere un numero intero, 0 o più.';
  if (e.giorniRiposo.length === 7) return 'Lascia almeno un giorno della settimana per studiare.';
  return '';
}

function aggiornaAnteprimaEsame() {
  const e = esameDalForm();
  const anteprima = $('#anteprima-esame');
  if (!e.dataInizio || !e.dataEsame || e.dataEsame <= e.dataInizio || e.giorniRipasso < 0) {
    anteprima.textContent = '';
    return;
  }
  const n = giorniStudioTotali(e);
  anteprima.textContent = n
    ? `Il piano ha ${plurale(n, 'giorno', 'giorni')} di studio.`
    : 'Con queste date non resta nessun giorno di studio prima del ripasso.';
}

function apriEsame() {
  const esame = esameCorrente();
  const f = formEsame.elements;
  formEsame.dataset.id = esame?.id ?? '';
  $('#titolo-dlg-esame').textContent = esame ? 'Modifica esame' : 'Nuovo esame';
  f.nome.value = esame?.nome ?? '';
  f.dataInizio.value = esame?.dataInizio ?? oggi();
  f.dataEsame.value = esame?.dataEsame ?? '';
  f.giorniRipasso.value = esame?.giorniRipasso ?? 0;
  for (const c of formEsame.querySelectorAll('[name=giorniRiposo]')) {
    c.checked = esame ? esame.giorniRiposo.includes(Number(c.value)) : false;
  }
  $('#elimina-esame').hidden = !esame;
  $('#errore-esame').textContent = '';
  aggiornaAnteprimaEsame();
  apriDialog($('#dlg-esame'));
}

formEsame.addEventListener('input', aggiornaAnteprimaEsame);

formEsame.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const dati = esameDalForm();
  const errore = erroreEsame(dati);
  $('#errore-esame').textContent = errore;
  if (errore) return;
  const id = formEsame.dataset.id || undefined;
  storage.salvaEsame({ ...(id ? storage.getEsame(id) : {}), ...dati, ...(id ? { id } : {}) });
  $('#dlg-esame').close();
  render();
});

$('#elimina-esame').addEventListener('click', () => {
  const id = formEsame.dataset.id;
  if (!id) return;
  if (!confirm('Eliminare l\'esame con tutti i suoi argomenti? Non si può annullare.')) return;
  storage.eliminaEsame(id);
  $('#dlg-esame').close();
  render();
});

// ---------------------------------------------------------------- argomenti

const formArgomento = $('#form-argomento');

function apriArgomento(argomento) {
  const f = formArgomento.elements;
  formArgomento.dataset.id = argomento.id;
  f.titolo.value = argomento.titolo;
  f.peso.value = argomento.peso;
  f.stato.value = argomento.stato;
  $('#errore-argomento').textContent = '';
  apriDialog($('#dlg-argomento'));
}

formArgomento.addEventListener('click', (e) => {
  const passo = e.target.closest('[data-passo]');
  if (!passo) return;
  const input = formArgomento.elements.peso;
  const attuale = leggiPeso(input.value) ?? 1;
  input.value = Math.min(99, Math.max(1, attuale + Number(passo.dataset.passo)));
});

formArgomento.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = formArgomento.elements;
  const titolo = f.titolo.value.trim();
  const peso = leggiPeso(f.peso.value);
  const errore = !titolo ? 'Il titolo non può essere vuoto.' : !peso ? 'Il peso è un numero intero da 1 a 99.' : '';
  $('#errore-argomento').textContent = errore;
  if (errore) return;

  const esame = esameCorrente();
  const originale = storage.getArgomenti(esame.id).find((a) => a.id === formArgomento.dataset.id);
  if (originale) storage.salvaArgomento(conStato({ ...originale, titolo, peso }, f.stato.value, oggi()));
  $('#dlg-argomento').close();
  render();
});

$('#elimina-argomento').addEventListener('click', () => {
  const id = formArgomento.dataset.id;
  const argomento = storage.getArgomenti(esameCorrente().id).find((a) => a.id === id);
  if (!argomento || !confirm(`Eliminare «${argomento.titolo}»?`)) return;
  storage.eliminaArgomento(id);
  $('#dlg-argomento').close();
  render();
});

function sposta(esame, argomenti, id, verso) {
  const i = argomenti.findIndex((a) => a.id === id);
  const j = i + verso;
  if (i === -1 || j < 0 || j >= argomenti.length) return;
  const ids = argomenti.map((a) => a.id);
  [ids[i], ids[j]] = [ids[j], ids[i]];
  storage.riordinaArgomenti(esame.id, ids);
}

$('#lista-argomenti').addEventListener('click', (e) => {
  const bottone = e.target.closest('[data-azione]');
  const riga = e.target.closest('.argomento');
  if (!bottone || !riga) return;

  const esame = esameCorrente();
  const argomenti = storage.getArgomenti(esame.id);
  const argomento = argomenti.find((a) => a.id === riga.dataset.id);
  if (!argomento) return;

  const azione = bottone.dataset.azione;
  if (azione === 'modifica') return apriArgomento(argomento);
  if (azione === 'stato') storage.salvaArgomento(conStato(argomento, STATO_SUCCESSIVO[argomento.stato], oggi()));
  if (azione === 'su') sposta(esame, argomenti, argomento.id, -1);
  if (azione === 'giu') sposta(esame, argomenti, argomento.id, 1);
  render();

  // Dopo il ridisegno, il fuoco resta sullo stesso bottone della stessa riga.
  const stessa = document.querySelector(`.argomento[data-id="${CSS.escape(argomento.id)}"] [data-azione="${azione}"]`);
  if (stessa && !stessa.disabled) stessa.focus();
});

$('#form-argomento-rapido').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = ev.target.elements;
  const titolo = f.titolo.value.trim();
  const peso = leggiPeso(f.peso.value);
  if (!titolo || !peso) {
    (titolo ? f.peso : f.titolo).focus();
    return;
  }
  storage.aggiungiArgomenti(esameCorrente().id, [{ titolo, peso }]);
  f.titolo.value = '';
  render();
  f.titolo.focus();
});

// ---------------------------------------------------------------- inserimento rapido

const formElenco = $('#form-elenco');

function aggiornaAnteprimaElenco() {
  const n = titoliDaElenco(formElenco.elements.testo.value).length;
  const peso = leggiPeso(formElenco.elements.peso.value);
  $('#anteprima-elenco').textContent = !n
    ? ''
    : peso
      ? `Verranno creati ${plurale(n, 'argomento', 'argomenti')}, ${plurale(n * peso, 'pomodoro', 'pomodori')} in tutto.`
      : 'Il peso è un numero intero da 1 a 99.';
}

function apriElenco() {
  formElenco.elements.testo.value = '';
  aggiornaAnteprimaElenco();
  apriDialog($('#dlg-elenco'));
}

formElenco.addEventListener('input', aggiornaAnteprimaElenco);

formElenco.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const titoli = titoliDaElenco(formElenco.elements.testo.value);
  const peso = leggiPeso(formElenco.elements.peso.value);
  if (!titoli.length || !peso) return;
  storage.aggiungiArgomenti(esameCorrente().id, titoli.map((titolo) => ({ titolo, peso })));
  $('#dlg-elenco').close();
  render();
});

// ---------------------------------------------------------------- compiti

$('#form-compito').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const input = ev.target.elements.testo;
  const testo = input.value.trim();
  if (!testo) return;
  storage.aggiungiCompito(testo);
  input.value = '';
  renderCompiti();
  input.focus();
});

$('#lista-compiti').addEventListener('change', (e) => {
  const riga = e.target.closest('.compito');
  if (!riga || e.target.type !== 'checkbox') return;
  const compito = storage.getCompiti().find((c) => c.id === riga.dataset.id);
  if (compito) storage.salvaCompito({ ...compito, fatto: e.target.checked });
  renderCompiti();
});

$('#lista-compiti').addEventListener('click', (e) => {
  const riga = e.target.closest('.compito');
  if (!riga || !e.target.closest('[data-azione=elimina]')) return;
  storage.eliminaCompito(riga.dataset.id);
  renderCompiti();
});

$('#pulisci-compiti').addEventListener('click', () => {
  for (const c of storage.getCompiti().filter((c) => c.fatto)) storage.eliminaCompito(c.id);
  renderCompiti();
});

// ---------------------------------------------------------------- timer

// Con ?veloce nell'indirizzo ogni minuto del timer dura un secondo: serve a provarlo.
const VELOCE = new URLSearchParams(location.search).has('veloce');
const MS_MINUTO_APP = VELOCE ? 1000 : MS_MINUTO;

const NOMI_FASE = { pomodoro: 'Pomodoro', pausa_breve: 'Pausa breve', pausa_lunga: 'Pausa lunga' };
const TITOLO_PAGINA = document.title;

// Argomento scelto nel menu del timer; se diventa fatto si torna al primo non fatto.
let argomentoScelto = null;
let ticker = null;

/** Registra i pomodori scaduti e fa partire le pause. Non disegna. */
function aggiornaStatoTimer() {
  if (!isScadutoOra(storage.getTimer())) return;
  // Un'altra scheda aperta potrebbe averlo già registrato: si rilegge prima di scrivere.
  storage.ricarica();
  const { stato, eventi } = avanzaTimer(storage.getTimer(), Date.now(), {
    impostazioni: storage.getImpostazioni(),
    sessioni: storage.getSessioni(),
    msMinuto: MS_MINUTO_APP,
  });
  if (!eventi.length) return;
  for (const e of eventi) {
    if (e.tipo === 'pomodoro_finito') storage.aggiungiSessione(e.sessione);
  }
  storage.salvaTimer(stato);
  avvisa(eventi.at(-1), stato);
}

function isScadutoOra({ attivo }) {
  return Boolean(attivo) && isScaduto(attivo, Date.now());
}

function renderTimer(esame, argomenti, sessioni, giorno) {
  const sezione = $('#timer');
  const { attivo } = storage.getTimer();
  sezione.hidden = !esame && !attivo;
  pianificaTick(attivo);
  if (sezione.hidden) return;

  sezione.dataset.fase = attivo?.fase ?? 'fermo';
  sezione.dataset.inPausa = String(Boolean(attivo && attivo.inPausaDa !== null));
  const testa = (titolo) => `
    <div class="timer-testa">
      <h2>${titolo}</h2>
      ${VELOCE ? '<span class="etichetta" title="Ogni minuto dura un secondo">veloce</span>' : ''}
      <span class="spazio"></span>
      <button type="button" class="testo piccolo" data-timer="impostazioni">Impostazioni</button>
    </div>`;
  const fattiOggi = pomodoriDelGiorno(sessioni, giorno);
  const notaOggi = `<p class="nota">Oggi: ${plurale(fattiOggi, 'pomodoro', 'pomodori')}</p>`;

  if (!attivo) {
    if (argomenti.length === 0) {
      sezione.innerHTML = `${testa('Pomodoro')}<p class="nota">Aggiungi un argomento per usare il timer.</p>`;
    } else {
      // Nel menu solo gli argomenti da finire; a programma completato tutti, per ripassare.
      const scegliibili = argomenti.some((a) => a.stato !== 'fatto') ? argomenti.filter((a) => a.stato !== 'fatto') : argomenti;
      const selezionato = argomentoProposto(argomenti, argomentoScelto)?.id
        ?? (scegliibili.some((a) => a.id === argomentoScelto) ? argomentoScelto : scegliibili[0].id);
      const durata = storage.getImpostazioni().durataPomodoro;
      sezione.innerHTML = `
        ${testa('Pomodoro')}
        <p class="timer-tempo">${formattaTempo(durata * MS_MINUTO)}</p>
        <label class="campo">Argomento
          <select id="timer-argomento">
            ${scegliibili.map((a) => `<option value="${esc(a.id)}" ${a.id === selezionato ? 'selected' : ''}>${esc(a.titolo)}</option>`).join('')}
          </select>
        </label>
        <button type="button" class="primario" data-timer="avvia">▶ Avvia pomodoro</button>
        ${notaOggi}`;
    }
  } else {
    const inPausa = attivo.inPausaDa !== null;
    const argomento = argomenti.find((a) => a.id === attivo.argomentoId);
    const sottotitolo = attivo.fase === 'pomodoro'
      ? esc(argomento?.titolo ?? 'Argomento eliminato')
      : 'Stacca dallo schermo: il prossimo pomodoro lo avvii tu.';
    sezione.innerHTML = `
      ${testa(NOMI_FASE[attivo.fase])}
      <p class="timer-sottotitolo">${sottotitolo}</p>
      <p class="timer-tempo" id="timer-tempo" role="timer"></p>
      <div class="barra-progresso" aria-hidden="true"><div id="timer-barra"></div></div>
      <div class="timer-azioni">
        <button type="button" class="${inPausa ? 'primario' : 'secondario'}" data-timer="${inPausa ? 'riprendi' : 'pausa'}">
          ${inPausa ? '▶ Riprendi' : '⏸ Pausa'}</button>
        <button type="button" class="secondario" data-timer="annulla">
          ${attivo.fase === 'pomodoro' ? 'Annulla' : 'Salta pausa'}</button>
      </div>
      ${inPausa ? '<p class="nota">In pausa.</p>' : notaOggi}`;
  }
  aggiornaDisplay();
}

/** Aggiorna solo i numeri che cambiano ogni secondo. */
function aggiornaDisplay() {
  const { attivo } = storage.getTimer();
  if (!attivo) {
    document.title = TITOLO_PAGINA;
    return;
  }
  const ora = Date.now();
  const tempo = formattaTempo(tempoRimanente(attivo, ora));
  const display = $('#timer-tempo');
  if (display) display.textContent = tempo;
  const barra = $('#timer-barra');
  if (barra) barra.style.width = `${(tempoTrascorso(attivo, ora) / attivo.durataMs) * 100}%`;
  document.title = `${attivo.inPausaDa !== null ? '⏸ ' : ''}${tempo} · ${NOMI_FASE[attivo.fase]}`;
}

// Il tick serve solo a ridisegnare: il tempo si ricalcola ogni volta dagli orari salvati.
function tick() {
  if (isScadutoOra(storage.getTimer())) render();
  else aggiornaDisplay();
}

function pianificaTick(attivo) {
  const corre = Boolean(attivo) && attivo.inPausaDa === null;
  if (corre && !ticker) ticker = setInterval(tick, 250);
  if (!corre && ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

function modificaTimer(cambia) {
  const stato = storage.getTimer();
  storage.salvaTimer({ ...stato, attivo: cambia(stato.attivo) });
  render();
}

$('#timer').addEventListener('change', (e) => {
  if (e.target.id === 'timer-argomento') argomentoScelto = e.target.value;
});

$('#timer').addEventListener('click', (e) => {
  const azione = e.target.closest('[data-timer]')?.dataset.timer;
  if (!azione) return;
  const ora = Date.now();

  if (azione === 'impostazioni') return apriImpostazioni();
  if (azione === 'avvia') {
    const id = $('#timer-argomento')?.value;
    if (!id) return;
    argomentoScelto = id;
    sbloccaAudio();
    chiediPermessoNotifiche();
    modificaTimer(() => avviaFase('pomodoro', storage.getImpostazioni(), ora, { argomentoId: id, msMinuto: MS_MINUTO_APP }));
  }
  if (azione === 'pausa') modificaTimer((t) => t && mettiInPausa(t, ora));
  if (azione === 'riprendi') {
    sbloccaAudio();
    modificaTimer((t) => t && riprendi(t, ora));
  }
  if (azione === 'annulla') {
    const { attivo } = storage.getTimer();
    if (attivo?.fase === 'pomodoro' && !confirm('Annullare il pomodoro? Non verrà registrato.')) return;
    modificaTimer(() => null);
  }

  // Dopo il ridisegno il fuoco resta sul bottone equivalente.
  const dopo = { pausa: 'riprendi', riprendi: 'pausa', avvia: 'pausa', annulla: 'avvia' }[azione];
  $(`#timer [data-timer="${dopo}"]`)?.focus();
});

// ---------------------------------------------------------------- fine pomodoro: argomento finito?

const dlgEsito = $('#dlg-esito');

function renderEsito(argomenti) {
  const { daConfermare } = storage.getTimer();
  if (!daConfermare) {
    if (dlgEsito.open) dlgEsito.close();
    return;
  }
  if (dlgEsito.open) return;
  const argomento = argomenti.find((a) => a.id === daConfermare);
  if (!argomento) {
    // Argomento eliminato nel frattempo: non c'è niente da chiedere.
    storage.salvaTimer({ ...storage.getTimer(), daConfermare: null });
    return;
  }
  $('#testo-esito').innerHTML = `Hai finito <strong>${esc(argomento.titolo)}</strong> o resta in corso?`;
  dlgEsito.returnValue = '';
  dlgEsito.showModal();
}

// Chiuso senza rispondere (sfondo, Esc) vale "resta in corso": il pomodoro conta comunque.
dlgEsito.addEventListener('close', () => {
  const stato = storage.getTimer();
  if (!stato.daConfermare) return;
  const esame = esameCorrente();
  const argomento = esame && storage.getArgomenti(esame.id).find((a) => a.id === stato.daConfermare);
  if (argomento) {
    const nuovo = dlgEsito.returnValue === 'fatto' ? 'fatto' : 'in_corso';
    storage.salvaArgomento(conStato(argomento, nuovo, oggi()));
  }
  storage.salvaTimer({ ...stato, daConfermare: null });
  render();
});

// ---------------------------------------------------------------- impostazioni del timer

const formImpostazioni = $('#form-impostazioni');

const LIMITI_IMPOSTAZIONI = {
  durataPomodoro: { min: 1, max: 120, nome: 'La durata del pomodoro' },
  pomodoriPrimaPausaLunga: { min: 1, max: 12, nome: 'Il numero di pomodori prima della pausa lunga' },
  pausaBreve: { min: 1, max: 60, nome: 'La pausa breve' },
  pausaLunga: { min: 1, max: 60, nome: 'La pausa lunga' },
};

function riempiImpostazioni(valori) {
  for (const campo of Object.keys(LIMITI_IMPOSTAZIONI)) formImpostazioni.elements[campo].value = valori[campo];
}

function apriImpostazioni() {
  riempiImpostazioni(storage.getImpostazioni());
  $('#errore-impostazioni').textContent = '';
  $('#stato-notifiche').textContent = testoNotifiche();
  apriDialog($('#dlg-impostazioni'));
}

$('#ripristina-impostazioni').addEventListener('click', () => riempiImpostazioni(storage.IMPOSTAZIONI_DEFAULT));

formImpostazioni.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const valori = {};
  for (const [campo, { min, max, nome }] of Object.entries(LIMITI_IMPOSTAZIONI)) {
    const n = Number(formImpostazioni.elements[campo].value);
    if (!Number.isInteger(n) || n < min || n > max) {
      $('#errore-impostazioni').textContent = `${nome} è un numero intero da ${min} a ${max}.`;
      formImpostazioni.elements[campo].focus();
      return;
    }
    valori[campo] = n;
  }
  storage.salvaImpostazioni(valori);
  $('#dlg-impostazioni').close();
  render();
});

// ---------------------------------------------------------------- suono e notifiche

// Il suono si genera con Web Audio: niente file. Il browser lo consente solo
// dopo un gesto dell'utente, quindi il contesto si crea al primo tocco.
let audio = null;

function sbloccaAudio() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch {
    audio = null;
  }
}

document.addEventListener('pointerdown', sbloccaAudio, { passive: true });

function suona(note) {
  try {
    if (!audio) return;
    if (audio.state === 'suspended') audio.resume();
    note.forEach((frequenza, i) => {
      const t = audio.currentTime + i * 0.22;
      const oscillatore = audio.createOscillator();
      const volume = audio.createGain();
      oscillatore.frequency.value = frequenza;
      volume.gain.setValueAtTime(0.0001, t);
      volume.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      oscillatore.connect(volume).connect(audio.destination);
      oscillatore.start(t);
      oscillatore.stop(t + 0.22);
    });
  } catch {
    // Senza audio resta la notifica.
  }
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    // Vibrazione non disponibile.
  }
}

function notificheDisponibili() {
  return 'Notification' in window;
}

function chiediPermessoNotifiche() {
  try {
    if (notificheDisponibili() && Notification.permission === 'default') {
      Notification.requestPermission()?.catch?.(() => {});
    }
  } catch {
    // Browser vecchi o pagina non sicura: niente notifiche.
  }
}

function notifica(titolo, testo) {
  try {
    // Con la pagina davanti agli occhi bastano suono e finestra.
    if (!notificheDisponibili() || Notification.permission !== 'granted' || document.hasFocus()) return;
    new Notification(titolo, { body: testo, tag: 'app-studio-timer' });
  } catch {
    // Alcuni browser (Chrome su Android) non permettono notifiche senza service worker.
  }
}

function testoNotifiche() {
  if (!notificheDisponibili()) return 'Notifiche non disponibili in questa pagina: a fine pomodoro avvisa il suono.';
  if (Notification.permission === 'granted') return 'Notifiche attive.';
  if (Notification.permission === 'denied') return 'Notifiche bloccate dal browser: a fine pomodoro avvisa il suono.';
  return 'Le notifiche vengono chieste al primo avvio del timer.';
}

function avvisa(evento, stato) {
  if (evento.tipo === 'pomodoro_finito') {
    suona([660, 880, 1100]);
    notifica('Pomodoro completato 🍅', `Ora ${NOMI_FASE[stato.attivo?.fase ?? 'pausa_breve'].toLowerCase()}.`);
  } else {
    suona([880, 660]);
    notifica('Pausa finita', 'Quando vuoi, avvia il prossimo pomodoro.');
  }
}

// ---------------------------------------------------------------- avvio

// Se l'app resta aperta oltre la mezzanotte, al ritorno i calcoli usano il nuovo giorno;
// se il timer è scaduto a schermo spento, si registra ora.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') render();
});

// Modifiche da un'altra scheda aperta sull'app.
window.addEventListener('storage', () => {
  storage.ricarica();
  render();
});

render();
