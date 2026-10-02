import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  MS_MINUTO,
  STATO_TIMER_VUOTO,
  dataLocale,
  avviaFase,
  tempoTrascorso,
  tempoRimanente,
  momentoFine,
  isScaduto,
  mettiInPausa,
  riprendi,
  tipoPausa,
  avanzaTimer,
  formattaTempo,
  argomentoProposto,
} from './logic.js';

const impostazioni = { durataPomodoro: 25, pausaBreve: 5, pausaLunga: 15, pomodoriPrimaPausaLunga: 4 };

// Orari in ora locale, così le date delle sessioni non dipendono dal fuso del PC.
const alle = (ore, minuti = 0, secondi = 0, giorno = 5) => new Date(2026, 9, giorno, ore, minuti, secondi).getTime();
const min = (n) => n * MS_MINUTO;

const pomodoro = (ora = alle(9)) => avviaFase('pomodoro', impostazioni, ora, { argomentoId: 'A' });
const inCorso = (timer) => ({ attivo: timer, daConfermare: null });

function sessioniDel(data, n) {
  return Array.from({ length: n }, (_, i) => ({ id: `s${i}`, argomentoId: 'A', data, durataMinuti: 25 }));
}

describe('dataLocale', () => {
  test('data locale, anche a ridosso della mezzanotte', () => {
    assert.equal(dataLocale(alle(0, 0, 0)), '2026-10-05');
    assert.equal(dataLocale(alle(23, 59, 59)), '2026-10-05');
  });
});

describe('avviaFase', () => {
  test('pomodoro con la durata delle impostazioni', () => {
    const t = pomodoro();
    assert.equal(t.fase, 'pomodoro');
    assert.equal(t.argomentoId, 'A');
    assert.equal(t.durataMinuti, 25);
    assert.equal(t.durataMs, min(25));
    assert.equal(t.inizio, alle(9));
    assert.equal(t.inPausaDa, null);
  });

  test('le pause non hanno argomento', () => {
    const t = avviaFase('pausa_lunga', impostazioni, alle(9), { argomentoId: 'A' });
    assert.equal(t.argomentoId, null);
    assert.equal(t.durataMinuti, 15);
  });

  test('msMinuto accorcia i minuti per le prove', () => {
    const t = avviaFase('pomodoro', impostazioni, alle(9), { argomentoId: 'A', msMinuto: 1000 });
    assert.equal(t.durataMinuti, 25);
    assert.equal(t.durataMs, 25_000);
  });
});

describe('tempo', () => {
  test("si calcola dall'orario di inizio", () => {
    const t = pomodoro();
    assert.equal(tempoTrascorso(t, alle(9, 10)), min(10));
    assert.equal(tempoRimanente(t, alle(9, 10)), min(15));
    assert.equal(momentoFine(t), alle(9, 25));
  });

  test('resta entro 0 e la durata', () => {
    const t = pomodoro();
    assert.equal(tempoTrascorso(t, alle(8, 59)), 0);
    assert.equal(tempoRimanente(t, alle(11)), 0);
  });

  test('scaduto esattamente alla fine', () => {
    const t = pomodoro();
    assert.equal(isScaduto(t, alle(9, 24, 59)), false);
    assert.equal(isScaduto(t, alle(9, 25)), true);
  });

  test('un ricaricamento non cambia nulla: lo stato è solo dati', () => {
    const t = JSON.parse(JSON.stringify(pomodoro()));
    assert.equal(tempoRimanente(t, alle(9, 20)), min(5));
  });
});

