import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as storage from './storage.js';

// localStorage finto, in memoria.
function backendFinto(iniziale = {}) {
  const mappa = new Map(Object.entries(iniziale));
  return {
    getItem: (k) => (mappa.has(k) ? mappa.get(k) : null),
    setItem: (k, v) => mappa.set(k, String(v)),
    chiavi: () => [...mappa.keys()],
  };
}

let backend;
beforeEach(() => {
  backend = backendFinto();
  storage.usaBackend(backend);
});

const esameBase = {
  nome: 'Analisi 1',
  dataInizio: '2026-10-05',
  dataEsame: '2026-10-19',
  giorniRiposo: [0],
  giorniRipasso: 2,
};

describe('esami', () => {
  test('partenza vuota', () => {
    assert.deepEqual(storage.getEsami(), []);
  });

  test('salvaEsame crea con id e poi aggiorna', () => {
    const creato = storage.salvaEsame(esameBase);
    assert.ok(creato.id);
    storage.salvaEsame({ ...creato, nome: 'Analisi 2' });
    assert.equal(storage.getEsami().length, 1);
    assert.equal(storage.getEsame(creato.id).nome, 'Analisi 2');
  });

  test('i dati sopravvivono alla rilettura', () => {
    const creato = storage.salvaEsame(esameBase);
    storage.usaBackend(backend);
    assert.equal(storage.getEsame(creato.id).nome, 'Analisi 1');
  });

  test('le copie restituite non modificano i dati salvati', () => {
    const creato = storage.salvaEsame(esameBase);
    storage.getEsame(creato.id).giorniRiposo.push(6);
    assert.deepEqual(storage.getEsame(creato.id).giorniRiposo, [0]);
  });

  test('eliminaEsame toglie anche i suoi argomenti', () => {
    const e1 = storage.salvaEsame(esameBase);
    const e2 = storage.salvaEsame({ ...esameBase, nome: 'Fisica' });
    storage.aggiungiArgomenti(e1.id, [{ titolo: 'Limiti', peso: 2 }]);
    storage.aggiungiArgomenti(e2.id, [{ titolo: 'Cinematica', peso: 2 }]);
    storage.eliminaEsame(e1.id);
    assert.deepEqual(storage.getEsami().map((e) => e.nome), ['Fisica']);
    assert.deepEqual(storage.getArgomenti(e1.id), []);
    assert.equal(storage.getArgomenti(e2.id).length, 1);
  });
});

describe('argomenti', () => {
  test('aggiungiArgomenti accoda in ordine, da fare', () => {
    const { id } = storage.salvaEsame(esameBase);
    storage.aggiungiArgomenti(id, [{ titolo: 'A', peso: 2 }, { titolo: 'B', peso: 3 }]);
    storage.aggiungiArgomenti(id, [{ titolo: 'C', peso: 1 }]);
    const lista = storage.getArgomenti(id);
    assert.deepEqual(lista.map((a) => [a.titolo, a.ordine, a.stato]), [
      ['A', 1, 'da_fare'],
      ['B', 2, 'da_fare'],
      ['C', 3, 'da_fare'],
    ]);
    assert.ok(lista.every((a) => a.esameId === id && a.dataCompletamento === null));
  });

  test('riordinaArgomenti', () => {
    const { id } = storage.salvaEsame(esameBase);
    const [a, b, c] = storage.aggiungiArgomenti(id, ['A', 'B', 'C'].map((titolo) => ({ titolo, peso: 1 })));
    storage.riordinaArgomenti(id, [c.id, a.id, b.id]);
    assert.deepEqual(storage.getArgomenti(id).map((x) => x.titolo), ['C', 'A', 'B']);
  });

  test('salvaArgomento ed eliminaArgomento', () => {
    const { id } = storage.salvaEsame(esameBase);
    const [a, b] = storage.aggiungiArgomenti(id, [{ titolo: 'A', peso: 1 }, { titolo: 'B', peso: 1 }]);
    storage.salvaArgomento({ ...a, peso: 5, stato: 'in_corso' });
    storage.eliminaArgomento(b.id);
    const lista = storage.getArgomenti(id);
    assert.equal(lista.length, 1);
    assert.equal(lista[0].peso, 5);
    assert.equal(lista[0].stato, 'in_corso');
  });
});

describe('compiti', () => {
  test('aggiungi, segna fatto, elimina', () => {
    const c = storage.aggiungiCompito('Stampare dispense');
    assert.equal(c.fatto, false);
    storage.salvaCompito({ ...c, fatto: true });
    assert.equal(storage.getCompiti()[0].fatto, true);
    storage.eliminaCompito(c.id);
    assert.deepEqual(storage.getCompiti(), []);
  });
});

describe('impostazioni', () => {
  test('default e modifica parziale', () => {
    assert.deepEqual(storage.getImpostazioni(), storage.IMPOSTAZIONI_DEFAULT);
    storage.salvaImpostazioni({ durataPomodoro: 50 });
    assert.equal(storage.getImpostazioni().durataPomodoro, 50);
    assert.equal(storage.getImpostazioni().pausaBreve, 5);
  });
});

describe('sessioni', () => {
  test('aggiungiSessione assegna un id', () => {
    const s = storage.aggiungiSessione({ argomentoId: 'a1', data: '2026-10-05', durataMinuti: 25 });
    assert.ok(s.id);
    assert.deepEqual(storage.getSessioni(), [s]);
  });

  test('aggiungiSessione con un id già registrato non la duplica', () => {
    const sessione = { id: 'pomodoro-1', argomentoId: 'a1', data: '2026-10-05', durataMinuti: 25 };
    storage.aggiungiSessione(sessione);
    storage.aggiungiSessione(sessione);
    assert.equal(storage.getSessioni().length, 1);
  });
});

describe('timer', () => {
  test('vuoto di default, si salva e sopravvive a un ricaricamento', () => {
    assert.deepEqual(storage.getTimer(), { attivo: null, daConfermare: null });
    const stato = { attivo: { fase: 'pomodoro', argomentoId: 'a1', inizio: 1000 }, daConfermare: null };
    storage.salvaTimer(stato);
    storage.usaBackend(backend); // come aprire la pagina di nuovo
    assert.deepEqual(storage.getTimer(), stato);
  });

  test('dati salvati prima del timer: stato vuoto', () => {
    backend = backendFinto({ 'app-studio:v1': JSON.stringify({ versione: 1, esami: [] }) });
    storage.usaBackend(backend);
    assert.deepEqual(storage.getTimer(), { attivo: null, daConfermare: null });
  });

  test("ricarica legge le modifiche fatte da un'altra scheda", () => {
    storage.getTimer();
    const altra = { versione: 1, timer: { attivo: null, daConfermare: 'a1' } };
    backend.setItem('app-studio:v1', JSON.stringify(altra));
    assert.equal(storage.getTimer().daConfermare, null);
    storage.ricarica();
    assert.equal(storage.getTimer().daConfermare, 'a1');
  });
});

describe('robustezza', () => {
  test('dati corrotti: si mettono da parte e si riparte vuoti', () => {
    backend = backendFinto({ 'app-studio:v1': '{non è json' });
    storage.usaBackend(backend);
    assert.deepEqual(storage.getEsami(), []);
    assert.ok(backend.chiavi().some((k) => k.startsWith('app-studio:v1:corrotto:')));
  });

  test('nuovoId funziona anche senza crypto.randomUUID', () => {
    const originale = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const a = storage.nuovoId();
      const b = storage.nuovoId();
      assert.equal(typeof a, 'string');
      assert.notEqual(a, b);
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', { value: originale, configurable: true });
    }
  });
});
