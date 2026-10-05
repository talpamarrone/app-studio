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

  test('eliminaSessioniDelGiorno toglie solo quelle di quella data', () => {
    storage.aggiungiSessione({ argomentoId: 'a1', data: '2026-10-05', durataMinuti: 25 });
    storage.aggiungiSessione({ argomentoId: 'a2', data: '2026-10-05', durataMinuti: 25 });
    const resta = storage.aggiungiSessione({ argomentoId: 'a1', data: '2026-10-06', durataMinuti: 25 });
    assert.equal(storage.eliminaSessioniDelGiorno('2026-10-05'), 2);
    storage.ricarica();
    assert.deepEqual(storage.getSessioni(), [resta]);
    assert.equal(storage.eliminaSessioniDelGiorno('2026-10-07'), 0);
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

describe('esporta e importa', () => {
  function riempi() {
    const esame = storage.salvaEsame(esameBase);
    const [a1] = storage.aggiungiArgomenti(esame.id, [{ titolo: 'Limiti', peso: 3 }, { titolo: 'Derivate', peso: 2 }]);
    storage.aggiungiSessione({ argomentoId: a1.id, data: '2026-10-05', durataMinuti: 25 });
    storage.aggiungiCompito('Comprare il libro');
    storage.salvaImpostazioni({ durataPomodoro: 30 });
    storage.salvaTimer({ attivo: { fase: 'pomodoro' }, daConfermare: null });
    return esame;
  }

  test('esporta tutto tranne il timer', () => {
    riempi();
    const b = storage.esportaDati(new Date('2026-10-05T10:00:00Z'));
    assert.equal(b.formato, 'app-studio');
    assert.equal(b.versione, 1);
    assert.equal(b.esportatoIl, '2026-10-05T10:00:00.000Z');
    assert.equal(b.esami.length, 1);
    assert.equal(b.argomenti.length, 2);
    assert.equal(b.sessioni.length, 1);
    assert.equal(b.compiti.length, 1);
    assert.equal(b.impostazioni.durataPomodoro, 30);
    assert.equal(b.impostazioni.pausaBreve, 5);
    assert.equal('timer' in b, false);
  });

  test('andata e ritorno: esporta, svuota, importa', () => {
    riempi();
    const testo = JSON.stringify(storage.esportaDati());
    storage.usaBackend(backendFinto());
    storage.importaDati(storage.leggiBackup(testo));
    const b = storage.esportaDati();
    const originale = JSON.parse(testo);
    for (const k of ['esami', 'argomenti', 'sessioni', 'compiti', 'impostazioni']) {
      assert.deepEqual(b[k], originale[k]);
    }
  });

  test('importa sovrascrive, svuota il timer e mette da parte i dati di prima', () => {
    riempi();
    const vuoto = storage.leggiBackup(JSON.stringify({
      formato: 'app-studio', versione: 1, esami: [], argomenti: [], sessioni: [], compiti: [],
    }));
    storage.importaDati(vuoto);
    assert.deepEqual(storage.getEsami(), []);
    assert.deepEqual(storage.getSessioni(), []);
    assert.deepEqual(storage.getCompiti(), []);
    assert.deepEqual(storage.getImpostazioni(), storage.IMPOSTAZIONI_DEFAULT);
    assert.deepEqual(storage.getTimer(), { attivo: null, daConfermare: null });
    const prima = JSON.parse(backend.getItem('app-studio:v1:prima-di-importare'));
    assert.equal(prima.esami.length, 1);
    // Sopravvive a un ricaricamento.
    storage.ricarica();
    assert.deepEqual(storage.getEsami(), []);
  });

  test('il backup restituito non è legato al testo letto', () => {
    riempi();
    const backup = storage.leggiBackup(JSON.stringify(storage.esportaDati()));
    storage.importaDati(backup);
    backup.esami[0].nome = 'Modificato';
    assert.equal(storage.getEsami()[0].nome, 'Analisi 1');
  });

  describe('file non validi', () => {
    function backupValido() {
      riempi();
      return storage.esportaDati();
    }
    const rifiuta = (b, messaggio) =>
      assert.throws(() => storage.leggiBackup(typeof b === 'string' ? b : JSON.stringify(b)), messaggio);

    test('non JSON', () => rifiuta('{rotto', /JSON/));
    test('JSON di altro tipo', () => {
      rifiuta('null', /non è un file di dati/);
      rifiuta('[1,2]', /non è un file di dati/);
      rifiuta({ esami: [] }, /non è un file di dati/);
    });
    test('versione più recente', () => rifiuta({ ...backupValido(), versione: 2 }, /più recente/));
    test('raccolta mancante', () => {
      const b = backupValido();
      delete b.sessioni;
      rifiuta(b, /sessioni/);
    });
    test('esame senza data', () => {
      const b = backupValido();
      b.esami[0].dataEsame = '19/10/2026';
      rifiuta(b, /esame non valido/);
    });
    test('argomento con stato sconosciuto', () => {
      const b = backupValido();
      b.argomenti[0].stato = 'boh';
      rifiuta(b, /argomento non valido/);
    });
    test('argomento di un esame che non c\'è', () => {
      const b = backupValido();
      b.argomenti[0].esameId = 'altro';
      rifiuta(b, /esame che non c'è/);
    });
    test('sessione senza id', () => {
      const b = backupValido();
      delete b.sessioni[0].id;
      rifiuta(b, /una sessione non valida/);
    });
    test('compito con fatto non booleano', () => {
      const b = backupValido();
      b.compiti[0].fatto = 'no';
      rifiuta(b, /compito non valido/);
    });
    test('id duplicati', () => {
      const b = backupValido();
      b.argomenti[1].id = b.argomenti[0].id;
      rifiuta(b, /stesso id/);
    });
    test('impostazioni non valide', () => {
      const b = backupValido();
      b.impostazioni.pausaBreve = 0;
      rifiuta(b, /impostazioni/);
    });
    test('un file rifiutato non tocca i dati', () => {
      const b = backupValido();
      b.compiti[0].fatto = 'no';
      rifiuta(b, /compito/);
      assert.equal(storage.getEsami().length, 1);
    });
  });

  test('impostazioni mancanti: valori predefiniti', () => {
    const b = { formato: 'app-studio', versione: 1, esami: [], argomenti: [], sessioni: [], compiti: [] };
    assert.deepEqual(storage.leggiBackup(JSON.stringify(b)).impostazioni, storage.IMPOSTAZIONI_DEFAULT);
  });
});
