import { Area, Config } from '../api/models';
import { IsoDate, isoDate, todayIso } from './calendar-store';

/**
 * The booking horizon that applies to this area — its own value before the
 * global one. Null when the role books without time restrictions.
 *
 * The horizon is enforced in the backend. It still appears here because the
 * interface needs it *before* the check: the date list in the form reaches this
 * far, and in the calendar this is where the offer to book by click ends. Anyone
 * who does reach the edge gets the violation from `POST /bookings/validate` — so
 * the rule is not reimplemented, only anticipated.
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

/** The last day on which a booking may end, or null when there is no limit. */
export function lastBookableDay(
  config: Config,
  area: Area | null,
  noTimeRestrictions: boolean,
): IsoDate | null {
  const days = leadDays(config, area, noTimeRestrictions);

  return days === null ? null : shiftDays(todayIso(), days);
}

/**
 * Why this day cannot be booked yet — or null while it lies within the horizon.
 *
 * Both are stated: the rule and when it releases this day. The rule alone would
 * leave the reader to do the arithmetic; the date alone would leave the reason
 * open.
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

/** "11. August" — with the year as soon as it is not the current one. */
export function formatDate(day: IsoDate | Date): string {
  return asDate(day).toLocaleDateString('de-CH', options(day));
}

/** "Di., 11. August" — the same with the weekday prefixed. */
export function formatDay(day: IsoDate | Date): string {
  return asDate(day).toLocaleDateString('de-CH', { weekday: 'short', ...options(day) });
}

/**
 * A date without a year reads more easily and almost always unambiguously means
 * the next such day; beyond the turn of the year it no longer does.
 */
function options(day: IsoDate | Date): Intl.DateTimeFormatOptions {
  const thisYear = asDate(day).getFullYear() === new Date().getFullYear();

  return { day: 'numeric', month: 'long', ...(thisYear ? {} : { year: 'numeric' }) };
}

function asDate(day: IsoDate | Date): Date {
  return day instanceof Date ? day : new Date(`${day}T12:00:00`);
}

/**
 * The day that lies the given number of days after this one.
 *
 * Computed via midday: on a day with a DST change the step across midnight would
 * be 23 or 25 hours long and would land on the neighbouring day.
 */
function shiftDays(day: IsoDate, offset: number): IsoDate {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + offset);

  return isoDate(date);
}
