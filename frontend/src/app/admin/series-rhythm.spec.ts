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
    // 3 August 2026 is a Monday.
    firstInstanceStart: '2026-08-03T09:00',
    firstInstanceEnd: '2026-08-03T11:00',
    endDate: null,
    instantiatedUntil: '2027-08-03',
    ...overrides,
  };
}

describe('rhythmOf', () => {
  it('recognises the three offered rhythms', () => {
    expect(rhythmOf({ interval: 'WEEKLY', intervalCount: 1 })).toBe('weekly');
    expect(rhythmOf({ interval: 'WEEKLY', intervalCount: 2 })).toBe('biweekly');
    expect(rhythmOf({ interval: 'MONTHLY', intervalCount: 1 })).toBe('monthly');
  });

  // Any count can be created through the API; the form offers only three.
  it('falls back to the nearest rhythm for an unfamiliar one', () => {
    expect(rhythmOf({ interval: 'WEEKLY', intervalCount: 3 })).toBe('weekly');
    expect(rhythmOf({ interval: 'MONTHLY', intervalCount: 4 })).toBe('monthly');
  });
});

describe('rhythmByKey', () => {
  it('turns "alle zwei Wochen" back into WEEKLY with 2', () => {
    expect(rhythmByKey('biweekly')).toMatchObject({ interval: 'WEEKLY', intervalCount: 2 });
  });
});

describe('describeRhythm', () => {
  it('names the weekday that follows from the date', () => {
    expect(describeRhythm(series())).toBe('jeden Montag, 09:00–11:00');
  });

  it('distinguishes fortnightly from weekly', () => {
    expect(describeRhythm(series({ intervalCount: 2 }))).toBe('jeden zweiten Montag, 09:00–11:00');
  });

  it('names the day of the month for MONTHLY', () => {
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

  // If the wall-clock time were read as UTC it would shift by two hours and the
  // weekday could flip.
  it('reads the wall-clock time as local time', () => {
    expect(describeRhythm(series({ firstInstanceStart: '2026-08-03T00:15' }))).toContain('Montag');
    expect(describeRhythm(series({ firstInstanceStart: '2026-08-03T00:15' }))).toContain('00:15');
  });
});

describe('skipsMonths', () => {
  it('warns from the 29th, because February usually does not have it', () => {
    expect(skipsMonths(28)).toBe(false);
    expect(skipsMonths(29)).toBe(true);
    expect(skipsMonths(31)).toBe(true);
  });
});
