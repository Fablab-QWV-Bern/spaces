import { describe, expect, it } from 'vitest';

import { Booking } from '../api/models';
import { agendaFor } from './agenda';

// Local wall-clock times, deliberately without a zone: the grouping asks for the
// hour on the workshop's wall, and written as UTC the test would say something
// different in every timezone. The API delivers UTC — `Date.parse` reads both.
const at = (time: string) => `2026-08-03T${time}:00`;

function booking(partial: Partial<Booking>): Booking {
  return {
    id: 'b-1',
    workplaceId: 'holz-1',
    name: 'Regina Meier',
    contact: null,
    startTime: at('09:00'),
    endTime: at('11:00'),
    bookingSeriesId: null,
    blockedWorkplaceIds: [],
    ...partial,
  } as Booking;
}

const names: Record<string, string> = { 'holz-1': 'Holz 1', 'holz-2': 'Holz 2' };
const nameOf = (id: string) => names[id] ?? id;
const now = (time: string) => new Date(at(time));

describe('agendaFor', () => {
  it('puts what is running under "Aktuell"', () => {
    const groups = agendaFor([booking({})], nameOf, now('10:00'));

    expect(groups).toHaveLength(1);
    expect(groups[0].heading).toBe('Aktuell');
    expect(groups[0].entries[0]).toMatchObject({
      workplaceName: 'Holz 1',
      timeRange: '09:00–11:00',
      who: 'Regina Meier',
    });
  });

  it('leaves out what is already over', () => {
    expect(agendaFor([booking({})], nameOf, now('11:00'))).toEqual([]);
  });

  it('names the hour in which something begins', () => {
    const groups = agendaFor(
      [booking({ startTime: at('17:30'), endTime: at('19:00') })],
      nameOf,
      now('10:00'),
    );

    expect(groups.map((group) => group.heading)).toEqual(['ab 17 Uhr']);
    expect(groups[0].entries[0].timeRange).toBe('17:30–19:00');
  });

  it('collects an hour into one group', () => {
    const groups = agendaFor(
      [
        booking({ id: 'a', startTime: at('17:00'), endTime: at('18:00') }),
        booking({ id: 'b', startTime: at('17:45'), endTime: at('18:30') }),
      ],
      nameOf,
      now('10:00'),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].entries.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('opens a group only for an hour that has something in it', () => {
    const groups = agendaFor(
      [
        booking({ id: 'abends', startTime: at('19:00'), endTime: at('20:00') }),
        booking({ id: 'gleich', startTime: at('17:00'), endTime: at('18:00') }),
      ],
      nameOf,
      now('10:00'),
    );

    // Nothing between 17 and 19, so no empty heading in between.
    expect(groups.map((group) => group.heading)).toEqual(['ab 17 Uhr', 'ab 19 Uhr']);
  });

  it('puts the running group first, then the hours in order', () => {
    const groups = agendaFor(
      [
        booking({ id: 'spaet', startTime: at('19:00'), endTime: at('20:00') }),
        booking({ id: 'laeuft', startTime: at('09:00'), endTime: at('11:00') }),
        booking({ id: 'frueher', startTime: at('17:00'), endTime: at('18:00') }),
      ],
      nameOf,
      now('10:00'),
    );

    expect(groups.map((group) => group.heading)).toEqual(['Aktuell', 'ab 17 Uhr', 'ab 19 Uhr']);
  });

  it('sorts within a group by start time', () => {
    const groups = agendaFor(
      [
        booking({ id: 'zweite', startTime: at('10:30'), endTime: at('12:00') }),
        booking({ id: 'erste', startTime: at('09:00'), endTime: at('12:00') }),
      ],
      nameOf,
      now('11:00'),
    );

    expect(groups[0].entries.map((entry) => entry.id)).toEqual(['erste', 'zweite']);
  });

  it('counts a booking that begins exactly now as running', () => {
    const groups = agendaFor(
      [booking({ startTime: at('17:00'), endTime: at('18:00') })],
      nameOf,
      now('17:00'),
    );

    expect(groups[0].heading).toBe('Aktuell');
  });

  it('makes one row per booking, however many workplaces it blocks', () => {
    const groups = agendaFor(
      [booking({ blockedWorkplaceIds: ['holz-2', 'holz-3'] })],
      nameOf,
      now('10:00'),
    );

    expect(groups[0].entries).toHaveLength(1);
    expect(groups[0].entries[0].workplaceName).toBe('Holz 1');
  });
});
