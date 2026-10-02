import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggiungiGiorni,
  differenzaGiorni,
  giornoSettimana,
  inizioRipasso,
  isGiornoStudio,
  giorniStudioTotali,
  giorniStudioRimasti,
  faseEsame,
  pomodoriDelGiorno,
  pesoTotale,
  pesoCompletato,
  pesoRimanente,
  pesoCompletatoInizioGiornata,
  obiettivoOggi,
  pesoPrevisto,
  tolleranzaInLinea,
  dovreiEssereQui,
  statoAvanzamento,
  streak,
} from './logic.js';

// Calendario di riferimento (ottobre 2026):
// lun 5 … sab 10, dom 11 (riposo), lun 12 … ven 16 = 11 giorni di studio;
// sab 17 e dom 18 = ripasso; lun 19 = esame.
const DOMENICA = 0;
const SABATO = 6;

const esame = {
  id: 'e1',
  nome: 'Analisi 1',
  dataInizio: '2026-10-05',
  dataEsame: '2026-10-19',
  giorniRiposo: [DOMENICA],
  giorniRipasso: 2,
};

function argomento(id, peso, ordine, stato = 'da_fare', dataCompletamento = null) {
  return { id, esameId: 'e1', titolo: id, peso, stato, ordine, dataCompletamento };
}

// Totale 22: un giorno di ritmo costante vale 22 / 11 = 2.
const programma = () => [
  argomento('A', 4, 1),
  argomento('B', 6, 2),
  argomento('C', 5, 3),
  argomento('D', 7, 4),
];

function con(argomenti, modifiche) {
  return argomenti.map((a) => (modifiche[a.id] ? { ...a, ...modifiche[a.id] } : a));
}

let prossimoId = 1;
function sessioni(argomentoId, data, n = 1) {
  return Array.from({ length: n }, () => ({
    id: `s${prossimoId++}`,
    argomentoId,
    data,
    durataMinuti: 25,
  }));
}

describe('date', () => {
  test('aggiungiGiorni attraversa mesi, anni e bisestili', () => {
    assert.equal(aggiungiGiorni('2026-10-31', 1), '2026-11-01');
    assert.equal(aggiungiGiorni('2026-12-31', 1), '2027-01-01');
    assert.equal(aggiungiGiorni('2028-02-28', 1), '2028-02-29');
    assert.equal(aggiungiGiorni('2026-03-01', -1), '2026-02-28');
  });

  test('aggiungiGiorni non risente del cambio di ora legale', () => {
    assert.equal(aggiungiGiorni('2026-10-24', 2), '2026-10-26');
    assert.equal(aggiungiGiorni('2026-03-28', 2), '2026-03-30');
  });

  test('differenzaGiorni', () => {
    assert.equal(differenzaGiorni('2026-10-05', '2026-10-19'), 14);
    assert.equal(differenzaGiorni('2026-10-19', '2026-10-05'), -14);
    assert.equal(differenzaGiorni('2026-10-05', '2026-10-05'), 0);
  });

  test('giornoSettimana usa 0 = domenica', () => {
    assert.equal(giornoSettimana('2026-10-05'), 1);
    assert.equal(giornoSettimana('2026-10-11'), DOMENICA);
    assert.equal(giornoSettimana('2026-10-17'), SABATO);
  });
});

