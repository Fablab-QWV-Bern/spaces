import { describe, expect, it } from 'vitest';

import { Booking } from '../api/models';
import { OccupancyContext, occupancyAt } from './occupancy';

function booking(partial: Partial<Booking>): Booking {
  return {
    id: 'b-1',
    workplaceId: 'holz-1',
    name: 'Regina Meier',
    contact: null,
    startTime: '2026-08-03T07:00:00.000Z',
    endTime: '2026-08-03T09:00:00.000Z',
    bookingSeriesId: null,
    blockedWorkplaceIds: [],
    ...partial,
  } as Booking;
}

const names: Record<string, string> = { 'holz-1': 'Holz 1', 'holz-2': 'Holz 2' };

function context(partial: Partial<OccupancyContext>): OccupancyContext {
  return {
    bookings: new Map(),
    blockages: new Map(),
    nameOf: (id) => names[id] ?? id,
    ...partial,
  };
}

const at = (time: string) => new Date(`2026-08-03T${time}:00.000Z`);

describe('occupancyAt', () => {
  it('names the occupied workplace with the booking details', () => {
    const occupancy = occupancyAt(
      context({ bookings: new Map([['holz-1', [booking({})]]]) }),
      at('08:00'),
    );

    expect([...occupancy.keys()]).toEqual(['holz-1']);
    expect(occupancy.get('holz-1')!.workplaceName).toBe('Holz 1');
    expect(occupancy.get('holz-1')!.isBlockage).toBe(false);
  });

  it('leaves out a free workplace', () => {
    const occupancy = occupancyAt(
      context({ bookings: new Map([['holz-1', [booking({})]]]) }),
      at('10:00'),
    );

    expect(occupancy.size).toBe(0);
  });

  it('counts the start as included and the end as excluded', () => {
    const bookings = new Map([['holz-1', [booking({})]]]);

    expect(occupancyAt(context({ bookings }), at('07:00')).size).toBe(1);
    expect(occupancyAt(context({ bookings }), at('09:00')).size).toBe(0);
  });

  it('also occupies what a booking elsewhere blocks', () => {
    const blocked = booking({ workplaceId: 'holz-1', blockedWorkplaceIds: ['holz-2'] });
    const occupancy = occupancyAt(
      context({ blockages: new Map([['holz-2', [blocked]]]) }),
      at('08:00'),
    );

    const details = occupancy.get('holz-2')!;

    expect(details.isBlockage).toBe(true);
    // The map names the workplace the booking actually sits on.
    expect(details.workplaceName).toBe('Holz 2');
    expect(details.bookedWorkplaceName).toBe('Holz 1');
  });

  it('prefers the workplace own booking over a blockage', () => {
    const own = booking({ id: 'eigen', workplaceId: 'holz-1' });
    const foreign = booking({ id: 'fremd', workplaceId: 'holz-2' });

    const occupancy = occupancyAt(
      context({
        bookings: new Map([['holz-1', [own]]]),
        blockages: new Map([['holz-1', [foreign]]]),
      }),
      at('08:00'),
    );

    expect(occupancy.get('holz-1')!.booking.id).toBe('eigen');
    expect(occupancy.get('holz-1')!.isBlockage).toBe(false);
  });

  it('picks the running one out of several bookings on the day', () => {
    const morgens = booking({ id: 'morgens' });
    const abends = booking({
      id: 'abends',
      startTime: '2026-08-03T16:00:00.000Z',
      endTime: '2026-08-03T18:00:00.000Z',
    });

    const occupancy = occupancyAt(
      context({ bookings: new Map([['holz-1', [morgens, abends]]]) }),
      at('17:00'),
    );

    expect(occupancy.get('holz-1')!.booking.id).toBe('abends');
  });
});
