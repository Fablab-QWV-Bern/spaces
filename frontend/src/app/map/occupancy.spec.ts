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
    expect(occupancy.get('holz-1')!.state).toBe('busy');
    expect(occupancy.get('holz-1')!.details.workplaceName).toBe('Holz 1');
    expect(occupancy.get('holz-1')!.details.isBlockage).toBe(false);
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

    expect(occupancyAt(context({ bookings }), at('07:00')).get('holz-1')!.state).toBe('busy');
    expect(occupancyAt(context({ bookings }), at('09:00')).size).toBe(0);
  });

  it('also occupies what a booking elsewhere blocks', () => {
    const blocked = booking({ workplaceId: 'holz-1', blockedWorkplaceIds: ['holz-2'] });
    const occupancy = occupancyAt(
      context({ blockages: new Map([['holz-2', [blocked]]]) }),
      at('08:00'),
    );

    const { details } = occupancy.get('holz-2')!;

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

    expect(occupancy.get('holz-1')!.details.booking.id).toBe('eigen');
    expect(occupancy.get('holz-1')!.details.isBlockage).toBe(false);
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

    expect(occupancy.get('holz-1')!.details.booking.id).toBe('abends');
  });

  describe('what is still ahead', () => {
    const upcoming = booking({
      startTime: '2026-08-03T10:00:00.000Z',
      endTime: '2026-08-03T12:00:00.000Z',
    });

    it('marks a workplace whose booking begins within the half hour', () => {
      const occupancy = occupancyAt(
        context({ bookings: new Map([['holz-1', [upcoming]]]) }),
        at('09:40'),
      );

      expect(occupancy.get('holz-1')!.state).toBe('soon');
      // The card shows the coming booking, not an empty state.
      expect(occupancy.get('holz-1')!.details.booking.id).toBe('b-1');
    });

    it('leaves it alone while the booking is further off', () => {
      const occupancy = occupancyAt(
        context({ bookings: new Map([['holz-1', [upcoming]]]) }),
        at('09:29'),
      );

      expect(occupancy.size).toBe(0);
    });

    it('takes the half hour as included', () => {
      const occupancy = occupancyAt(
        context({ bookings: new Map([['holz-1', [upcoming]]]) }),
        at('09:30'),
      );

      expect(occupancy.get('holz-1')!.state).toBe('soon');
    });

    it('lets a running booking beat a coming one', () => {
      const running = booking({ id: 'laeuft' });

      const occupancy = occupancyAt(
        context({ bookings: new Map([['holz-1', [upcoming, running]]]) }),
        at('08:50'),
      );

      expect(occupancy.get('holz-1')!.state).toBe('busy');
      expect(occupancy.get('holz-1')!.details.booking.id).toBe('laeuft');
    });

    it('takes the earliest of several coming bookings', () => {
      const later = booking({
        id: 'spaeter',
        startTime: '2026-08-03T10:15:00.000Z',
        endTime: '2026-08-03T11:00:00.000Z',
      });

      const occupancy = occupancyAt(
        context({ bookings: new Map([['holz-1', [later, upcoming]]]) }),
        at('09:50'),
      );

      expect(occupancy.get('holz-1')!.details.booking.id).toBe('b-1');
    });

    it('takes a coming blockage when nothing of its own is closer', () => {
      const blockage = booking({
        id: 'fremd',
        workplaceId: 'holz-1',
        startTime: '2026-08-03T10:00:00.000Z',
        endTime: '2026-08-03T12:00:00.000Z',
        blockedWorkplaceIds: ['holz-2'],
      });

      const occupancy = occupancyAt(
        context({ blockages: new Map([['holz-2', [blockage]]]) }),
        at('09:40'),
      );

      expect(occupancy.get('holz-2')!.state).toBe('soon');
      expect(occupancy.get('holz-2')!.details.isBlockage).toBe(true);
    });
  });
});