describe('calendario dell\'esame', () => {
  test('il ripasso sono gli ultimi N giorni di calendario prima dell\'esame', () => {
    assert.equal(inizioRipasso(esame), '2026-10-17');
    assert.equal(inizioRipasso({ ...esame, giorniRipasso: 0 }), '2026-10-19');
  });

  test('isGiornoStudio', () => {
    assert.equal(isGiornoStudio('2026-10-05', esame), true);
    assert.equal(isGiornoStudio('2026-10-16', esame), true);
    assert.equal(isGiornoStudio('2026-10-11', esame), false, 'domenica di riposo');
    assert.equal(isGiornoStudio('2026-10-17', esame), false, 'ripasso');
    assert.equal(isGiornoStudio('2026-10-19', esame), false, 'giorno dell\'esame');
    assert.equal(isGiornoStudio('2026-10-04', esame), false, 'prima dell\'inizio');
  });

  test('il giorno dell\'esame non è di studio anche senza ripasso', () => {
    const senzaRipasso = { ...esame, giorniRipasso: 0 };
    assert.equal(isGiornoStudio('2026-10-19', senzaRipasso), false);
    assert.equal(isGiornoStudio('2026-10-17', senzaRipasso), true);
  });

  test('giorniStudioTotali', () => {
    assert.equal(giorniStudioTotali(esame), 11);
    assert.equal(giorniStudioTotali({ ...esame, giorniRipasso: 0 }), 12);
  });

  test('giorniStudioRimasti conta oggi se è giorno di studio', () => {
    assert.equal(giorniStudioRimasti(esame, '2026-10-05'), 11);
    assert.equal(giorniStudioRimasti(esame, '2026-10-12'), 5);
    assert.equal(giorniStudioRimasti(esame, '2026-10-11'), 5, 'domenica');
    assert.equal(giorniStudioRimasti(esame, '2026-10-16'), 1);
    assert.equal(giorniStudioRimasti(esame, '2026-10-17'), 0, 'ripasso');
    assert.equal(giorniStudioRimasti(esame, '2026-10-19'), 0, 'esame');
    assert.equal(giorniStudioRimasti(esame, '2026-11-01'), 0, 'esame passato');
  });

  test('prima dell\'inizio i giorni rimasti partono da dataInizio', () => {
    assert.equal(giorniStudioRimasti(esame, '2026-10-01'), 11);
  });

  test('ripasso più lungo del periodo disponibile', () => {
    const tuttoRipasso = { ...esame, giorniRipasso: 30 };
    assert.equal(giorniStudioTotali(tuttoRipasso), 0);
    assert.equal(giorniStudioRimasti(tuttoRipasso, '2026-10-05'), 0);
    assert.equal(faseEsame(tuttoRipasso, '2026-10-05'), 'in_ripasso');
  });

  test('faseEsame', () => {
    assert.equal(faseEsame(esame, '2026-10-05'), 'studio');
    assert.equal(faseEsame(esame, '2026-10-16'), 'studio');
    assert.equal(faseEsame(esame, '2026-10-17'), 'in_ripasso');
    assert.equal(faseEsame(esame, '2026-10-18'), 'in_ripasso');
    assert.equal(faseEsame(esame, '2026-10-19'), 'esame_oggi');
    assert.equal(faseEsame(esame, '2026-10-20'), 'esame_passato');
  });
});

describe('pesi', () => {
  test('pesoTotale e programma vuoto', () => {
    assert.equal(pesoTotale(programma()), 22);
    assert.equal(pesoTotale([]), 0);
    assert.equal(pesoCompletato([], []), 0);
    assert.equal(pesoRimanente([], []), 0);
  });

  test('fatto conta il peso pieno anche con pochi pomodori', () => {
    const args = con(programma(), { A: { stato: 'fatto' } });
    assert.equal(pesoCompletato(args, sessioni('A', '2026-10-05', 1)), 4);
  });

  test('in_corso conta i pomodori fatti, fino al peso', () => {
    const args = con(programma(), { B: { stato: 'in_corso' } });
    assert.equal(pesoCompletato(args, sessioni('B', '2026-10-05', 2)), 2);
    assert.equal(pesoCompletato(args, sessioni('B', '2026-10-05', 9)), 6);
  });

  test('da_fare conta zero anche con sessioni', () => {
    assert.equal(pesoCompletato(programma(), sessioni('C', '2026-10-05', 3)), 0);
  });

  test('pesoRimanente = totale − completato', () => {
    const args = con(programma(), { A: { stato: 'fatto' }, B: { stato: 'in_corso' } });
    assert.equal(pesoRimanente(args, sessioni('B', '2026-10-06', 3)), 22 - 4 - 3);
  });

  test('tutto completato', () => {
    const args = programma().map((a) => ({ ...a, stato: 'fatto' }));
    assert.equal(pesoRimanente(args, []), 0);
  });

  test('a inizio giornata si ignorano le sessioni di oggi', () => {
    const args = con(programma(), { B: { stato: 'in_corso' } });
    const s = [...sessioni('B', '2026-10-11', 2), ...sessioni('B', '2026-10-12', 3)];
    assert.equal(pesoCompletatoInizioGiornata(args, s, '2026-10-12'), 2);
  });

  test('a inizio giornata un argomento completato oggi conta come in corso', () => {
    const args = con(programma(), {
      A: { stato: 'fatto', dataCompletamento: '2026-10-09' },
      C: { stato: 'fatto', dataCompletamento: '2026-10-12' },
    });
    const s = [...sessioni('C', '2026-10-10', 2), ...sessioni('C', '2026-10-12', 3)];
    assert.equal(pesoCompletatoInizioGiornata(args, s, '2026-10-12'), 4 + 2);
  });

  test('fatto senza dataCompletamento conta pieno', () => {
    const args = con(programma(), { A: { stato: 'fatto' } });
    assert.equal(pesoCompletatoInizioGiornata(args, [], '2026-10-12'), 4);
  });

  test('pomodoriDelGiorno', () => {
    const s = [...sessioni('A', '2026-10-05', 2), ...sessioni('B', '2026-10-05'), ...sessioni('B', '2026-10-06')];
    assert.equal(pomodoriDelGiorno(s, '2026-10-05'), 3);
    assert.equal(pomodoriDelGiorno(s, '2026-10-07'), 0);
  });
});

