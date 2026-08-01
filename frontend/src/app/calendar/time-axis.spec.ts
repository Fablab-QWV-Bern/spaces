import { describe, expect, it } from 'vitest';

import {
  allowedDurations,
  blockGeometry,
  buildTimeAxis,
  formatDuration,
  gridColumn,
  gridTemplateColumns,
  instantAt,
  lineName,
  minutesOfDay,
  slotAtOffset,
  visibleRange,
} from './time-axis';

const axis = buildTimeAxis('08:00', '21:00');
const day = new Date('2026-08-03T12:00:00');

/** Lokaler Zeitpunkt am dargestellten Tag. */
function at(time: string, date = '2026-08-03'): Date {
  return new Date(`${date}T${time}:00`);
}

describe('buildTimeAxis', () => {
  it('spannt die Oeffnungszeiten auf', () => {
    expect(axis.opensAt).toBe(minutesOfDay('08:00'));
    expect(axis.closesAt).toBe(minutesOfDay('21:00'));
  });

  it('beschriftet jede volle Stunde innerhalb des Fensters', () => {
    expect(axis.hours).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });
});

describe('blockGeometry', () => {
  it('setzt einen Block massstabsgetreu', () => {
    const block = blockGeometry(axis, at('09:00'), at('11:00'), day)!;

    // 13 Stunden Fenster, Start eine Stunde nach Oeffnung, zwei Stunden lang.
    expect(block.leftPercent).toBeCloseTo((60 / 780) * 100);
    expect(block.widthPercent).toBeCloseTo((120 / 780) * 100);
    expect(block.clippedStart).toBe(false);
    expect(block.clippedEnd).toBe(false);
  });

  it('trifft Viertelstunden genau', () => {
    const block = blockGeometry(axis, at('08:15'), at('08:30'), day)!;

    expect(block.leftPercent).toBeCloseTo((15 / 780) * 100);
    expect(block.widthPercent).toBeCloseTo((15 / 780) * 100);
  });

  it('fuellt das ganze Fenster bei einer Buchung von Oeffnung bis Schliessung', () => {
    const block = blockGeometry(axis, at('08:00'), at('21:00'), day)!;

    expect(block.leftPercent).toBe(0);
    expect(block.widthPercent).toBe(100);
  });

  it('beschneidet eine Buchung, die am Vortag begonnen hat', () => {
    const block = blockGeometry(axis, at('20:00', '2026-08-02'), at('09:00'), day)!;

    // Sichtbar ist nur die Stunde von 08:00 bis 09:00 am dargestellten Tag.
    expect(block.leftPercent).toBe(0);
    expect(block.widthPercent).toBeCloseTo((60 / 780) * 100);
    expect(block.clippedStart).toBe(true);
    expect(block.clippedEnd).toBe(false);
  });

  it('beschneidet eine Buchung, die in die Nacht laeuft', () => {
    const block = blockGeometry(axis, at('20:00'), at('09:00', '2026-08-04'), day)!;

    expect(block.widthPercent).toBeCloseTo((60 / 780) * 100);
    expect(block.clippedStart).toBe(false);
    expect(block.clippedEnd).toBe(true);
  });

  it('laesst Buchungen weg, die den Tag gar nicht beruehren', () => {
    expect(
      blockGeometry(axis, at('09:00', '2026-08-05'), at('11:00', '2026-08-05'), day),
    ).toBeNull();
  });

  it('laesst Buchungen ausserhalb der Oeffnungszeiten weg', () => {
    expect(blockGeometry(axis, at('22:00'), at('23:00'), day)).toBeNull();
  });
});

