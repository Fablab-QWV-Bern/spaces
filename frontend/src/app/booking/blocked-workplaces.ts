/**
 * Which workplaces a booking on a given one would also occupy.
 *
 * The backend resolves the same set when it takes the snapshot
 * (`BlockedWorkplaceResolver`) — but only once a booking exists. What is needed
 * here comes earlier: whoever picks "Kurs Holz" should read before choosing a
 * time that this also takes Holz 1 to Holz 5. Like the booking horizon this is
 * information rather than a verdict — nothing is decided here, and whether the
 * time is actually free is still answered only by `POST /bookings/validate`.
 */

import { Workplace } from '../api/models';

export function blockedWorkplaces(workplace: Workplace, all: Workplace[]): Workplace[] {
  // Case-insensitive, as the spec requires; in the backend the columns' collation
  // takes care of it.
  const tags = new Set(workplace.blocksWorkplacesWithTag.map((tag) => tag.toLowerCase()));
  const ids = new Set(workplace.blocksWorkplaceIds);

  return all.filter(
    (candidate) =>
      // A workplace does not block itself, however it is matched.
      candidate.id !== workplace.id &&
      (ids.has(candidate.id) || candidate.tags.some((tag) => tags.has(tag.toLowerCase()))),
  );
}