describe('obiettivoOggi', () => {
  // Al 12/10: A fatto, B in corso con 3 pomodori → completato 7, rimanente 15, 5 giorni.
  const argsAl12 = () =>
    con(programma(), {
      A: { stato: 'fatto', dataCompletamento: '2026-10-09' },
      B: { stato: 'in_corso' },
    });
  const sessioniAl12 = () => [...sessioni('A', '2026-10-08', 4), ...sessioni('B', '2026-10-10', 3)];

  test('primo giorno: peso totale ÷ giorni di studio, per eccesso', () => {
    assert.deepEqual(obiettivoOggi(esame, programma(), [], '2026-10-05'), {
      stato: 'studio',
      obiettivo: 2,
      pesoRimanente: 22,
      giorniRimasti: 11,
    });
  });

  test('caso normale', () => {
    const r = obiettivoOggi(esame, argsAl12(), sessioniAl12(), '2026-10-12');
    assert.equal(r.obiettivo, 3);
    assert.equal(r.pesoRimanente, 15);
    assert.equal(r.giorniRimasti, 5);
  });

  test('non cambia durante la giornata', () => {
    const args = con(argsAl12(), { C: { stato: 'fatto', dataCompletamento: '2026-10-12' } });
    const s = [...sessioniAl12(), ...sessioni('B', '2026-10-12', 3), ...sessioni('C', '2026-10-12', 5)];
    assert.equal(obiettivoOggi(esame, args, s, '2026-10-12').obiettivo, 3);
  });

  test('se resto indietro l\'obiettivo sale', () => {
    // 22 su 3 giorni (14, 15, 16) = 7,33 → 8
    assert.equal(obiettivoOggi(esame, programma(), [], '2026-10-14').obiettivo, 8);
  });

  test('giorno di riposo: obiettivo zero', () => {
    const r = obiettivoOggi(esame, programma(), [], '2026-10-11');
    assert.equal(r.stato, 'riposo');
    assert.equal(r.obiettivo, 0);
  });

  test('prima dell\'inizio: obiettivo zero', () => {
    const r = obiettivoOggi(esame, programma(), [], '2026-10-02');
    assert.equal(r.stato, 'non_iniziato');
    assert.equal(r.obiettivo, 0);
  });

  test('in ripasso con argomenti da fare: rimanente ÷ giorni all\'esame', () => {
    const r17 = obiettivoOggi(esame, argsAl12(), sessioniAl12(), '2026-10-17');
    assert.deepEqual(r17, { stato: 'in_ripasso', obiettivo: 8, pesoRimanente: 15, giorniRimasti: 2 });
    const r18 = obiettivoOggi(esame, argsAl12(), sessioniAl12(), '2026-10-18');
    assert.equal(r18.obiettivo, 15);
  });

  test('in ripasso con tutto completato: obiettivo zero', () => {
    const args = programma().map((a) => ({ ...a, stato: 'fatto', dataCompletamento: '2026-10-15' }));
    const r = obiettivoOggi(esame, args, [], '2026-10-17');
    assert.equal(r.stato, 'in_ripasso');
    assert.equal(r.obiettivo, 0);
  });

  test('esame oggi: obiettivo null', () => {
    const r = obiettivoOggi(esame, programma(), [], '2026-10-19');
    assert.equal(r.stato, 'esame_oggi');
    assert.equal(r.obiettivo, null);
    assert.equal(r.giorniRimasti, 0);
  });

  test('esame passato: obiettivo null', () => {
    const r = obiettivoOggi(esame, programma(), [], '2026-11-02');
    assert.equal(r.stato, 'esame_passato');
    assert.equal(r.obiettivo, null);
  });

  test('esame domani senza ripasso: tutto il rimanente oggi', () => {
    const domani = { ...esame, dataInizio: '2026-10-01', dataEsame: '2026-10-06', giorniRipasso: 0 };
    const r = obiettivoOggi(domani, programma(), [], '2026-10-05');
    assert.deepEqual(r, { stato: 'studio', obiettivo: 22, pesoRimanente: 22, giorniRimasti: 1 });
  });

  test('esame domani con un giorno di ripasso', () => {
    const domani = { ...esame, dataInizio: '2026-10-01', dataEsame: '2026-10-06', giorniRipasso: 1 };
    const r = obiettivoOggi(domani, programma(), [], '2026-10-05');
    assert.equal(r.stato, 'in_ripasso');
    assert.equal(r.obiettivo, 22);
  });

  test('restano solo giorni di riposo: si usano i giorni di calendario', () => {
    // Sabato e domenica di riposo, nessun ripasso: sabato 17 non ci sono più giorni di studio.
    const weekendLibero = { ...esame, giorniRiposo: [SABATO, DOMENICA], giorniRipasso: 0 };
    const r = obiettivoOggi(weekendLibero, programma(), [], '2026-10-17');
    assert.equal(r.stato, 'studio');
    assert.equal(r.obiettivo, 11);
    assert.equal(r.giorniRimasti, 2);
  });

  test('tutto completato: obiettivo zero', () => {
    const args = programma().map((a) => ({ ...a, stato: 'fatto', dataCompletamento: '2026-10-09' }));
    assert.equal(obiettivoOggi(esame, args, [], '2026-10-12').obiettivo, 0);
  });

  test('programma vuoto: obiettivo zero', () => {
    const r = obiettivoOggi(esame, [], [], '2026-10-12');
    assert.equal(r.obiettivo, 0);
    assert.equal(r.pesoRimanente, 0);
  });
});

