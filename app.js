// Schermata Programma: legge dallo storage, calcola con logic.js, disegna.
// Ogni modifica salva e ridisegna tutto: i dati sono pochi.

import * as storage from './storage.js';
import {
  conStato,
  differenzaGiorni,
  dovreiEssereQui,
  faseEsame,
  giorniStudioRimasti,
  giorniStudioTotali,
  percentualeCompletata,
  pesoRimanente,
  pomodoriPerArgomento,
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
  const d = new Date();
  const due = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`;
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
  const esame = esameCorrente();
  const giorno = oggi();

  $('#benvenuto').hidden = Boolean(esame);
  $('#esame').hidden = !esame;
  $('#riepilogo').hidden = !esame;
  $('#sezione-argomenti').hidden = !esame;

  if (esame) {
    const argomenti = storage.getArgomenti(esame.id);
    const sessioni = storage.getSessioni();
    renderEsame(esame, giorno);
    renderRiepilogo(esame, argomenti, sessioni, giorno);
    renderArgomenti(esame, argomenti, sessioni, giorno);
  }
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
    const peso = a.stato === 'in_corso' ? `${Math.min(fatti, a.peso)}/${a.peso}` : a.peso;
    const riga = `
      <li class="argomento" data-id="${esc(a.id)}" data-stato="${a.stato}">
        <button type="button" class="stato" data-azione="stato"
                aria-label="${NOMI_STATO[a.stato]}: tocca per segnare ${NOMI_STATO[STATO_SUCCESSIVO[a.stato]].toLowerCase()}"></button>
        <button type="button" class="titolo" data-azione="modifica">
          <span>${esc(a.titolo)}</span>
          <small>${NOMI_STATO[a.stato]}</small>
        </button>
        <span class="peso" title="Pomodori stimati">${peso}<span aria-hidden="true">🍅</span></span>
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

// ---------------------------------------------------------------- avvio

// Se l'app resta aperta oltre la mezzanotte, al ritorno i calcoli usano il nuovo giorno.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') render();
});

render();
