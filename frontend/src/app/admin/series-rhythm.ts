/**
 * Der Rhythmus einer Serie als Satz — und als die Handvoll Auswahlmöglichkeiten,
 * die das Formular anbietet.
 *
 * `interval` und `intervalCount` sind die Form der Datenbank, nicht der Gedanke
 * dessen, der eine Serie anlegt. Der denkt „alle zwei Wochen" und nicht
 * „WEEKLY mit intervalCount 2". Hier wird zwischen beidem übersetzt, an einer
 * Stelle für Liste und Formular.
 *
 * Die API lässt jede Intervall-Anzahl zu; angeboten werden nur diese drei. Wer
 * einen anderen Takt braucht, ist ein Fall für eine Erweiterung und nicht für
 * ein Zahlenfeld, das sonst immer auf 1 steht.
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

  // Eine über die API angelegte Serie darf einen Takt haben, den das Formular
  // nicht anbietet. Sie landet auf dem nächstliegenden, statt die Ansicht zu
  // sprengen — beim Speichern wird sie damit begradigt.
  return match?.key ?? (series.interval === 'MONTHLY' ? 'monthly' : 'weekly');
}

export function rhythmByKey(key: RhythmKey): Rhythm {
  return RHYTHMS.find((rhythm) => rhythm.key === key) ?? RHYTHMS[0];
}

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

/**
 * „jeden Montag, 09:00–11:00" — der Takt zusammen mit dem Tag, der aus dem Datum
 * der ersten Instanz folgt. Ein eigenes Wochentagsfeld gäbe es nicht: es wäre
 * eine zweite Stelle, an der dasselbe steht.
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
 * Monate ohne diesen Tag fallen aus — das sieht man dem Formular sonst nicht an.
 * Der 29. gehört dazu: im Februar gibt es ihn nur alle vier Jahre.
 */
export function skipsMonths(dayOfMonth: number): boolean {
  return dayOfMonth > 28;
}

/** "2026-08-03T09:00" — als lokales Datum gelesen, nicht als UTC. */
export function wallClockDate(value: string): Date {
  return new Date(value.length === 16 ? `${value}:00` : value);
}

function timeOf(value: string): string {
  return value.slice(11, 16);
}