describe('ritmo costante', () => {
  test('pesoPrevisto a fine giornata', () => {
    assert.equal(pesoPrevisto(esame, programma(), '2026-10-05'), 2);
    assert.equal(pesoPrevisto(esame, programma(), '2026-10-09'), 10);
    assert.equal(pesoPrevisto(esame, programma(), '2026-10-11'), 12, 'la domenica non aggiunge');
    assert.equal(pesoPrevisto(esame, programma(), '2026-10-16'), 22);
  });

  test('pesoPrevisto prima dell\'inizio e dopo l\'esame', () => {
    assert.equal(pesoPrevisto(esame, programma(), '2026-10-01'), 0);
    assert.equal(pesoPrevisto(esame, programma(), '2026-10-18'), 22);
    assert.equal(pesoPrevisto(esame, programma(), '2026-12-01'), 22);
  });

  test('pesoPrevisto senza giorni di studio: tutto il peso', () => {
    assert.equal(pesoPrevisto({ ...esame, giorniRipasso: 30 }, programma(), '2026-10-05'), 22);
  });

  test('tolleranza: un giorno di ritmo, minimo 1', () => {
    assert.equal(tolleranzaInLinea(esame, programma()), 2);
    assert.equal(tolleranzaInLinea(esame, [argomento('A', 5, 1)]), 1);
    assert.equal(tolleranzaInLinea(esame, []), 1);
    assert.equal(tolleranzaInLinea({ ...esame, giorniRipasso: 30 }, programma()), 1);
  });

  test('dovreiEssereQui', () => {
    assert.equal(dovreiEssereQui(esame, programma(), '2026-10-01').id, 'A');
    assert.equal(dovreiEssereQui(esame, programma(), '2026-10-05').id, 'A');
    assert.equal(dovreiEssereQui(esame, programma(), '2026-10-07').id, 'B');
    // previsto 10 = fine esatta di B → si è già su C
    assert.equal(dovreiEssereQui(esame, programma(), '2026-10-09').id, 'C');
    assert.equal(dovreiEssereQui(esame, programma(), '2026-10-16'), null);
    assert.equal(dovreiEssereQui(esame, programma(), '2026-11-01'), null);
  });

  test('dovreiEssereQui segue ordine, non la posizione nell\'array', () => {
    const disordinati = [argomento('D', 7, 4), argomento('B', 6, 2), argomento('A', 4, 1), argomento('C', 5, 3)];
    assert.equal(dovreiEssereQui(esame, disordinati, '2026-10-07').id, 'B');
  });

  test('dovreiEssereQui con programma vuoto', () => {
    assert.equal(dovreiEssereQui(esame, [], '2026-10-07'), null);
  });
});

