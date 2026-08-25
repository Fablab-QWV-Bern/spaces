/**
 * What the map, the area form and the admin area know about the floor plan.
 *
 * The plan is a file, not source code (see `MapView`), and everything read from
 * it is a contract with that file: the workplace identifiers, and the two layer
 * names below. They live here rather than in the view because the other two ask
 * the same file the same questions — which colours does the plan draw its
 * benches in, which benches does it know at all — and a second list of them
 * would be a second truth that rots silently the first time the plan is
 * redrawn. Where the file itself lies is `PlanSource`'s business.
 */

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
  const layer = workplaceLayer(source);

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

/**
 * The identifiers the plan draws benches under, in the order they are drawn.
 *
 * This is the one half of the contract that can be held against the other: what
 * the drawing calls a workplace, against what the configuration knows. Neither
 * side is authoritative — the plan legitimately shows more than the workshop
 * rents out, and a workplace may exist before it is drawn — so this only reports
 * what is there. Comparing is the admin area's business.
 *
 * Shapes without an id are skipped rather than counted: they are the ones the
 * drawing tool never got a name for, and there is nothing to say about them.
 */
export function planWorkplaceIds(source: string): string[] {
  const layer = workplaceLayer(source);

  if (!layer) {
    return [];
  }

  return [...layer.children].map((shape) => shape.id).filter((id) => id !== '');
}

/**
 * The layer the benches are drawn in, or null when the plan has none.
 *
 * Found by attribute rather than as `#id`: the layer's name carries an umlaut,
 * and this way it needs no escaping to survive as a selector.
 */
function workplaceLayer(source: string): Element | null {
  const root = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;

  return root.querySelector(`[id="${WORKPLACE_LAYER_ID}"]`);
}
