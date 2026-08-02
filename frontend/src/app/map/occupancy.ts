/**
 * Wer sitzt gerade wo — die Frage, die die Übersichtskarte beantwortet.
 *
 * Belegt ist ein Arbeitsplatz, wenn eine Buchung auf ihm den Augenblick
 * überdeckt, oder wenn ihn eine Buchung auf einem *anderen* Platz zu diesem
 * Zeitpunkt mitblockiert. Beides zugleich kann nicht auftreten — genau das
 * verhindern die Kollisionsregeln im Backend. Käme es trotzdem vor, gewinnt die
 * eigene Buchung: sie ist die Aussage über diesen Platz, die Blockierung nur
 * ein Schatten.
 *
 * Der Inhalt der Detailkarte entsteht hier und nicht in der Ansicht, damit die
 * Karte auf der Übersicht dieselbe ist wie im Kalender — sie bekommt dieselbe
 * `CardDetails`.
 */

import { Booking } from '../api/models';
import { CardDetails } from '../calendar/blocks';
import { formatTime } from '../calendar/time-axis';

/** Was die Belegung über ihre Umgebung wissen muss. */
export interface OccupancyContext {
  /** Buchungen je Arbeitsplatz — die eigenen. */
  bookings: Map<string, Booking[]>;
  /** Buchungen auf anderen Plätzen, die diesen hier mitbelegen. */
  blockages: Map<string, Booking[]>;
  /** Auflösung einer Arbeitsplatz-Kennung auf ihren Namen. */
  nameOf: (workplaceId: string) => string;
}

/**
 * Die Detailkarten der belegten Arbeitsplätze, nach Arbeitsplatz-Kennung.
 * Freie Plätze fehlen in der Map — auf der Karte steht dort niemand.
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
 * Die erste Buchung, die den Augenblick überdeckt. Das Ende zählt nicht mehr
 * dazu: um Punkt zwölf ist der Platz frei, nicht doppelt belegt.
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