describe('statoAvanzamento', () => {
  test('primo giorno senza aver studiato: in linea', () => {
    const r = statoAvanzamento(esame, programma(), [], '2026-10-05');
    assert.deepEqual(r, { stato: 'in_linea', completato: 0, previsto: 2, tolleranza: 2 });
  });

  test('più di un giorno di ritmo dietro: indietro', () => {
    assert.equal(statoAvanzamento(esame, programma(), [], '2026-10-07').stato, 'indietro');
  });

  test('più di un giorno di ritmo avanti: in anticipo', () => {
    const args = con(programma(), { A: { stato: 'fatto' }, B: { stato: 'in_corso' } });
    const r = statoAvanzamento(esame, args, sessioni('B', '2026-10-05'), '2026-10-05');
    assert.equal(r.completato, 5);
    assert.equal(r.stato, 'in_anticipo');
  });

  test('esattamente al limite della tolleranza: in linea', () => {
    // previsto 6, completato 4 → scarto −2 = −tolleranza
    const args = con(programma(), { A: { stato: 'fatto' } });
    assert.equal(statoAvanzamento(esame, args, [], '2026-10-07').stato, 'in_linea');
  });

  test('tolleranza di ritmo non intera', () => {
    // totale 10 su 3 giorni: tolleranza 3,33
    const breve = { ...esame, dataInizio: '2026-10-14', dataEsame: '2026-10-17', giorniRipasso: 0 };
    const args = [argomento('A', 10, 1)];
    assert.equal(statoAvanzamento(breve, args, [], '2026-10-14').stato, 'in_linea');
    assert.equal(statoAvanzamento(breve, args, [], '2026-10-15').stato, 'indietro');
  });

  test('tutto completato a fine piano: in linea', () => {
    const args = programma().map((a) => ({ ...a, stato: 'fatto' }));
    assert.equal(statoAvanzamento(esame, args, [], '2026-10-16').stato, 'in_linea');
  });

  test('programma vuoto: in linea', () => {
    assert.equal(statoAvanzamento(esame, [], [], '2026-10-10').stato, 'in_linea');
  });
});

describe('streak', () => {
  const riposo = [DOMENICA];

  test('nessuna sessione', () => {
    assert.equal(streak([], riposo, '2026-10-07'), 0);
  });

  test('giorni consecutivi fino a oggi', () => {
    const s = [...sessioni('A', '2026-10-05'), ...sessioni('A', '2026-10-06'), ...sessioni('A', '2026-10-07')];
    assert.equal(streak(s, riposo, '2026-10-07'), 3);
  });

  test('più pomodori nello stesso giorno contano una volta', () => {
    assert.equal(streak(sessioni('A', '2026-10-07', 4), riposo, '2026-10-07'), 1);
  });

  test('se oggi non ho ancora studiato vale quella di ieri', () => {
    const s = [...sessioni('A', '2026-10-05'), ...sessioni('A', '2026-10-06')];
    assert.equal(streak(s, riposo, '2026-10-07'), 2);
  });

  test('un giorno di studio saltato la interrompe', () => {
    const s = [...sessioni('A', '2026-10-05'), ...sessioni('A', '2026-10-07')];
    assert.equal(streak(s, riposo, '2026-10-07'), 1);
    assert.equal(streak(s, riposo, '2026-10-09'), 0);
  });

  test('il riposo pianificato non la interrompe', () => {
    const s = [...sessioni('A', '2026-10-09'), ...sessioni('A', '2026-10-10'), ...sessioni('A', '2026-10-12')];
    assert.equal(streak(s, riposo, '2026-10-12'), 3);
  });

  test('il riposo come giorno attuale non la azzera', () => {
    const s = [...sessioni('A', '2026-10-09'), ...sessioni('A', '2026-10-10')];
    assert.equal(streak(s, riposo, '2026-10-11'), 2);
  });

  test('studiare in un giorno di riposo fa +1', () => {
    const s = [...sessioni('A', '2026-10-10'), ...sessioni('A', '2026-10-11'), ...sessioni('A', '2026-10-12')];
    assert.equal(streak(s, riposo, '2026-10-12'), 3);
  });

  test('le sessioni future non contano', () => {
    const s = [...sessioni('A', '2026-10-06'), ...sessioni('A', '2026-10-08')];
    assert.equal(streak(s, riposo, '2026-10-06'), 1);
  });

  test('tutti i giorni di riposo: termina comunque', () => {
    const s = sessioni('A', '2026-09-01');
    assert.equal(streak(s, [0, 1, 2, 3, 4, 5, 6], '2026-10-07'), 1);
  });
});
