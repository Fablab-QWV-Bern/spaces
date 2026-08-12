/**
 * The one piece of arithmetic the overview map still needs: where the figure
 * stands.
 *
 * Like the time axis, deliberately free of Angular and free of the DOM — only
 * numbers go in. Measuring happens in one place, in `MapView`, on the grafted
 * document where `getBBox()` knows about groups, transforms and curves; the
 * arithmetic happens here, where it can be tested.
 */

/** A box in the SVG's coordinate system — the shape of `getBBox()`. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * How far the feet reach past the middle, in the plan's units.
 *
 * Exactly on the line the figure looks as if it were floating in front of the
 * bench; a few units in and it stands at it. Small enough that it makes no
 * difference on the smallest workplace.
 */
const FOOT_OVERLAP = 5;

/**
 * The transform that stands the figure on a workplace, at its natural size.
 *
 * Centred across, but not down: the feet land on the middle of the bench rather
 * than the waist. On a floor plan seen from above, a person drawn in elevation
 * belongs at the front edge of what they are working at — centred vertically they
 * would sit in the bench rather than stand at it.
 *
 * Not scaled to the size of the workplace: the figure is drawn at the map's
 * scale, and a workbench is wider than a person. Stretched, a giant would stand
 * at the planing bench and a dwarf at the soldering station.
 *
 * Both boxes have to be measured in the same user space, and in the plan they
 * are: its layers sit side by side without a transform between them, so the
 * shape's box counts unchanged in the layer the `<use>` is hung into. What
 * `<use>` references brings its own coordinates along anyway, untouched by
 * wherever in the plan it was drawn.
 */
export function standingOn(target: Box, figure: Box): string {
  const dx = middle(target.x, target.width) - middle(figure.x, figure.width);
  const dy = middle(target.y, target.height) - (figure.y + figure.height - FOOT_OVERLAP);

  return `translate(${round(dx)} ${round(dy)})`;
}

function middle(start: number, length: number): number {
  return start + length / 2;
}

/** Three decimals are finer than any screen; the rest only lengthens the file. */
function round(value: number): number {
  return Number(value.toFixed(3));
}
