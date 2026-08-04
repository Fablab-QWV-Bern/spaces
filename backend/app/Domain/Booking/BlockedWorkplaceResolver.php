<?php

namespace App\Domain\Booking;

use Illuminate\Support\Facades\DB;

/**
 * Resolves which workplaces a booking on a given workplace also blocks — the
 * union of the explicit ID list and the workplaces matched by tag.
 *
 * The result is recorded as a snapshot when the booking is created or changed.
 * Later changes to blocking rules or tags therefore do not touch existing
 * bookings.
 */
final class BlockedWorkplaceResolver
{
    /** @return list<string> */
    public function resolve(string $workplaceId): array
    {
        $explicit = DB::table('workplace_blocks_workplaces')
            ->where('workplace_id', $workplaceId)
            ->pluck('blocked_workplace_id');

        // The tags are compared through the columns' collation and are therefore
        // case-insensitive, as the spec requires.
        $byTag = DB::table('workplace_blocks_tags as rule')
            ->join('workplace_tags as tagged', 'tagged.tag', '=', 'rule.tag')
            ->where('rule.workplace_id', $workplaceId)
            ->pluck('tagged.workplace_id');

        $ids = $explicit->merge($byTag)
            ->unique()
            // The workplace's own ID does not belong in the list.
            ->reject(fn (string $id): bool => $id === $workplaceId)
            ->values()
            ->all();

        sort($ids);

        return $ids;
    }
}
