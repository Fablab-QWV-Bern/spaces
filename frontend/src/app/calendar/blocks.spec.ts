import { describe, expect, it } from 'vitest';

import { Booking } from '../api/models';
import { BlockContext, blocksFor } from './blocks';
import { buildTimeAxis } from './time-axis';

const axis = buildTimeAxis('08:00', '21:00');

function context(day: string): BlockContext {
  return {
    axis,
    day: new Date(`${day}T12:00:00`),
    workplaceName: 'Holz 1',
    color: '#84cc16',
    nameOf: (id) => (id === 'wp-2' ? 'Metall vorne' : 'Holz 1'),
  };
}

function booking(partial: Partial<Booking>): Booking {
  return {
    id: 'b-1',
    workplaceId: 'wp-1',
    name: 'Regina Meier',
    contact: null,
    startTime: '2026-08-03T07:00:00.000Z',
    endTime: '2026-08-03T09:00:00.000Z',
    bookingSeriesId: null,
    blockedWorkplaceIds: [],
    ...partial,
  } as Booking;
}

/** Lokale Zeit als UTC-Instant, wie ihn die API liefert. */
function utc(local: string): string {
  return new Date(local).toISOString();
}

describe('blocksFor', () => {
  it('legt Blockierungen unter die Buchungen', () => {
    const blocks = blocksFor(
      context('2026-08-03'),
      [
        booking({
          id: 'eigen',
          startTime: utc('2026-08-03T09:00'),
          endTime: utc('2026-08-03T11:00'),
        }),
      ],
      [
        booking({
          id: 'fremd',
          startTime: utc('2026-08-03T09:00'),
          endTime: utc('2026-08-03T11:00'),
        }),
      ],
    );

    expect(blocks.map((block) => block.booking.id)).toEqual(['fremd', 'eigen']);
    expect(blocks.map((block) => block.isBlockage)).toEqual([true, false]);
  });

  it('haelt Blockierungen unbeschriftet und benennt den blockierenden Platz', () => {
    const [block] = blocksFor(
      context('2026-08-03'),
      [],
      [
        booking({
          workplaceId: 'wp-2',
          startTime: utc('2026-08-03T09:00'),
          endTime: utc('2026-08-03T12:00'),
        }),
      ],
    );

    expect(block.label).toBe('');
    expect(block.color).toBeNull();
    expect(block.title).toBe('Blockiert durch Regina Meier, 09:00–12:00');
    expect(block.card.bookedWorkplaceName).toBe('Metall vorne');
  });

  it('platziert auf benannten Rasterlinien', () => {
    const [block] = blocksFor(
      context('2026-08-03'),
      [booking({ startTime: utc('2026-08-03T09:15'), endTime: utc('2026-08-03T13:00') })],
      [],
    );

    expect(block.gridColumn).toBe('t0915 / t1300');
  });

  it('zerlegt eine Buchung ueber Nacht auf beide Tage', () => {
    const overnight = booking({
      startTime: utc('2026-08-03T20:00'),
      endTime: utc('2026-08-04T09:00'),
    });

    const [erster] = blocksFor(context('2026-08-03'), [overnight], []);
    const [zweiter] = blocksFor(context('2026-08-04'), [overnight], []);

    // Der erste Tag endet an der Schliesszeit, der zweite beginnt an der Oeffnung.
    expect(erster.gridColumn).toBe('t2000 / t2100');
    expect(erster.clippedEnd).toBe(true);
    expect(erster.clippedStart).toBe(false);

    expect(zweiter.gridColumn).toBe('t0800 / t0900');
    expect(zweiter.clippedStart).toBe(true);
    expect(zweiter.clippedEnd).toBe(false);
  });

  it('laesst eine Buchung ausserhalb des Tages weg', () => {
    const blocks = blocksFor(
      context('2026-08-05'),
      [booking({ startTime: utc('2026-08-03T09:00'), endTime: utc('2026-08-03T11:00') })],
      [],
    );

    expect(blocks).toEqual([]);
  });
});