describe('pausa e ripresa', () => {
  test('in pausa il tempo si ferma', () => {
    const t = mettiInPausa(pomodoro(), alle(9, 10));
    assert.equal(tempoRimanente(t, alle(9, 50)), min(15));
    assert.equal(momentoFine(t), null);
    assert.equal(isScaduto(t, alle(12)), false);
  });

  test('alla ripresa la fine slitta della durata della pausa', () => {
    const t = riprendi(mettiInPausa(pomodoro(), alle(9, 10)), alle(9, 30));
    assert.equal(tempoRimanente(t, alle(9, 30)), min(15));
    assert.equal(momentoFine(t), alle(9, 45));
  });

  test('più pause si sommano', () => {
    let t = pomodoro();
    t = riprendi(mettiInPausa(t, alle(9, 5)), alle(9, 8));
    t = riprendi(mettiInPausa(t, alle(9, 10)), alle(9, 12));
    assert.equal(momentoFine(t), alle(9, 30));
  });

  test('pausa e ripresa ripetute non hanno effetto', () => {
    const inPausa = mettiInPausa(pomodoro(), alle(9, 10));
    assert.equal(mettiInPausa(inPausa, alle(9, 20)), inPausa);
    const ripreso = riprendi(inPausa, alle(9, 20));
    assert.equal(riprendi(ripreso, alle(9, 30)), ripreso);
  });

  test('la pausa non va oltre la fine', () => {
    const t = mettiInPausa(pomodoro(), alle(10));
    assert.equal(t.inPausaDa, alle(9, 25));
    assert.equal(tempoRimanente(t, alle(10)), 0);
  });
});

describe('tipoPausa', () => {
  test('lunga ogni N pomodori della giornata', () => {
    assert.deepEqual(
      [1, 2, 3, 4, 5, 8].map((n) => tipoPausa(n, impostazioni)),
      ['pausa_breve', 'pausa_breve', 'pausa_breve', 'pausa_lunga', 'pausa_breve', 'pausa_lunga'],
    );
  });

  test('con N = 1 è sempre lunga', () => {
    assert.equal(tipoPausa(1, { ...impostazioni, pomodoriPrimaPausaLunga: 1 }), 'pausa_lunga');
  });
});

