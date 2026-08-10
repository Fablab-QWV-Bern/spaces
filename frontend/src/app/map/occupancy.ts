/**
 * What is on a workplace right now — the question the overview map answers.
 *
 * A workplace is occupied when a booking on it covers the present moment, or when
 * a booking on *another* workplace also blocks it at that moment. Both at once
 * cannot occur — that is exactly what the collision rules in the backend prevent.
 * Should it happen anyway, the workplace's own booking wins: it is the statement
 * about this workplace, the blockage only a shadow.
 *
 * Whatever is still ahead counts too, as long as it begins within the next half
 * hour. On a map of the present moment that is the more useful truth than a bare
 * yes-or-no: a bench that is free for another ten minutes is not one you can start
 * working at.
 *
 * The detail card's content is built here rather than in the view, so that the
 * card on the overview is the same one as in the calendar — it receives the same
 * `CardDetails`.
 */

import { Booking } from '../api/models';
import { CardDetails } from '../calendar/blocks';
import { formatTime } from '../calendar/time-axis';

/**
 * How far ahead a booking already marks its workplace.
 *
 * Half an hour, because that is roughly what it takes to set something up and
 * clear it away again. Longer, and on a well-booked day half the map would be
 * marked and the marking would say nothing.
 */
export const SOON_MINUTES = 30;

/** `busy` while the booking is running, `soon` while it is still ahead. */
export type OccupancyState = 'busy' | 'soon';

export interface Occupancy {
  state: OccupancyState;
  /** The booking behind it — the running one, or the imminent one. */
  details: CardDetails;
}

/** What the occupancy needs to know about its surroundings. */
export interface OccupancyContext {
  /** Bookings per workplace — the workplace's own. */
  bookings: Map<string, Booking[]>;
  /** Bookings on other workplaces that also occupy this one. */
  blockages: Map<string, Booking[]>;
  /** Resolves a workplace identifier to its name. */
  nameOf: (workplaceId: string) => string;
}

/**
 * The state of every workplace that is not free, keyed by workplace identifier.
 * Free workplaces are absent — on the map they are simply the ones without a
 * class.
 */
export function occupancyAt(context: OccupancyContext, now: Date): Map<string, Occupancy> {
  const occupied = new Map<string, Occupancy>();
  const ids = new Set([...context.bookings.keys(), ...context.blockages.keys()]);

  for (const workplaceId of ids) {
    const found = onWorkplace(context, workplaceId, now);

    if (!found) {
      continue;
    }

    const { booking } = found;

    occupied.set(workplaceId, {
      state: found.state,
      details: {
        booking,
        workplaceName: context.nameOf(workplaceId),
        bookedWorkplaceName: context.nameOf(booking.workplaceId),
        timeRange: `${formatTime(new Date(booking.startTime))}–${formatTime(new Date(booking.endTime))}`,
        isBlockage: found.isBlockage,
      },
    });
  }

  return occupied;
}

interface Found {
  booking: Booking;
  isBlockage: boolean;
  state: OccupancyState;
}

/**
 * What speaks for this workplace, in order of precedence: what is running beats
 * what is coming, and the workplace's own booking beats the shadow of another's.
 */
function onWorkplace(context: OccupancyContext, workplaceId: string, now: Date): Found | null {
  const own = context.bookings.get(workplaceId);
  const foreign = context.blockages.get(workplaceId);

  const running = covering(own, now);

  if (running) {
    return { booking: running, isBlockage: false, state: 'busy' };
  }

  const shadowing = covering(foreign, now);

  if (shadowing) {
    return { booking: shadowing, isBlockage: true, state: 'busy' };
  }

  // Nothing is running: whatever begins first counts. Here the workplace's own
  // booking does not win by right but only when it is not the later one — with
  // nothing running, "soon" is a statement about time, not about ownership.
  const imminentOwn = imminent(own, now);
  const imminentForeign = imminent(foreign, now);

  if (imminentOwn && (!imminentForeign || startsBefore(imminentOwn, imminentForeign))) {
    return { booking: imminentOwn, isBlockage: false, state: 'soon' };
  }

  return imminentForeign ? { booking: imminentForeign, isBlockage: true, state: 'soon' } : null;
}

/**
 * The first booking that covers the present moment. The end no longer counts:
 * at twelve on the dot the workplace is free, not doubly occupied.
 */
function covering(bookings: Booking[] | undefined, now: Date): Booking | null {
  const instant = now.getTime();

  return (
    bookings?.find(
      (booking) =>
        Date.parse(booking.startTime) <= instant && instant < Date.parse(booking.endTime),
    ) ?? null
  );
}

/**
 * The earliest booking that begins within the next half hour. Deliberately the
 * earliest and not the first found: the list arrives in the order the API
 * delivers it, and "soon" means the next one.
 */
function imminent(bookings: Booking[] | undefined, now: Date): Booking | null {
  const instant = now.getTime();
  const horizon = instant + SOON_MINUTES * 60_000;

  return (
    bookings?.reduce<Booking | null>((earliest, booking) => {
      const start = Date.parse(booking.startTime);

      if (start <= instant || start > horizon) {
        return earliest;
      }

      return !earliest || startsBefore(booking, earliest) ? booking : earliest;
    }, null) ?? null
  );
}

function startsBefore(one: Booking, other: Booking): boolean {
  return Date.parse(one.startTime) < Date.parse(other.startTime);
}