describe('slotAtOffset', () => {
  const width = 780; // ein Pixel je Minute, macht die Erwartungen lesbar

  it('rundet auf die Viertelstunde ab', () => {
    expect(slotAtOffset(axis, 0, width)).toBe(minutesOfDay('08:00'));
    expect(slotAtOffset(axis, 14, width)).toBe(minutesOfDay('08:00'));
    expect(slotAtOffset(axis, 15, width)).toBe(minutesOfDay('08:15'));
    expect(slotAtOffset(axis, 61, width)).toBe(minutesOfDay('09:00'));
  });

  it('bleibt innerhalb der Oeffnungszeiten', () => {
    expect(slotAtOffset(axis, -50, width)).toBe(minutesOfDay('08:00'));
    // Ganz rechts: der letzte Schlitz beginnt eine Viertelstunde vor Schliessung.
    expect(slotAtOffset(axis, width + 50, width)).toBe(minutesOfDay('20:45'));
  });

  it('kommt mit einer Breite von null zurecht', () => {
    expect(slotAtOffset(axis, 10, 0)).toBe(minutesOfDay('08:00'));
  });
});

describe('instantAt', () => {
  it('setzt Minuten auf den dargestellten Tag', () => {
    const instant = instantAt('2026-08-03', minutesOfDay('14:30'));

    expect(instant.getFullYear()).toBe(2026);
    expect(instant.getHours()).toBe(14);
    expect(instant.getMinutes()).toBe(30);
  });
});

describe('allowedDurations', () => {
  it('schneidet die Staffel beim Maximum ab', () => {
    expect(allowedDurations(120)).toEqual([15, 30, 45, 60, 90, 120]);
  });

  it('macht das Maximum immer waehlbar, auch neben der Staffel', () => {
    expect(allowedDurations(100)).toEqual([15, 30, 45, 60, 90, 100]);
  });

  it('geht ueber 24 Stunden in Tagesschritten weiter', () => {
    expect(allowedDurations(4320)).toContain(1440);
    expect(allowedDurations(4320)).toContain(2880);
    expect(allowedDurations(4320)).toContain(4320);
  });
});

describe('formatDuration', () => {
  it('beugt richtig', () => {
    expect(formatDuration(15)).toBe('15 Minuten');
    expect(formatDuration(60)).toBe('1 Stunde');
    expect(formatDuration(90)).toBe('1,5 Stunden');
    expect(formatDuration(480)).toBe('8 Stunden');
    expect(formatDuration(1440)).toBe('1 Tag');
    expect(formatDuration(2880)).toBe('2 Tage');
  });
});

describe('gridTemplateColumns', () => {
  it('legt eine Spalte je Viertelstunde an, mit benannten Linien', () => {
    const template = gridTemplateColumns(axis);

    expect(template.startsWith('[t0800] 1fr [t0815] 1fr')).toBe(true);
    expect(template.endsWith('[t2045] 1fr [t2100]')).toBe(true);
    // 13 Stunden zu vier Viertelstunden.
    expect(template.match(/1fr/g)).toHaveLength(52);
  });
});

describe('lineName', () => {
  it('fuellt Stunden und Minuten auf zwei Stellen', () => {
    expect(lineName(minutesOfDay('08:00'))).toBe('t0800');
    expect(lineName(minutesOfDay('09:15'))).toBe('t0915');
    expect(lineName(minutesOfDay('21:00'))).toBe('t2100');
  });
});

describe('gridColumn', () => {
  it('spannt zwischen den Linien der beiden Kanten', () => {
    const range = visibleRange(axis, at('09:00'), at('13:00'), day)!;

    expect(gridColumn(range)).toBe('t0900 / t1300');
  });

  it('klemmt eine Buchung vom Vortag auf den Fensterrand', () => {
    const range = visibleRange(axis, at('20:00', '2026-08-02'), at('09:00'), day)!;

    expect(gridColumn(range)).toBe('t0800 / t0900');
    expect(range.clippedStart).toBe(true);
  });

  it('klemmt eine Buchung in die Nacht auf den Fensterrand', () => {
    const range = visibleRange(axis, at('20:00'), at('09:00', '2026-08-04'), day)!;

    expect(gridColumn(range)).toBe('t2000 / t2100');
    expect(range.clippedEnd).toBe(true);
  });
});
