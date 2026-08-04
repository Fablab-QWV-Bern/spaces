/**
 * The geometry of the time axis. Deliberately free of Angular so that it stays
 * testable — it is the core of the calendar rendering.
 *
 * Everything is computed in minutes since the opening of the day being shown.
 * Times outside the opening hours do not occur: they are skipped, which is why an
 * overnight booking sits as a continuous block at the seam.
 */
export interface TimeAxis {
  /** Minutes since midnight, local. */
  opensAt: number;
  closesAt: number;
  /** Labelled columns, one per full hour. */
  hours: number[];
}

export function buildTimeAxis(opensAt: string, closesAt: string): TimeAxis {
  const open = minutesOfDay(opensAt);
  const close = minutesOfDay(closesAt);
  const hours: number[] = [];

  for (let hour = Math.ceil(open / 60); hour * 60 < close; hour++) {
    hours.push(hour);
  }

  return { opensAt: open, closesAt: close, hours };
}

export function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);

  return hours * 60 + minutes;
}

/**
 * A block's time range clipped to the window being shown, in minutes since
 * midnight. The basis for both kinds of rendering: the column grid of the day
 * view and the percentage bars of the compressed views.
 */
export interface VisibleRange {
  startMinutes: number;
  endMinutes: number;
  /** The block begins before the window being shown. */
  clippedStart: boolean;
  clippedEnd: boolean;
}

export function visibleRange(
  axis: TimeAxis,
  startsAt: Date,
  endsAt: Date,
  day: Date,
): VisibleRange | null {
  const start = minutesSinceMidnight(startsAt, day);
  const end = minutesSinceMidnight(endsAt, day);

  const startMinutes = Math.max(start, axis.opensAt);
  const endMinutes = Math.min(end, axis.closesAt);

  if (endMinutes <= startMinutes) {
    return null;
  }

  return {
    startMinutes,
    endMinutes,
    clippedStart: start < axis.opensAt,
    clippedEnd: end > axis.closesAt,
  };
}

/**
 * An instant's position on the axis, as a percentage of the total width. Null if
 * it lies outside the opening hours and is therefore not rendered.
 */
export function percentOfAxis(axis: TimeAxis, minutesSinceMidnight: number): number | null {
  if (minutesSinceMidnight < axis.opensAt || minutesSinceMidnight > axis.closesAt) {
    return null;
  }

  return ((minutesSinceMidnight - axis.opensAt) / (axis.closesAt - axis.opensAt)) * 100;
}

/** A block's position on the axis, as a percentage of the total width. */
export interface BlockGeometry {
  leftPercent: number;
  widthPercent: number;
  /** The block begins before the window being shown. */
  clippedStart: boolean;
  clippedEnd: boolean;
}

export function blockGeometry(
  axis: TimeAxis,
  startsAt: Date,
  endsAt: Date,
  day: Date,
): BlockGeometry | null {
  const range = visibleRange(axis, startsAt, endsAt, day);

  if (!range) {
    return null;
  }

  const span = axis.closesAt - axis.opensAt;

  return {
    leftPercent: ((range.startMinutes - axis.opensAt) / span) * 100,
    widthPercent: ((range.endMinutes - range.startMinutes) / span) * 100,
    clippedStart: range.clippedStart,
    clippedEnd: range.clippedEnd,
  };
}

/**
 * The name of a grid line at a given time, e.g. "t0915".
 *
 * Named lines make the placement readable in the stylesheet and in the dev tools:
 * `grid-column: t0900 / t1300` rather than two percentages.
 */
export function lineName(minutesSinceMidnight: number): string {
  const hours = Math.floor(minutesSinceMidnight / 60);
  const minutes = minutesSinceMidnight % 60;

  return `t${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}`;
}

/**
 * The column grid of the day view: one column per quarter hour, with named lines
 * in between. Has to be built at runtime because the opening hours are
 * configurable.
 */
export function gridTemplateColumns(axis: TimeAxis): string {
  const parts: string[] = [];

  for (let minutes = axis.opensAt; minutes < axis.closesAt; minutes += GRID_MINUTES) {
    parts.push(`[${lineName(minutes)}] 1fr`);
  }

  parts.push(`[${lineName(axis.closesAt)}]`);

  return parts.join(' ');
}

