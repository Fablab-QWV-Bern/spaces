import { describe, expect, it } from 'vitest';

import { monthOf, weekOf } from './calendar-store';

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

describe('monthOf', () => {
  it('reicht vom Ersten bis zum Letzten', () => {
    const days = monthOf('2026-07-15');

    expect(days).toHaveLength(31);
    expect(days[0]).toBe('2026-07-01');
    expect(days.at(-1)).toBe('2026-07-31');
  });

  it('kennt die Länge kurzer Monate', () => {
    expect(monthOf('2026-02-10')).toHaveLength(28);
    expect(monthOf('2028-02-10')).toHaveLength(29);
    expect(monthOf('2026-04-30').at(-1)).toBe('2026-04-30');
  });

  // Wie bei der Woche: über Mitternacht gerechnet wäre der Tag der Umstellung
  // 23 Stunden lang und käme doppelt in der Liste vor.
  it('übersteht die Zeitumstellung', () => {
    const days = monthOf('2026-03-01');

    expect(days).toHaveLength(31);
    expect(new Set(days).size).toBe(31);
    expect(days).toContain('2026-03-29');
  });
});
