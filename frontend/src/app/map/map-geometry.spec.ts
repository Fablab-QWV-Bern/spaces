import { describe, expect, it } from 'vitest';

import { Box, figureViewBox, parseViewBox, placeCentered } from './map-geometry';

const viewBox: Box = { x: 0, y: 0, width: 1000, height: 2000 };
const figure: Box = { x: 800, y: 800, width: 20, height: 40 };

describe('parseViewBox', () => {
  it('reads the four values', () => {
    expect(parseViewBox('0 0 1184 2082')).toEqual({ x: 0, y: 0, width: 1184, height: 2082 });
  });

  it('accepts commas and an offset origin', () => {
    expect(parseViewBox('-10, 5, 100, 200')).toEqual({ x: -10, y: 5, width: 100, height: 200 });
  });

  it('rejects unreadable input', () => {
    expect(parseViewBox(null)).toBeNull();
    expect(parseViewBox('0 0 1184')).toBeNull();
    expect(parseViewBox('0 0 breit hoch')).toBeNull();
    // An area with no extent could not be converted into percentages.
    expect(parseViewBox('0 0 0 100')).toBeNull();
  });
});

describe('placeCentered', () => {
  it('places the figure at the centre of the workplace', () => {
    const target: Box = { x: 100, y: 400, width: 200, height: 100 };
    const placement = placeCentered(viewBox, target, figure);

    // Centre at (200, 450), minus half the figure (10, 20).
    expect(placement.leftPercent).toBeCloseTo(19);
    expect(placement.topPercent).toBeCloseTo(21.5);
  });

  it('keeps the figure at its natural size, regardless of the workplace', () => {
    const schmal = placeCentered(viewBox, { x: 0, y: 0, width: 10, height: 10 }, figure);
    const breit = placeCentered(viewBox, { x: 0, y: 0, width: 600, height: 10 }, figure);

    expect(schmal.widthPercent).toBeCloseTo(2);
    expect(schmal.heightPercent).toBeCloseTo(2);
    expect(breit.widthPercent).toBe(schmal.widthPercent);
    expect(breit.heightPercent).toBe(schmal.heightPercent);
  });

  it('factors out an offset origin', () => {
    const versetzt: Box = { x: 100, y: 200, width: 1000, height: 2000 };
    const target: Box = { x: 100, y: 200, width: 20, height: 40 };

    expect(placeCentered(versetzt, target, figure).leftPercent).toBeCloseTo(0);
    expect(placeCentered(versetzt, target, figure).topPercent).toBeCloseTo(0);
  });
});

describe('figureViewBox', () => {
  it('returns the figure box as an excerpt', () => {
    expect(figureViewBox(figure)).toBe('800 800 20 40');
  });
});