/**
 * A block's placement in the column grid. Because both edges have to sit on the
 * 15-minute grid, the snapping here is structural rather than computed — a
 * booking cannot land off the grid at all.
 */
export function gridColumn(range: VisibleRange): string {
  return `${lineName(range.startMinutes)} / ${lineName(range.endMinutes)}`;
}

/**
 * Minutes since midnight of the day being shown. If the instant falls on an
 * earlier or later day, this yields values outside [0, 1440) — which is exactly
 * how an overnight booking gets clipped correctly.
 */
function minutesSinceMidnight(instant: Date, day: Date): number {
  const midnight = new Date(day);
  midnight.setHours(0, 0, 0, 0);

  return (instant.getTime() - midnight.getTime()) / 60_000;
}

export function formatTime(instant: Date): string {
  return instant.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
}

export const GRID_MINUTES = 15;

/**
 * The time slot under a click, rounded down to the 15-minute grid. Returns
 * minutes since midnight.
 *
 * The last slot begins a quarter of an hour before closing — a click at the far
 * right should not land on the closing time itself, where nothing could be booked
 * any more.
 */
export function slotAtOffset(axis: TimeAxis, offsetX: number, trackWidth: number): number {
  if (trackWidth <= 0) {
    return axis.opensAt;
  }

  const span = axis.closesAt - axis.opensAt;
  const ratio = Math.min(Math.max(offsetX / trackWidth, 0), 1);
  const minutes = axis.opensAt + ratio * span;
  const snapped = Math.floor(minutes / GRID_MINUTES) * GRID_MINUTES;

  return Math.min(Math.max(snapped, axis.opensAt), axis.closesAt - GRID_MINUTES);
}

/** Combines the day being shown with minutes since midnight. */
export function instantAt(day: string, minutesSinceMidnight: number): Date {
  const instant = new Date(`${day}T00:00:00`);
  instant.setMinutes(instant.getMinutes() + minutesSinceMidnight);

  return instant;
}

/**
 * "2026-07-31T14:00" — local wall-clock time, deliberately without a zone.
 *
 * This is how the calendar hands a start time to the booking form: the form works
 * in display time, and conversion only happens on save.
 */
export function toLocalIso(instant: Date): string {
  const offset = instant.getTimezoneOffset() * 60_000;

  return new Date(instant.getTime() - offset).toISOString().slice(0, 16);
}

/**
 * Default duration of a new booking, provided the workplace permits it.
 *
 * Lives here rather than in the form because the preview in the calendar needs it
 * too: what sits under the pointer there has to be the same thing the click
 * creates.
 */
export const DEFAULT_DURATION_MINUTES = 120;

/**
 * Permitted durations up to the maximum: full hours, and beyond 24 hours in
 * whole-day steps. The maximum itself is always selectable — even when it does
 * not fall on a full hour.
 */
export function allowedDurations(maxMinutes: number): number[] {
  const durations: number[] = [];

  for (let minutes = 60; minutes <= Math.min(maxMinutes, 1440); minutes += 60) {
    durations.push(minutes);
  }

  for (let minutes = 2880; minutes <= maxMinutes; minutes += 1440) {
    durations.push(minutes);
  }

  if (durations.at(-1) !== maxMinutes && maxMinutes >= GRID_MINUTES) {
    durations.push(maxMinutes);
  }

  return durations;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} Minuten`;
  }

  if (minutes % 1440 === 0) {
    const days = minutes / 1440;

    return days === 1 ? '1 Tag' : `${days} Tage`;
  }

  if (minutes === 60) {
    return '1 Stunde';
  }

  const hours = minutes / 60;

  return `${Number.isInteger(hours) ? hours : hours.toFixed(1).replace('.', ',')} Stunden`;
}

/** All grid start times within the opening hours. */
export function slotsOfDay(axis: TimeAxis): number[] {
  const slots: number[] = [];

  for (let minutes = axis.opensAt; minutes < axis.closesAt; minutes += GRID_MINUTES) {
    slots.push(minutes);
  }

  return slots;
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}
