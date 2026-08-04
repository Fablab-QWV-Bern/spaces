/**
 * A series' rhythm as a sentence — and as the handful of options the form offers.
 *
 * `interval` and `intervalCount` are the database's shape, not the thought of
 * whoever creates a series. They think "alle zwei Wochen" and not "WEEKLY with
 * intervalCount 2". The translation between the two happens here, in one place
 * for both list and form.
 *
 * The API permits any interval count; only these three are offered. Anyone who
 * needs a different rhythm is a case for an extension, not for a number field
 * that otherwise always reads 1.
 */

import { BookingSeries } from '../api/models';

export type RhythmKey = 'weekly' | 'biweekly' | 'monthly';

interface Rhythm {
  key: RhythmKey;
  label: string;
  interval: BookingSeries['interval'];
  intervalCount: number;
}

export const RHYTHMS: readonly Rhythm[] = [
  { key: 'weekly', label: 'jede Woche', interval: 'WEEKLY', intervalCount: 1 },
  { key: 'biweekly', label: 'alle zwei Wochen', interval: 'WEEKLY', intervalCount: 2 },
  { key: 'monthly', label: 'jeden Monat', interval: 'MONTHLY', intervalCount: 1 },
];

export function rhythmOf(series: {
  interval: BookingSeries['interval'];
  intervalCount: number;
}): RhythmKey {
  const match = RHYTHMS.find(
    (rhythm) =>
      rhythm.interval === series.interval && rhythm.intervalCount === series.intervalCount,
  );

  // A series created through the API may have a rhythm the form does not offer.
  // It lands on the nearest one rather than breaking the view — and gets
  // straightened out on save.
  return match?.key ?? (series.interval === 'MONTHLY' ? 'monthly' : 'weekly');
}

export function rhythmByKey(key: RhythmKey): Rhythm {
  return RHYTHMS.find((rhythm) => rhythm.key === key) ?? RHYTHMS[0];
}

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

/**
 * "jeden Montag, 09:00–11:00" — the rhythm together with the day that follows
 * from the first instance's date. There is no weekday field of its own: it would
 * be a second place saying the same thing.
 */
export function describeRhythm(series: BookingSeries): string {
  const start = wallClockDate(series.firstInstanceStart);
  const time = `${timeOf(series.firstInstanceStart)}–${timeOf(series.firstInstanceEnd)}`;

  switch (rhythmOf(series)) {
    case 'weekly':
      return `jeden ${WEEKDAYS[start.getDay()]}, ${time}`;
    case 'biweekly':
      return `jeden zweiten ${WEEKDAYS[start.getDay()]}, ${time}`;
    case 'monthly':
      return `am ${start.getDate()}. jedes Monats, ${time}`;
  }
}

/**
 * Months without that day drop out — the form does not otherwise show this. The
 * 29th counts: in February it only exists every four years.
 */
export function skipsMonths(dayOfMonth: number): boolean {
  return dayOfMonth > 28;
}

/** "2026-08-03T09:00" — read as a local date, not as UTC. */
export function wallClockDate(value: string): Date {
  return new Date(value.length === 16 ? `${value}:00` : value);
}

function timeOf(value: string): string {
  return value.slice(11, 16);
}
