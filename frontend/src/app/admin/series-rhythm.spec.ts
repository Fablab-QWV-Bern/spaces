import { describe, expect, it } from 'vitest';

import { BookingSeries } from '../api/models';
import { describeRhythm, rhythmByKey, rhythmOf, skipsMonths } from './series-rhythm';

function series(overrides: Partial<BookingSeries> = {}): BookingSeries {
  return {
    id: 's1',
    workplaceId: 'holz-1',
    name: 'Reparaturcafé',
    contact: 'reparatur@example.org',
    interval: 'WEEKLY',
    intervalCount: 1,
    // Der 3. August 2026 ist ein Montag.
    firstInstanceStart: '2026-08-03T09:00',
    firstInstanceEnd: '2026-08-03T11:00',
    endDate: null,
    instantiatedUntil: '2027-08-03',
    ...overrides,
  };
}

describe('rhythmOf', () => {
  it('erkennt die drei angebotenen Takte', () => {
    expect(rhythmOf({ interval: 'WEEKLY', intervalCount: 1 })).toBe('weekly');
    expect(rhythmOf({ interval: 'WEEKLY', intervalCount: 2 })).toBe('biweekly');
    expect(rhythmOf({ interval: 'MONTHLY', intervalCount: 1 })).toBe('monthly');
  });

  // Über die API lässt sich jede Anzahl anlegen; das Formular bietet nur drei an.
  it('fällt bei einem fremden Takt auf den nächstliegenden zurück', () => {
    expect(rhythmOf({ interval: 'WEEKLY', intervalCount: 3 })).toBe('weekly');
    expect(rhythmOf({ interval: 'MONTHLY', intervalCount: 4 })).toBe('monthly');
  });
});

describe('rhythmByKey', () => {
  it('macht aus „alle zwei Wochen" wieder WEEKLY mit 2', () => {
    expect(rhythmByKey('biweekly')).toMatchObject({ interval: 'WEEKLY', intervalCount: 2 });
  });
});

describe('describeRhythm', () => {
  it('nennt den Wochentag, der aus dem Datum folgt', () => {
    expect(describeRhythm(series())).toBe('jeden Montag, 09:00–11:00');
  });

  it('unterscheidet zweiwöchentlich von wöchentlich', () => {
    expect(describeRhythm(series({ intervalCount: 2 }))).toBe('jeden zweiten Montag, 09:00–11:00');
  });

  it('nennt bei MONTHLY den Tag im Monat', () => {
    expect(
      describeRhythm(
        series({
          interval: 'MONTHLY',
          firstInstanceStart: '2026-08-31T14:00',
          firstInstanceEnd: '2026-08-31T17:00',
        }),
      ),
    ).toBe('am 31. jedes Monats, 14:00–17:00');
  });

  // Wäre die Wanduhrzeit als UTC gelesen, verschöbe sie sich um zwei Stunden
  // und der Wochentag könnte kippen.
  it('liest die Wanduhrzeit als Ortszeit', () => {
    expect(describeRhythm(series({ firstInstanceStart: '2026-08-03T00:15' }))).toContain('Montag');
    expect(describeRhythm(series({ firstInstanceStart: '2026-08-03T00:15' }))).toContain('00:15');
  });
});

describe('skipsMonths', () => {
  it('warnt ab dem 29., weil der Februar ihn meist nicht hat', () => {
    expect(skipsMonths(28)).toBe(false);
    expect(skipsMonths(29)).toBe(true);
    expect(skipsMonths(31)).toBe(true);
  });
});
