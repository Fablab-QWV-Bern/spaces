import { describe, expect, it } from 'vitest';

import { weekOf } from './calendar-store';

describe('weekOf', () => {
  it('beginnt am Montag', () => {
    expect(weekOf('2026-07-29')).toEqual([
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ]);
  });

  it('schlägt den Sonntag der Woche davor zu', () => {
    expect(weekOf('2026-08-02')[0]).toBe('2026-07-27');
  });

  it('bleibt am Montag selbst stehen', () => {
    expect(weekOf('2026-07-27')[0]).toBe('2026-07-27');
  });

  // Rechnete die Woche über Mitternacht statt über Mittag, verschöbe die
  // Zeitumstellung einen Tag auf den Vortag.
  it('übersteht die Zeitumstellung', () => {
    expect(weekOf('2026-03-29')).toEqual([
      '2026-03-23',
      '2026-03-24',
      '2026-03-25',
      '2026-03-26',
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
    ]);
  });
});
