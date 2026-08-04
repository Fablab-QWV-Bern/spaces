/**
 * Who is sitting where right now — the question the overview map answers.
 *
 * A workplace is occupied when a booking on it covers the present moment, or when
 * a booking on *another* workplace also blocks it at that moment. Both at once
 * cannot occur — that is exactly what the collision rules in the backend prevent.
 * Should it happen anyway, the workplace's own booking wins: it is the statement
 * about this workplace, the blockage only a shadow.
 *
 * The detail card's content is built here rather than in the view, so that the
 * card on the overview is the same one as in the calendar — it receives the same
 * `CardDetails`.
 */

import { Booking } from '../api/models';
import { CardDetails } from '../calendar/blocks';
import { formatTime } from '../calendar/time-axis';

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
 * The detail cards of the occupied workplaces, keyed by workplace identifier.
 * Free workplaces are absent from the map — nobody stands there on the plan.
 */
export function occupancyAt(context: OccupancyContext, now: Date): Map<string, CardDetails> {
  const occupied = new Map<string, CardDetails>();
  const ids = new Set([...context.bookings.keys(), ...context.blockages.keys()]);

  for (const workplaceId of ids) {
    const own = covering(context.bookings.get(workplaceId), now);
    const blockage = own ? null : covering(context.blockages.get(workplaceId), now);
    const booking = own ?? blockage;

    if (!booking) {
      continue;
    }

    occupied.set(workplaceId, {
      booking,
      workplaceName: context.nameOf(workplaceId),
      bookedWorkplaceName: context.nameOf(booking.workplaceId),
      timeRange: `${formatTime(new Date(booking.startTime))}–${formatTime(new Date(booking.endTime))}`,
      isBlockage: own === null,
    });
  }

  return occupied;
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
