import { Area, Config } from '../api/models';
import { IsoDate, isoDate, todayIso } from './calendar-store';

/**
 * Der Vorlauf, der für diesen Bereich gilt — sein eigener Wert vor dem globalen.
 * Null, wenn die Rolle ohne Zeitbeschränkung bucht.
 *
 * Durchgesetzt wird der Vorlauf im Backend. Hier steht er trotzdem, weil die
 * Oberfläche ihn schon *vor* der Prüfung braucht: die Datumsliste im Formular
 * reicht so weit, und im Kalender endet dort das Angebot, per Klick zu buchen.
 * Wer den Rand doch erreicht, bekommt den Verstoss aus
 * `POST /bookings/validate` — nachgebaut wird die Regel also nicht, nur
 * vorweggenommen.
 */
export function leadDays(
  config: Config,
  area: Area | null,
  noTimeRestrictions: boolean,
): number | null {
  return noTimeRestrictions
    ? null
    : (area?.maxBookingEndOffsetDays ?? config.maxBookingEndOffsetDays);
}

/** Der letzte Tag, an dem eine Buchung enden darf, oder null ohne Grenze. */
export function lastBookableDay(
  config: Config,
  area: Area | null,
  noTimeRestrictions: boolean,
): IsoDate | null {
  const days = leadDays(config, area, noTimeRestrictions);

  return days === null ? null : shiftDays(todayIso(), days);
}

/**
 * Warum dieser Tag noch nicht zu buchen ist — oder null, solange er innerhalb
 * des Vorlaufs liegt.
 *
 * Genannt wird beides: die Regel und wann sie diesen Tag freigibt. Nur die
 * Regel liesse den Leser rechnen, nur das Datum liesse offen, warum.
 */
export function leadTimeNotice(
  config: Config,
  area: Area,
  noTimeRestrictions: boolean,
  day: IsoDate,
): string | null {
  const days = leadDays(config, area, noTimeRestrictions);

  if (days === null || day <= shiftDays(todayIso(), days)) {
    return null;
  }

  const unit = days === 1 ? 'Tag' : 'Tage';

  return `${days} ${unit} im Voraus buchbar (ab dem ${formatDate(shiftDays(day, -days))})`;
}

/** "11. August" — mit Jahr, sobald es nicht das laufende ist. */
export function formatDate(day: IsoDate | Date): string {
  return asDate(day).toLocaleDateString('de-CH', options(day));
}

/** "Di., 11. August" — dasselbe mit vorangestelltem Wochentag. */
export function formatDay(day: IsoDate | Date): string {
  return asDate(day).toLocaleDateString('de-CH', { weekday: 'short', ...options(day) });
}

/**
 * Ein Datum ohne Jahr liest sich leichter und meint fast immer eindeutig den
 * nächsten solchen Tag; jenseits des Jahreswechsels tut es das nicht mehr.
 */
function options(day: IsoDate | Date): Intl.DateTimeFormatOptions {
  const thisYear = asDate(day).getFullYear() === new Date().getFullYear();

  return { day: 'numeric', month: 'long', ...(thisYear ? {} : { year: 'numeric' }) };
}

function asDate(day: IsoDate | Date): Date {
  return day instanceof Date ? day : new Date(`${day}T12:00:00`);
}

/**
 * Der Tag, der so viele Tage nach dem gegebenen liegt.
 *
 * Über Mittag gerechnet: an einem Tag mit Zeitumstellung wäre der Schritt über
 * Mitternacht 23 oder 25 Stunden lang und träfe den Nachbartag.
 */
function shiftDays(day: IsoDate, offset: number): IsoDate {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + offset);

  return isoDate(date);
}
