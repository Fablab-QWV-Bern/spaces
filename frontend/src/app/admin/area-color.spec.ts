import { describe, expect, it } from 'vitest';

import { RANGE, RECOMMENDED, formatOklch, parseOklch } from './area-color';
import { planPalette } from '../map/plan';

describe('RECOMMENDED', () => {
  it('lies on the rails it is marked on', () => {
    expect(RECOMMENDED.l).toBeGreaterThan(RANGE.l.min);
    expect(RECOMMENDED.l).toBeLessThan(RANGE.l.max);
    expect(RECOMMENDED.c).toBeGreaterThan(RANGE.c.min);
    expect(RECOMMENDED.c).toBeLessThan(RANGE.c.max);
  });
});

describe('formatOklch', () => {
  it('writes a value a person can read', () => {
    expect(formatOklch({ l: 0.8, c: 0.1, h: 130 })).toBe('oklch(0.8 0.1 130)');
  });

  it('trims what the browser hands back from a conversion', () => {
    expect(formatOklch({ l: 0.897271, c: 0.161276, h: 94.7835 })).toBe('oklch(0.897 0.161 94.8)');
  });
});

describe('parseOklch', () => {
  it('reads the three channels', () => {
    expect(parseOklch('oklch(0.8 0.1 130)')).toEqual({ l: 0.8, c: 0.1, h: 130 });
  });

  it('takes a percentage and a missing channel as CSS writes them', () => {
    expect(parseOklch('oklch(80% 0.1 none)')).toEqual({ l: 0.8, c: 0.1, h: 0 });
  });

  it('ignores an alpha behind the slash', () => {
    expect(parseOklch('oklch(0.8 0.1 130 / 50%)')).toEqual({ l: 0.8, c: 0.1, h: 130 });
  });

  it('says nothing about a colour in another notation', () => {
    expect(parseOklch('rgb(255,219,73)')).toBeNull();
    expect(parseOklch('rebeccapurple')).toBeNull();
  });
});

describe('planPalette', () => {
  const plan = `
    <svg xmlns="http://www.w3.org/2000/svg">
      <g id="Hindernisse"><path style="fill:rgb(194,193,193)"/></g>
      <g id="Arbeitsplätze">
        <path style="fill:rgb(255,219,73)"/>
        <path style="fill:rgb(255,219,73)"/>
        <path fill="rgb(135,206,244)"/>
        <path style="fill:none"/>
      </g>
    </svg>`;

  it('takes every colour of a bench once, in the order they are drawn', () => {
    expect(planPalette(plan)).toEqual(['rgb(255, 219, 73)', 'rgb(135, 206, 244)']);
  });

  it('leaves out the obstacles — their grey means "not bookable"', () => {
    expect(planPalette(plan)).not.toContain('rgb(194, 193, 193)');
  });

  it('answers with nothing when the plan has no workplace layer', () => {
    expect(planPalette('<svg xmlns="http://www.w3.org/2000/svg"><g id="Andere"/></svg>')).toEqual(
      [],
    );
  });
});
