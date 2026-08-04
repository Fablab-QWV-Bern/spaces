import { describe, expect, it } from 'vitest';

import { monthOf, weekOf } from './calendar-store';

describe('weekOf', () => {
  it('begins on Monday', () => {
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

  it('assigns Sunday to the week before', () => {
    expect(weekOf('2026-08-02')[0]).toBe('2026-07-27');
  });

  it('stays put on Monday itself', () => {
    expect(weekOf('2026-07-27')[0]).toBe('2026-07-27');
  });

  // If the week were computed via midnight rather than midday, a DST change
  // would shift one day onto the previous one.
  it('survives the DST change', () => {
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
  it('reaches from the first to the last', () => {
    const days = monthOf('2026-07-15');

    expect(days).toHaveLength(31);
    expect(days[0]).toBe('2026-07-01');
    expect(days.at(-1)).toBe('2026-07-31');
  });

  it('knows the length of short months', () => {
    expect(monthOf('2026-02-10')).toHaveLength(28);
    expect(monthOf('2028-02-10')).toHaveLength(29);
    expect(monthOf('2026-04-30').at(-1)).toBe('2026-04-30');
  });

  // As with the week: computed via midnight, the day of the change would be 23
  // hours long and would appear twice in the list.
  it('survives the DST change', () => {
    const days = monthOf('2026-03-01');

    expect(days).toHaveLength(31);
    expect(new Set(days).size).toBe(31);
    expect(days).toContain('2026-03-29');
  });
});
