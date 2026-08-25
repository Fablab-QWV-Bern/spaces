/**
 * The colour of an area, in the three channels the sliders in the area form set.
 *
 * Everything here works on strings, because that is what the field stores: the
 * spec allows any CSS colour, and the seeded areas make use of it — those with a
 * bench on the floor plan carry the `rgb(…)` the plan draws them in. So the
 * sliders have to be able to show a colour they did not produce.
 */
export interface Oklch {
  /** Lightness, 0 to 1. */
  l: number;
  /** Chroma, 0 upwards; beyond what the screen can show it is clamped on paint. */
  c: number;
  /** Hue in degrees. */
  h: number;
}

/**
 * What a new area starts with, and what the mark on the two lower rails shows.
 *
 * Not a limit but a recommendation: an area may be paler or darker, and the two
 * lasers on the plan show why one might want that. But the calendar's bars carry
 * dark text, and they stay legible as long as the lightness stays up here.
 *
 * The sliders used to snap to these values as well. That is gone: a detent has to
 * hold against a dragging pointer and let go of a pressed arrow key, and the two
 * cannot be had from the same `input` event without fighting the drag. A slider
 * that twitches is worse than one that goes where it is pushed. The mark stays —
 * it says where the value belongs, which was the useful half of it.
 */
export const RECOMMENDED: Pick<Oklch, 'l' | 'c'> = { l: 0.8, c: 0.1 };

/**
 * What the sliders can reach, and in what steps.
 *
 * The chroma reaches 0.33 so that the whole of sRGB is reachable: the screen's
 * own primaries need more than a first guess suggests — red 0.258, yellow 0.211,
 * green 0.295, blue 0.313, magenta 0.323 — and a lower ceiling would put a strong
 * red or blue out of reach of an area. It was 0.2 for a while on the assumption
 * that nothing changes above it. That is measurably wrong: `oklch(L 0.2 H)` and
 * `oklch(L 0.32 H)` paint different pixels at every hue.
 *
 * What the last stretch of that rail costs is that the colour changes ever more
 * slowly, because most hues have left the gamut by then and the browser holds
 * them at its edge. Every oklch picker has that; the alternative would be to
 * compute the gamut boundary per hue and lightness, which is the colour space
 * arithmetic this form deliberately leaves to the browser.
 */
export const RANGE = {
  l: { min: 0.4, max: 1, step: 0.01 },
  c: { min: 0, max: 0.33, step: 0.005 },
  h: { min: 0, max: 360, step: 1 },
} as const;

/** `oklch(0.8 0.1 130)` — trimmed, because the value is read by people too. */
export function formatOklch({ l, c, h }: Oklch): string {
  return `oklch(${trim(l, 3)} ${trim(c, 3)} ${trim(h, 1)})`;
}

/**
 * The colour as oklch, or null when the browser does not understand it.
 *
 * The conversion is the browser's: `color-mix` in oklch with the colour on both
 * sides changes nothing about it but forces the result into that space, and the
 * computed value comes back as `oklch(…)`. So a hex value, a colour name and the
 * plan's `rgb(…)` all end up in the sliders without a colour space conversion
 * being written here — of which there would then be two in the code, and this one
 * would be the one nobody tests against the browser.
 *
 * An unreadable colour leaves the declaration dropped; what comes back is then no
 * `oklch(…)` and the answer is null.
 */
export function toOklch(color: string): Oklch | null {
  const direct = parseOklch(color);

  // What the sliders themselves produce needs no browser: they write `oklch(…)`,
  // and while one is being dragged this runs on every step.
  if (direct) {
    return direct;
  }

  const probe = document.createElement('span');
  probe.style.color = `color-mix(in oklch, ${color}, ${color})`;

  // Only a rendered element has a computed value; a detached one answers empty.
  document.body.append(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();

  return parseOklch(computed);
}

/**
 * One colour, one string — for the question whether a swatch is the chosen
 * colour.
 *
 * Comparing the stored value against the swatch would answer no for
 * `rgb(255,219,73)` against `rgb(255, 219, 73)`, and those are the same yellow:
 * the plan writes it without spaces, the browser reads it back with them. So the
 * comparison happens on the colour, not on its spelling. What the browser cannot
 * read keeps its text — two unreadable values are then equal only if they are
 * written identically, which is as good as it gets.
 */
export function colorKey(color: string): string {
  const oklch = toOklch(color);

  return oklch ? formatOklch(oklch) : color.trim();
}

/** The three numbers out of an `oklch(…)`, or null for anything else. */
export function parseOklch(value: string): Oklch | null {
  const match = /^oklch\(\s*([^\s/]+)\s+([^\s/]+)\s+([^\s/)]+)/.exec(value.trim());

  if (!match) {
    return null;
  }

  const [l, c, h] = match.slice(1, 4).map(channel);

  return Number.isFinite(l) && Number.isFinite(c) && Number.isFinite(h) ? { l, c, h } : null;
}

/** A channel as CSS may write it: a number, a percentage, or `none`. */
function channel(text: string): number {
  if (text === 'none') {
    return 0;
  }

  return text.endsWith('%') ? Number(text.slice(0, -1)) / 100 : Number(text);
}

function trim(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}
