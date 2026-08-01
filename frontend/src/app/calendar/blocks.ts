/**
 * Das Ansichtsmodell eines Balkens im Kalender. Wie die Zeitachse bewusst frei
 * von Angular — und wie sie von allen Zoomstufen geteilt: ein Balken entsteht
 * immer gleich, egal ob er in einer Tages-, Wochen- oder Monatszelle liegt.
 *
 * Ein Block trägt alles fertig aufbereitet, auch den Inhalt seiner Detailkarte.
 * Damit muss die Zelle, die ihn darstellt, nichts über Arbeitsplätze und
 * Bereiche wissen.
 */

import { Booking } from '../api/models';
import { TimeAxis, formatTime, gridColumn, visibleRange } from './time-axis';

/** Die aufgeklappte Detailkarte zu einem Block. */
export interface CardDetails {
  booking: Booking;
  /** Der Arbeitsplatz, in dessen Zeile der Block liegt. */
  workplaceName: string;
  /** Bei einer Blockierung der Platz, auf dem die Buchung tatsächlich liegt. */
  bookedWorkplaceName: string;
  timeRange: string;
  isBlockage: boolean;
}

export interface Block {
  /** Eindeutig innerhalb einer Zelle — dieselbe Buchung kann als Buchung und
   *  als Blockierung auftreten. */
  id: string;
  booking: Booking;
  label: string;
  title: string;
  /** Platzierung im Spaltenraster, z.B. "t0900 / t1300". */
  gridColumn: string;
  /** Farbe des Bereichs; null bei Blockierungen, die ihre Schraffur aus dem
   *  Stylesheet beziehen. */
  color: string | null;
  clippedStart: boolean;
  clippedEnd: boolean;
  isSeries: boolean;
  isBlockage: boolean;
  card: CardDetails;
}

/** Was ein Block über seine Umgebung wissen muss, um sich selbst zu bauen. */
export interface BlockContext {
  axis: TimeAxis;
  /** Der dargestellte Tag. Blöcke werden auf ihn beschnitten — eine Buchung
   *  über Nacht erscheint dadurch in beiden Tageszellen. */
  day: Date;
  workplaceName: string;
  color: string;
  /** Auflösung einer Arbeitsplatz-Kennung auf ihren Namen. */
  nameOf: (workplaceId: string) => string;
}

/**
 * Die Balken einer Zelle, Blockierungen zuerst — so liegen die eigenen
 * Buchungen darüber.
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
