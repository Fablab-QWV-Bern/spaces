/**
 * The arithmetic of the overview map: boxes in the SVG's coordinate system become
 * percentages of its surface.
 *
 * Like the time axis, deliberately free of Angular and free of the DOM — only
 * numbers are passed in. Measuring happens in one place, in `MapView`; the
 * arithmetic happens here, where it can be tested.
 *
 * Percentages rather than pixels, because the map grows with the window. That
 * only works out as long as the rendered area has exactly the aspect ratio of the
 * `viewBox` — otherwise a margin would remain that the percentages know nothing
 * about. `map-view.scss` sees to that.
 */

/** A box in the SVG's coordinate system — the shape of `getBBox()`. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Placement on the map, as a percentage of its width or height. */
export interface Placement {
  leftPercent: number;
  topPercent: number;
  widthPercent: number;
  heightPercent: number;
}

/**
 * The figure's identifier in the SVG. It is part of the contract with the file,
 * just as the workplace identifiers are: the map brings one figure along, and we
 * place it as many times as somebody is present.
 */
export const FIGURE_ID = 'figur';

/** `viewBox="0 0 1184 2082"` as a box; null when the attribute is missing or unreadable. */
export function parseViewBox(value: string | null | undefined): Box | null {
  if (!value) {
    return null;
  }

  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map(Number);

  if (parts.length !== 4 || parts.some(Number.isNaN) || parts[2] <= 0 || parts[3] <= 0) {
    return null;
  }

  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

/**
 * Places the figure centred on a workplace — at its natural size.
 *
 * Not stretched to the size of the workplace: the figure is drawn at the map's
 * scale, and a workbench is wider than a person. Stretched, a giant would stand
 * at the planing bench and a dwarf at the soldering station.
 */
export function placeCentered(viewBox: Box, target: Box, figure: Box): Placement {
  return {
    leftPercent: ((centerX(target) - figure.width / 2 - viewBox.x) / viewBox.width) * 100,
    topPercent: ((centerY(target) - figure.height / 2 - viewBox.y) / viewBox.height) * 100,
    widthPercent: (figure.width / viewBox.width) * 100,
    heightPercent: (figure.height / viewBox.height) * 100,
  };
}

/** The excerpt the figure alone fills — the `viewBox` of its own SVG. */
export function figureViewBox(figure: Box): string {
  return `${figure.x} ${figure.y} ${figure.width} ${figure.height}`;
}

function centerX(box: Box): number {
  return box.x + box.width / 2;
}

function centerY(box: Box): number {
  return box.y + box.height / 2;
}
