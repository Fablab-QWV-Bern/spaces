import { describe, expect, it } from 'vitest';

import { standingOn } from './map-geometry';

const figure = { x: 100, y: 200, width: 20, height: 40 };
const workplace = { x: 100, y: 100, width: 100, height: 100 };

describe('standingOn', () => {
  it('centres the figure across the workplace', () => {
    // Workplace middle 150, figure middle 110 — so 40 to the right.
    expect(standingOn(workplace, figure)).toMatch(/^translate\(40 /);
  });

  it('puts the feet on the middle, not the waist', () => {
    // Workplace middle 150, figure sole 240 less the overlap — so 75 up, one
    // half-figure further than centring would move it.
    expect(standingOn(workplace, figure)).toBe('translate(40 -75)');
  });

  it('does not scale the figure to the workplace', () => {
    // A hall and a stool put the figure in different places, never in different
    // sizes — the transform is a translation and nothing else.
    const hall = standingOn({ x: 0, y: 0, width: 1000, height: 800 }, figure);
    const stool = standingOn({ x: 0, y: 0, width: 10, height: 8 }, figure);

    expect(hall).toMatch(/^translate\(-?[\d.]+ -?[\d.]+\)$/);
    expect(stool).toMatch(/^translate\(-?[\d.]+ -?[\d.]+\)$/);
    expect(hall).not.toBe(stool);
  });

  it('keeps the numbers short', () => {
    expect(standingOn({ x: 0, y: 0, width: 1 / 3, height: 1 / 3 }, figure)).toBe(
      'translate(-109.833 -224.833)',
    );
  });
});