describe('avanzaTimer', () => {
  const opzioni = (sessioni = []) => ({ impostazioni, sessioni });

  test('senza timer non succede nulla', () => {
    const { stato, eventi } = avanzaTimer(STATO_TIMER_VUOTO, alle(9), opzioni());
    assert.equal(stato, STATO_TIMER_VUOTO);
    assert.deepEqual(eventi, []);
  });

  test('prima della fine non succede nulla', () => {
    const iniziale = inCorso(pomodoro());
    const { stato, eventi } = avanzaTimer(iniziale, alle(9, 24), opzioni());
    assert.equal(stato, iniziale);
    assert.deepEqual(eventi, []);
  });

  test('in pausa non scade mai', () => {
    assert.deepEqual(avanzaTimer(inCorso(mettiInPausa(pomodoro(), alle(9, 1))), alle(18), opzioni()).eventi, []);
  });

  test("a fine pomodoro: una sessione, pausa breve dall'orario di fine, domanda in sospeso", () => {
    const { stato, eventi } = avanzaTimer(inCorso(pomodoro()), alle(9, 26), opzioni());
    assert.deepEqual(eventi, [
      {
        tipo: 'pomodoro_finito',
        fine: alle(9, 25),
        sessione: { id: `pomodoro-${alle(9)}`, argomentoId: 'A', data: '2026-10-05', durataMinuti: 25 },
      },
    ]);
    assert.equal(stato.daConfermare, 'A');
    assert.equal(stato.attivo.fase, 'pausa_breve');
    assert.equal(stato.attivo.inizio, alle(9, 25));
    assert.equal(tempoRimanente(stato.attivo, alle(9, 26)), min(4));
  });

  test('pausa lunga dopo il quarto pomodoro del giorno', () => {
    const { stato } = avanzaTimer(inCorso(pomodoro()), alle(9, 25), opzioni(sessioniDel('2026-10-05', 3)));
    assert.equal(stato.attivo.fase, 'pausa_lunga');
    assert.equal(stato.attivo.durataMs, min(15));
  });

  test('le sessioni degli altri giorni non contano per la pausa lunga', () => {
    const { stato } = avanzaTimer(inCorso(pomodoro()), alle(9, 25), opzioni(sessioniDel('2026-10-04', 3)));
    assert.equal(stato.attivo.fase, 'pausa_breve');
  });

  test('a fine pausa il timer si ferma e la domanda resta', () => {
    const pausa = avviaFase('pausa_breve', impostazioni, alle(9, 25));
    const { stato, eventi } = avanzaTimer({ attivo: pausa, daConfermare: 'A' }, alle(9, 30), opzioni());
    assert.deepEqual(eventi, [{ tipo: 'pausa_finita', fine: alle(9, 30), fase: 'pausa_breve' }]);
    assert.deepEqual(stato, { attivo: null, daConfermare: 'A' });
  });

  test('schermo spento a lungo: pomodoro e pausa finiscono insieme, una sola sessione', () => {
    const { stato, eventi } = avanzaTimer(inCorso(pomodoro()), alle(11), opzioni());
    assert.deepEqual(eventi.map((e) => e.tipo), ['pomodoro_finito', 'pausa_finita']);
    assert.equal(eventi[1].fine, alle(9, 30));
    assert.deepEqual(stato, { attivo: null, daConfermare: 'A' });
  });

  test("la sessione ha la data del momento di fine, non di quando si riapre l'app", () => {
    const { eventi } = avanzaTimer(inCorso(pomodoro(alle(23, 50))), alle(8, 0, 0, 6), opzioni());
    assert.equal(eventi[0].sessione.data, '2026-10-06');
    const presto = avanzaTimer(inCorso(pomodoro(alle(23, 0))), alle(8, 0, 0, 6), opzioni());
    assert.equal(presto.eventi[0].sessione.data, '2026-10-05');
  });

  test('la pausa usa la stessa scala di minuti', () => {
    const veloce = avviaFase('pomodoro', impostazioni, alle(9), { argomentoId: 'A', msMinuto: 1000 });
    const { stato } = avanzaTimer(inCorso(veloce), alle(9, 0, 25), { ...opzioni(), msMinuto: 1000 });
    assert.equal(stato.attivo.durataMs, 5000);
  });

  test('dopo una pausa conta la fine spostata', () => {
    const t = riprendi(mettiInPausa(pomodoro(), alle(9, 10)), alle(9, 20));
    assert.deepEqual(avanzaTimer(inCorso(t), alle(9, 30), opzioni()).eventi, []);
    assert.equal(avanzaTimer(inCorso(t), alle(9, 35), opzioni()).eventi[0].fine, alle(9, 35));
  });
});

describe('formattaTempo', () => {
  test('minuti e secondi, per eccesso', () => {
    assert.equal(formattaTempo(min(25)), '25:00');
    assert.equal(formattaTempo(min(24) + 59_001), '25:00');
    assert.equal(formattaTempo(min(24) + 59_000), '24:59');
    assert.equal(formattaTempo(1), '00:01');
    assert.equal(formattaTempo(0), '00:00');
    assert.equal(formattaTempo(-5), '00:00');
    assert.equal(formattaTempo(min(90)), '90:00');
  });
});

describe('argomentoProposto', () => {
  const arg = (id, ordine, stato = 'da_fare') => ({ id, esameId: 'e1', titolo: id, peso: 2, stato, ordine, dataCompletamento: null });
  const lista = [arg('C', 3), arg('A', 1, 'fatto'), arg('B', 2, 'in_corso')];

  test('di default il primo non fatto, in ordine', () => {
    assert.equal(argomentoProposto(lista).id, 'B');
  });

  test('rispetta la scelta se non è fatto', () => {
    assert.equal(argomentoProposto(lista, 'C').id, 'C');
  });

  test('scelta fatta o sparita: torna al primo non fatto', () => {
    assert.equal(argomentoProposto(lista, 'A').id, 'B');
    assert.equal(argomentoProposto(lista, 'X').id, 'B');
  });

  test('tutto fatto o programma vuoto: null', () => {
    assert.equal(argomentoProposto([arg('A', 1, 'fatto')]), null);
    assert.equal(argomentoProposto([]), null);
  });
});
