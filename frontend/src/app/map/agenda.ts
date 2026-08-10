/**
 * The day's remaining occupancy in words: what the map says in colour, as a list
 * beside it.
 *
 * It answers a question the plan cannot: not "is this bench taken" but "what is
 * still coming today". The map has no date and no time axis — whoever wants to
 * know whether it is worth waiting half an hour has nowhere to read it.
 *
 * Grouped by the hour in which something starts, not by the exact minute. On a
 * quarter-hour grid the second would produce a heading per booking, and a list of
 * headings with one line each is a list with extra steps. The exact time stays on
 * the entry.
 *
 * One row per booking, not per occupied workplace: a booking that blocks three
 * neighbours is one event in the workshop, and three lines would read as three.
 * Which workplaces it blocks is what the map shows.
 *
 * Free of Angular and free of the DOM, like the other arithmetic here.
 */

import { Booking } from '../api/models';
import { formatTime } from '../calendar/time-axis';

export interface AgendaEntry {
  id: string;
  workplaceName: string;
  timeRange: string;
  who: string;
}

export interface AgendaGroup {
  /** "Aktuell", or "ab 17 Uhr" for an hour in which something begins. */
  heading: string;
  entries: AgendaEntry[];
}

/**
 * The bookings of the loaded day that have not yet ended, in groups. Anything
 * already over is left out — the column looks forward, the calendar looks back.
 *
 * Empty when nothing is left; the caller says so in words rather than showing an
 * empty list.
 */
export function agendaFor(
  bookings: Booking[],
  nameOf: (workplaceId: string) => string,
  now: Date,
): AgendaGroup[] {
  const instant = now.getTime();
  const running: AgendaEntry[] = [];
  const ahead = new Map<number, AgendaEntry[]>();

  // Sorted once, up front: then every group is in order without being sorted
  // again, and equal start times keep the order the API delivered.
  for (const booking of [...bookings].sort(byStart)) {
    const start = Date.parse(booking.startTime);

    if (Date.parse(booking.endTime) <= instant) {
      continue;
    }

    const entry = toEntry(booking, nameOf);

    if (start <= instant) {
      running.push(entry);

      continue;
    }

    // The hour of the start, read locally — the heading names a time of day, and
    // that is the one on the workshop's wall.
    const hour = new Date(start).getHours();

    ahead.set(hour, [...(ahead.get(hour) ?? []), entry]);
  }

  const groups: AgendaGroup[] = running.length ? [{ heading: 'Aktuell', entries: running }] : [];

  for (const hour of [...ahead.keys()].sort((one, other) => one - other)) {
    groups.push({ heading: `ab ${hour} Uhr`, entries: ahead.get(hour)! });
  }

  return groups;
}

function toEntry(booking: Booking, nameOf: (workplaceId: string) => string): AgendaEntry {
  return {
    id: booking.id,
    workplaceName: nameOf(booking.workplaceId),
    timeRange: `${formatTime(new Date(booking.startTime))}–${formatTime(new Date(booking.endTime))}`,
    who: booking.name,
  };
}

function byStart(one: Booking, other: Booking): number {
  return Date.parse(one.startTime) - Date.parse(other.startTime);
}
