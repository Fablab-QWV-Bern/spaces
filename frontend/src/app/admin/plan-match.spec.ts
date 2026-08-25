import { describe, expect, it } from 'vitest';

import { Workplace } from '../api/models';
import { matchPlan } from './plan-match';

function workplace(id: string): Workplace {
  return {
    id,
    name: id,
    areaId: 'holz',
    status: 'OK',
    sortOrder: 0,
    tags: [],
    blocksWorkplaceIds: [],
    blocksWorkplacesWithTag: [],
    maxBookingDurationMinutes: null,
    location: null,
    description: null,
    usageRules: null,
    wikiUrl: null,
  };
}

const plan = `
  <svg xmlns="http://www.w3.org/2000/svg">
    <g id="Arbeitsplätze">
      <path id="holz-1"/>
      <path id="holz-2"/>
      <path id="_3d-drucker-4"/>
      <path/>
    </g>
  </svg>
`;

describe('matchPlan', () => {
  it('sorts the identifiers into the three cases', () => {
    const match = matchPlan(plan, [
      workplace('holz-1'),
      workplace('holz-2'),
      workplace('loeten-1'),
    ]);

    expect(match.matched).toEqual(['holz-1', 'holz-2']);
    expect(match.strays).toEqual(['_3d-drucker-4']);
    expect(match.missing.map((w) => w.id)).toEqual(['loeten-1']);
  });

  // A shape the drawing tool never got a name for says nothing about the
  // configuration; it is not a stray but scenery.
  it('ignores shapes without an identifier', () => {
    const match = matchPlan(plan, []);

    expect(match.strays).toEqual(['holz-1', 'holz-2', '_3d-drucker-4']);
  });

  it('calls every workplace missing when the plan has no such layer', () => {
    const match = matchPlan('<svg xmlns="http://www.w3.org/2000/svg"/>', [workplace('holz-1')]);

    expect(match.matched).toEqual([]);
    expect(match.strays).toEqual([]);
    expect(match.missing.map((w) => w.id)).toEqual(['holz-1']);
  });
});
