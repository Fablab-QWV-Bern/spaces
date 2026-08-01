/**
 * Die Geometrie der Zeitachse. Bewusst frei von Angular, damit sie testbar
 * bleibt — sie ist der Kern der Kalenderdarstellung.
 *
 * Alles rechnet in Minuten seit Öffnung des dargestellten Tages. Zeiten
 * ausserhalb der Öffnungszeiten kommen nicht vor: sie werden übersprungen, eine
 * Buchung über Nacht liegt deshalb als durchgehender Block an der Nahtstelle.
 */
export interface TimeAxis {
  /** Minuten seit Mitternacht, lokal. */
  opensAt: number;
  closesAt: number;
  /** Beschriftete Spalten, jeweils zur vollen Stunde. */
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
 * Der auf das dargestellte Fenster beschnittene Zeitraum eines Blocks, in
 * Minuten seit Mitternacht. Grundlage für beide Darstellungsarten: das
 * Spaltenraster der Tagesansicht und die prozentualen Balken der komprimierten
 * Ansichten.
 */
export interface VisibleRange {
  startMinutes: number;
  endMinutes: number;
  /** Der Block beginnt vor dem dargestellten Fenster. */
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
 * Die Lage eines Zeitpunkts auf der Achse, in Prozent der Gesamtbreite. Null,
 * wenn er ausserhalb der Öffnungszeiten liegt und darum nicht dargestellt wird.
 */
export function percentOfAxis(axis: TimeAxis, minutesSinceMidnight: number): number | null {
  if (minutesSinceMidnight < axis.opensAt || minutesSinceMidnight > axis.closesAt) {
    return null;
  }

  return ((minutesSinceMidnight - axis.opensAt) / (axis.closesAt - axis.opensAt)) * 100;
}

/** Die Position eines Blocks auf der Achse, in Prozent der Gesamtbreite. */
export interface BlockGeometry {
  leftPercent: number;
  widthPercent: number;
  /** Der Block beginnt vor dem dargestellten Fenster. */
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
 * Der Name einer Rasterlinie zu einem Zeitpunkt, z.B. "t0915".
 *
 * Benannte Linien machen die Platzierung im Stylesheet und in den Dev-Tools
 * lesbar: `grid-column: t0900 / t1300` statt zweier Prozentwerte.
 */
export function lineName(minutesSinceMidnight: number): string {
  const hours = Math.floor(minutesSinceMidnight / 60);
  const minutes = minutesSinceMidnight % 60;

  return `t${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}`;
}

/**
 * Das Spaltenraster der Tagesansicht: eine Spalte je Viertelstunde, dazwischen
 * benannte Linien. Muss zur Laufzeit entstehen, weil die Öffnungszeiten
 * konfigurierbar sind.
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
 * Die Platzierung eines Blocks im Spaltenraster. Weil beide Kanten auf dem
 * 15-Minuten-Raster liegen müssen, ist das Einrasten hier strukturell statt
 * gerechnet — eine Buchung kann gar nicht daneben landen.
 */
export function gridColumn(range: VisibleRange): string {
  return `${lineName(range.startMinutes)} / ${lineName(range.endMinutes)}`;
}

/**
 * Minuten seit Mitternacht des dargestellten Tages. Liegt der Zeitpunkt an einem
 * früheren oder späteren Tag, ergibt das Werte ausserhalb von [0, 1440) — genau
 * so wird eine Buchung über Nacht korrekt beschnitten.
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
 * Der Zeitschlitz unter einem Klick, abgerundet auf das 15-Minuten-Raster.
 * Liefert Minuten seit Mitternacht.
 *
 * Der letzte Schlitz beginnt eine Viertelstunde vor Schliessung — ein Klick ganz
 * rechts soll nicht auf der Schliesszeit selbst landen, dort liesse sich nichts
 * mehr buchen.
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

/** Kombiniert den dargestellten Tag mit Minuten seit Mitternacht. */
export function instantAt(day: string, minutesSinceMidnight: number): Date {
  const instant = new Date(`${day}T00:00:00`);
  instant.setMinutes(instant.getMinutes() + minutesSinceMidnight);

  return instant;
}

/** Die Staffelung aus der Spec, in Minuten. */
const DURATION_LADDER = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720, 1440];

/**
 * Standarddauer einer neuen Buchung, sofern sie am Arbeitsplatz erlaubt ist.
 *
 * Steht hier und nicht im Formular, weil auch die Vorschau im Kalender sie
 * braucht: was dort unter dem Zeiger liegt, muss dasselbe sein, was der Klick
 * anlegt.
 */
export const DEFAULT_DURATION_MINUTES = 120;

/**
 * Erlaubte Dauern bis zum Maximum. Über 24 Stunden geht es in Tagesschritten
 * weiter, und das Maximum selbst ist immer wählbar — auch wenn es nicht auf der
 * Staffel liegt.
 */
export function allowedDurations(maxMinutes: number): number[] {
  const durations = DURATION_LADDER.filter((minutes) => minutes <= maxMinutes);

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

/** Alle Startzeitpunkte des Rasters innerhalb der Öffnungszeiten. */
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
