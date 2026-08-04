/**
 * The view model of a bar in the calendar. Like the time axis, deliberately free
 * of Angular — and like it, shared by all zoom levels: a bar is built the same
 * way whether it sits in a day, week or month cell.
 *
 * A block carries everything fully prepared, including the content of its detail
 * card. That way the cell rendering it needs to know nothing about workplaces and
 * areas.
 */

import { Booking } from '../api/models';
import { TimeAxis, formatTime, gridColumn, visibleRange } from './time-axis';

/** The expanded detail card for a block. */
export interface CardDetails {
  booking: Booking;
  /** The workplace in whose row the block sits. */
  workplaceName: string;
  /** For a blockage, the workplace the booking actually sits on. */
  bookedWorkplaceName: string;
  timeRange: string;
  isBlockage: boolean;
}

export interface Block {
  /** Unique within a cell — the same booking can appear both as a booking and
   *  as a blockage. */
  id: string;
  booking: Booking;
  label: string;
  title: string;
  /** Placement in the column grid, e.g. "t0900 / t1300". */
  gridColumn: string;
  /** The area's colour; null for blockages, which take their hatching from the
   *  stylesheet. */
  color: string | null;
  clippedStart: boolean;
  clippedEnd: boolean;
  isSeries: boolean;
  isBlockage: boolean;
  card: CardDetails;
}

/** What a block needs to know about its surroundings in order to build itself. */
export interface BlockContext {
  axis: TimeAxis;
  /** The day being shown. Blocks are clipped to it — which is why an overnight
   *  booking appears in both day cells. */
  day: Date;
  workplaceName: string;
  color: string;
  /** Resolves a workplace identifier to its name. */
  nameOf: (workplaceId: string) => string;
}

/**
 * A cell's bars, blockages first — so that the actual bookings lie on top.
 */
export function blocksFor(
  context: BlockContext,
  bookings: Booking[],
  blockages: Booking[],
): Block[] {
  return [...build(context, blockages, true), ...build(context, bookings, false)];
}

function build(context: BlockContext, bookings: Booking[], blockage: boolean): Block[] {
  return bookings
    .map((booking) => {
      const start = new Date(booking.startTime);
      const end = new Date(booking.endTime);
      const range = visibleRange(context.axis, start, end, context.day);

      if (!range) {
        return null;
      }

      const who = booking.name;
      const timeRange = `${formatTime(start)}–${formatTime(end)}`;

      return {
        id: `${blockage ? 'x' : 'b'}-${booking.id}`,
        booking,
        label: blockage ? '' : who,
        title: blockage ? `Blockiert durch ${who}, ${timeRange}` : `${who}, ${timeRange}`,
        gridColumn: gridColumn(range),
        color: blockage ? null : context.color,
        clippedStart: range.clippedStart,
        clippedEnd: range.clippedEnd,
        isSeries: booking.bookingSeriesId !== null,
        isBlockage: blockage,
        card: {
          booking,
          workplaceName: context.workplaceName,
          bookedWorkplaceName: context.nameOf(booking.workplaceId),
          timeRange,
          isBlockage: blockage,
        },
      } satisfies Block;
    })
    .filter((block): block is Block => block !== null);
}
