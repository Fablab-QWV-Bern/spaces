import { describe, expect, it } from 'vitest';

import { Workplace } from '../api/models';
import { blockedWorkplaces } from './blocked-workplaces';

function workplace(partial: Partial<Workplace>): Workplace {
  return {
    id: 'holz-1',
    name: 'Holz 1',
    status: 'OK',
    areaId: 'holz',
    blocksWorkplaceIds: [],
    blocksWorkplacesWithTag: [],
    tags: [],
    sortOrder: 0,
    ...partial,
  } as Workplace;
}

const holz1 = workplace({ id: 'holz-1', name: 'Holz 1', tags: ['Holz'] });
const holz2 = workplace({ id: 'holz-2', name: 'Holz 2', tags: ['holz'] });
const metall = workplace({ id: 'metall-1', name: 'Metall 1', tags: ['Metall'] });

describe('blockedWorkplaces', () => {
  it('takes the explicitly named ones', () => {
    const kurs = workplace({ id: 'kurs-holz', blocksWorkplaceIds: ['holz-2'] });

    expect(blockedWorkplaces(kurs, [holz1, holz2, metall, kurs])).toEqual([holz2]);
  });

  it('takes everything carrying a matching tag, regardless of case', () => {
    const kurs = workplace({ id: 'kurs-holz', blocksWorkplacesWithTag: ['HOLZ'] });

    expect(blockedWorkplaces(kurs, [holz1, holz2, metall, kurs])).toEqual([holz1, holz2]);
  });

  it('never contains the workplace itself, however it is matched', () => {
    const kurs = workplace({
      id: 'kurs-holz',
      tags: ['Holz'],
      blocksWorkplaceIds: ['kurs-holz'],
      blocksWorkplacesWithTag: ['Holz'],
    });

    expect(blockedWorkplaces(kurs, [kurs, holz1])).toEqual([holz1]);
  });

  it('keeps the order of the workplace list, not that of the rules', () => {
    const kurs = workplace({ id: 'kurs-holz', blocksWorkplaceIds: ['metall-1', 'holz-1'] });

    expect(blockedWorkplaces(kurs, [holz1, holz2, metall, kurs])).toEqual([holz1, metall]);
  });
});
