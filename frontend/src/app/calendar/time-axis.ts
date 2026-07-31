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
  const span = axis.closesAt - axis.opensAt;
  const start = minutesSinceMidnight(startsAt, day);
  const end = minutesSinceMidnight(endsAt, day);

  const visibleStart = Math.max(start, axis.opensAt);
  const visibleEnd = Math.min(end, axis.closesAt);

  if (visibleEnd <= visibleStart) {
    return null;
  }

  return {
    leftPercent: ((visibleStart - axis.opensAt) / span) * 100,
    widthPercent: ((visibleEnd - visibleStart) / span) * 100,
    clippedStart: start < axis.opensAt,
    clippedEnd: end > axis.closesAt,
  };
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
