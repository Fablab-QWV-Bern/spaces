import { Workplace } from '../api/models';
import { planWorkplaceIds } from '../map/plan';

/**
 * What a floor plan and the configured workplaces have to say to each other.
 *
 * Neither side is the authority. The plan draws more benches than the workshop
 * rents out — four 3D printers where there are three, machines that stand in the
 * room without being bookable — and a workplace may be configured before anyone
 * has drawn it. So this reports rather than judges: three lists, and what they
 * mean on the map is said in the view.
 */
export interface PlanMatch {
  /** Drawn and configured — these are the ones the map can actually colour. */
  matched: string[];

  /** Drawn but unknown to the configuration. On the map they become obstacles. */
  strays: string[];

  /** Configured but nowhere on the plan. The map cannot show them at all. */
  missing: Workplace[];
}

export function matchPlan(source: string, workplaces: Workplace[]): PlanMatch {
  const drawn = new Set(planWorkplaceIds(source));
  const configured = new Set(workplaces.map((workplace) => workplace.id));

  return {
    matched: [...drawn].filter((id) => configured.has(id)),
    strays: [...drawn].filter((id) => !configured.has(id)),
    missing: workplaces.filter((workplace) => !drawn.has(workplace.id)),
  };
}
