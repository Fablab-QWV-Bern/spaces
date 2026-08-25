/**
 * What the map and the area form know about the shipped floor plan.
 *
 * The plan is a file, not source code (see `MapView`), and everything read from
 * it is a contract with that file: the workplace identifiers, and the two layer
 * names below. They live here rather than in the view because the admin area asks
 * the same file the same question — which colours does the workshop's plan draw
 * its benches in — and a second list of them would be a second truth that rots
 * silently the first time the plan is redrawn.
 */

/** Where the floor plan lives. */
export const PLAN_URL = '/karte.svg';

/**
 * The layer the benches are drawn in, and the one with the fixed obstacles.
 *
 * The plan draws more benches than the workshop rents out — four 3D printers
 * where the configuration knows three, machines that stand in the room without
 * being bookable. Those are only recognisable as such where the drawing says
 * which shapes were *meant* as workplaces; hence the first name. The second is
 * where their colour comes from: the Striebig, the saw, the wood store — what
 * stands in the room without anyone booking it.
 */
export const WORKPLACE_LAYER_ID = 'Arbeitsplätze';
export const OBSTACLE_LAYER_ID = 'Hindernisse';

/**
 * The colours the plan draws its benches in, each once, in the order they are
 * drawn.
 *
 * The obstacles' grey is deliberately not among them. On the map it means "not
 * bookable"; offered as an area colour it would be a trap, because every bench in
 * that area would then read as part of the room.
 *
 * Takes the plan as text rather than fetching it, so that this stays a function
 * one can hold a string against.
 */
export function planPalette(source: string): string[] {
  const root = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
  // By attribute rather than as `#id`: the layer's name carries an umlaut, and
  // this way it needs no escaping to survive as a selector.
  const layer = root.querySelector(`[id="${WORKPLACE_LAYER_ID}"]`);

  if (!layer) {
    return [];
  }

  const colors = new Set<string>();

  for (const shape of layer.children) {
    const element = shape as SVGElement;

    // Both spellings, because how the plan writes its fill is the drawing's
    // business: SVG allows an attribute, and the export writes a style. The
    // attribute takes the detour through the style so that both come out in the
    // one notation the CSSOM writes — otherwise the same colour would land in
    // the row twice, once with spaces and once without.
    if (!element.style.fill) {
      element.style.fill = shape.getAttribute('fill') ?? '';
    }

    const fill = element.style.fill;

    if (fill && fill !== 'none') {
      colors.add(fill);
    }
  }

  return [...colors];
}
