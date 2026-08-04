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

/** A local instant on the day being shown. */
function at(time: string, date = '2026-08-03'): Date {
  return new Date(`${date}T${time}:00`);
}

describe('buildTimeAxis', () => {
  it('spans the opening hours', () => {
    expect(axis.opensAt).toBe(minutesOfDay('08:00'));
    expect(axis.closesAt).toBe(minutesOfDay('21:00'));
  });

  it('labels every full hour within the window', () => {
    expect(axis.hours).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });
});

describe('blockGeometry', () => {
  it('places a block to scale', () => {
    const block = blockGeometry(axis, at('09:00'), at('11:00'), day)!;

    // A 13-hour window, starting an hour after opening, two hours long.
    expect(block.leftPercent).toBeCloseTo((60 / 780) * 100);
    expect(block.widthPercent).toBeCloseTo((120 / 780) * 100);
    expect(block.clippedStart).toBe(false);
    expect(block.clippedEnd).toBe(false);
  });

  it('hits quarter hours exactly', () => {
    const block = blockGeometry(axis, at('08:15'), at('08:30'), day)!;

    expect(block.leftPercent).toBeCloseTo((15 / 780) * 100);
    expect(block.widthPercent).toBeCloseTo((15 / 780) * 100);
  });

  it('fills the whole window for a booking from opening to closing', () => {
    const block = blockGeometry(axis, at('08:00'), at('21:00'), day)!;

    expect(block.leftPercent).toBe(0);
    expect(block.widthPercent).toBe(100);
  });

  it('clips a booking that started the day before', () => {
    const block = blockGeometry(axis, at('20:00', '2026-08-02'), at('09:00'), day)!;

    // Only the hour from 08:00 to 09:00 on the day being shown is visible.
    expect(block.leftPercent).toBe(0);
    expect(block.widthPercent).toBeCloseTo((60 / 780) * 100);
    expect(block.clippedStart).toBe(true);
    expect(block.clippedEnd).toBe(false);
  });

  it('clips a booking that runs into the night', () => {
    const block = blockGeometry(axis, at('20:00'), at('09:00', '2026-08-04'), day)!;

    expect(block.widthPercent).toBeCloseTo((60 / 780) * 100);
    expect(block.clippedStart).toBe(false);
    expect(block.clippedEnd).toBe(true);
  });

  it('leaves out bookings that do not touch the day at all', () => {
    expect(
      blockGeometry(axis, at('09:00', '2026-08-05'), at('11:00', '2026-08-05'), day),
    ).toBeNull();
  });

  it('leaves out bookings outside the opening hours', () => {
    expect(blockGeometry(axis, at('22:00'), at('23:00'), day)).toBeNull();
  });
});

describe('slotAtOffset', () => {
  const width = 780; // ein Pixel je Minute, macht die Erwartungen lesbar

  it('rounds down to the quarter hour', () => {
    expect(slotAtOffset(axis, 0, width)).toBe(minutesOfDay('08:00'));
    expect(slotAtOffset(axis, 14, width)).toBe(minutesOfDay('08:00'));
    expect(slotAtOffset(axis, 15, width)).toBe(minutesOfDay('08:15'));
    expect(slotAtOffset(axis, 61, width)).toBe(minutesOfDay('09:00'));
  });

  it('stays within the opening hours', () => {
    expect(slotAtOffset(axis, -50, width)).toBe(minutesOfDay('08:00'));
    // At the far right: the last slot begins a quarter hour before closing.
    expect(slotAtOffset(axis, width + 50, width)).toBe(minutesOfDay('20:45'));
  });

  it('copes with a width of zero', () => {
    expect(slotAtOffset(axis, 10, 0)).toBe(minutesOfDay('08:00'));
  });
});

describe('instantAt', () => {
  it('puts minutes onto the day being shown', () => {
    const instant = instantAt('2026-08-03', minutesOfDay('14:30'));

    expect(instant.getFullYear()).toBe(2026);
    expect(instant.getHours()).toBe(14);
    expect(instant.getMinutes()).toBe(30);
  });
});

describe('allowedDurations', () => {
  it('counts full hours up to the maximum', () => {
    expect(allowedDurations(240)).toEqual([60, 120, 180, 240]);
  });

  it('always makes the maximum selectable, even off the full hour', () => {
    expect(allowedDurations(100)).toEqual([60, 100]);
  });

  it('offers only the maximum below one hour', () => {
    expect(allowedDurations(45)).toEqual([45]);
  });

  it('continues beyond 24 hours in whole-day steps', () => {
    expect(allowedDurations(4320)).toContain(1440);
    expect(allowedDurations(4320)).toContain(2880);
    expect(allowedDurations(4320)).toContain(4320);
  });
});

describe('formatDuration', () => {
  it('inflects correctly', () => {
    expect(formatDuration(15)).toBe('15 Minuten');
    expect(formatDuration(60)).toBe('1 Stunde');
    expect(formatDuration(90)).toBe('1,5 Stunden');
    expect(formatDuration(480)).toBe('8 Stunden');
    expect(formatDuration(1440)).toBe('1 Tag');
    expect(formatDuration(2880)).toBe('2 Tage');
  });
});

describe('gridTemplateColumns', () => {
  it('creates one column per quarter hour, with named lines', () => {
    const template = gridTemplateColumns(axis);

    expect(template.startsWith('[t0800] 1fr [t0815] 1fr')).toBe(true);
    expect(template.endsWith('[t2045] 1fr [t2100]')).toBe(true);
    // 13 hours at four quarter hours each.
    expect(template.match(/1fr/g)).toHaveLength(52);
  });
});

describe('lineName', () => {
  it('pads hours and minutes to two digits', () => {
    expect(lineName(minutesOfDay('08:00'))).toBe('t0800');
    expect(lineName(minutesOfDay('09:15'))).toBe('t0915');
    expect(lineName(minutesOfDay('21:00'))).toBe('t2100');
  });
});

describe('gridColumn', () => {
  it('spans between the lines of both edges', () => {
    const range = visibleRange(axis, at('09:00'), at('13:00'), day)!;

    expect(gridColumn(range)).toBe('t0900 / t1300');
  });

  it('clamps a booking from the previous day to the window edge', () => {
    const range = visibleRange(axis, at('20:00', '2026-08-02'), at('09:00'), day)!;

    expect(gridColumn(range)).toBe('t0800 / t0900');
    expect(range.clippedStart).toBe(true);
  });

  it('clamps a booking running into the night to the window edge', () => {
    const range = visibleRange(axis, at('20:00'), at('09:00', '2026-08-04'), day)!;

    expect(gridColumn(range)).toBe('t2000 / t2100');
    expect(range.clippedEnd).toBe(true);
  });
});
