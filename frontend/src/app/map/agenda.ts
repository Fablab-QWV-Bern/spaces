/**
 * The day's remaining occupancy in words: what the map says in colour, as a list
 * beside it.
 *
 * It answers a question the plan cannot: not "is this bench taken" but "what is
 * still coming today". The map has no date and no time axis — whoever wants to
 * know whether it is worth waiting half an hour has nowhere to read it.
 *
 * Grouped by the part of the day in which something starts, not by the hour and
 * certainly not by the exact minute. Both finer groupings produce a heading per
 * booking on a thinly booked day, and a list of headings with one line each is a
 * list with extra steps. Three groups also match how the day is talked about in
 * the workshop — one comes by in the afternoon, not at half past two. The exact
 * time stays on the entry.
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
  /** "Aktuell", or the part of the day in which something begins. */
  heading: string;
  entries: AgendaEntry[];
}

/**
 * The parts of the day, in order, each with the hour it begins at.
 *
 * The cuts sit at noon and at five: the opening hours run from 08:00 to 21:00,
 * and five is when the workshop fills up with whoever has finished work. A day
 * split into three parts of four, five and four hours is a day one recognises —
 * an even division would put the evening at half past two.
 */
const PARTS = [
  { from: 0, heading: 'Vormittag' },
  { from: 12, heading: 'Nachmittag' },
  { from: 17, heading: 'Abend' },
] as const;

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
  const ahead = new Map<string, AgendaEntry[]>();

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
    const heading = partOfDay(new Date(start).getHours());

    ahead.set(heading, [...(ahead.get(heading) ?? []), entry]);
  }

  const groups: AgendaGroup[] = running.length ? [{ heading: 'Aktuell', entries: running }] : [];

  // Walked in the order of the day rather than in the order the map filled up, so
  // that no sorting is needed — and a part with nothing in it opens no heading.
  for (const part of PARTS) {
    const entries = ahead.get(part.heading);

    if (entries) {
      groups.push({ heading: part.heading, entries });
    }
  }

  return groups;
}

/** The last part of the day that has already begun at this hour. */
function partOfDay(hour: number): string {
  return PARTS.reduce((current, part) => (hour >= part.from ? part : current)).heading;
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
