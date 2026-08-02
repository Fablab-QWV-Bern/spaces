import { describe, expect, it } from 'vitest';

import { Box, figureViewBox, parseViewBox, placeCentered } from './map-geometry';

const viewBox: Box = { x: 0, y: 0, width: 1000, height: 2000 };
const figure: Box = { x: 800, y: 800, width: 20, height: 40 };

describe('parseViewBox', () => {
  it('liest die vier Werte', () => {
    expect(parseViewBox('0 0 1184 2082')).toEqual({ x: 0, y: 0, width: 1184, height: 2082 });
  });

  it('nimmt Kommas und einen versetzten Ursprung', () => {
    expect(parseViewBox('-10, 5, 100, 200')).toEqual({ x: -10, y: 5, width: 100, height: 200 });
  });

  it('weist Unlesbares zurück', () => {
    expect(parseViewBox(null)).toBeNull();
    expect(parseViewBox('0 0 1184')).toBeNull();
    expect(parseViewBox('0 0 breit hoch')).toBeNull();
    // Eine Fläche ohne Ausdehnung liesse sich nicht in Prozent umrechnen.
    expect(parseViewBox('0 0 0 100')).toBeNull();
  });
});

describe('placeCentered', () => {
  it('setzt die Figur auf die Mitte des Arbeitsplatzes', () => {
    const target: Box = { x: 100, y: 400, width: 200, height: 100 };
    const placement = placeCentered(viewBox, target, figure);

    // Mitte bei (200, 450), abzüglich der halben Figur (10, 20).
    expect(placement.leftPercent).toBeCloseTo(19);
    expect(placement.topPercent).toBeCloseTo(21.5);
  });

  it('behält die natürliche Grösse der Figur, unabhängig vom Arbeitsplatz', () => {
    const schmal = placeCentered(viewBox, { x: 0, y: 0, width: 10, height: 10 }, figure);
    const breit = placeCentered(viewBox, { x: 0, y: 0, width: 600, height: 10 }, figure);

    expect(schmal.widthPercent).toBeCloseTo(2);
    expect(schmal.heightPercent).toBeCloseTo(2);
    expect(breit.widthPercent).toBe(schmal.widthPercent);
    expect(breit.heightPercent).toBe(schmal.heightPercent);
  });

  it('rechnet einen versetzten Ursprung heraus', () => {
    const versetzt: Box = { x: 100, y: 200, width: 1000, height: 2000 };
    const target: Box = { x: 100, y: 200, width: 20, height: 40 };

    expect(placeCentered(versetzt, target, figure).leftPercent).toBeCloseTo(0);
    expect(placeCentered(versetzt, target, figure).topPercent).toBeCloseTo(0);
  });
});

describe('figureViewBox', () => {
  it('gibt den Kasten der Figur als Ausschnitt', () => {
    expect(figureViewBox(figure)).toBe('800 800 20 40');
  });
});
