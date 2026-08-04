<?php

namespace App\Domain\Booking;

use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Finds bookings that collide with a new or changed booking.
 *
 * A collision exists if the time ranges overlap AND at least one of the three
 * conditions holds:
 *
 *   1. same workplace
 *   2. the new booking's workplace appears in the existing one's snapshot
 *   3. the existing booking's workplace appears in the new one's snapshot
 *
 * Two bookings that block the same third workplace therefore deliberately do NOT
 * collide with each other — only the third one is blocked.
 */
final class CollisionChecker
{
    public function __construct(private readonly BlockedWorkplaceResolver $resolver) {}

    /**
     * @param  list<string>|null  $blockedWorkplaceIds  Snapshot of the new booking;
     *                                                  resolved afresh otherwise.
     * @return list<string> IDs of the colliding bookings
     */
    public function conflictingBookingIds(
        string $workplaceId,
        CarbonImmutable $startTime,
        CarbonImmutable $endTime,
        ?string $excludeBookingId = null,
        ?array $blockedWorkplaceIds = null,
    ): array {
        return $this
            ->query($workplaceId, $startTime, $endTime, $excludeBookingId, $blockedWorkplaceIds)
            ->orderBy('start_time')
            ->pluck('id')
            ->all();
    }

    /**
     * Like conflictingBookingIds, but locks the examined rows until the end of the
     * transaction. InnoDB also sets gap locks on the searched range, so that no
     * colliding booking can be slipped in concurrently.
     *
     * Must be called inside a transaction — otherwise the lock is gone again
     * immediately.
     *
     * @param  list<string>|null  $blockedWorkplaceIds
     * @return list<string>
     */
    public function conflictingBookingIdsForUpdate(
        string $workplaceId,
        CarbonImmutable $startTime,
        CarbonImmutable $endTime,
        ?string $excludeBookingId = null,
        ?array $blockedWorkplaceIds = null,
    ): array {
        if (DB::transactionLevel() === 0) {
            throw new \LogicException(
                'conflictingBookingIdsForUpdate must run inside a transaction.',
            );
        }

        return $this
            ->query($workplaceId, $startTime, $endTime, $excludeBookingId, $blockedWorkplaceIds)
            ->lockForUpdate()
            ->orderBy('start_time')
            ->pluck('id')
            ->all();
    }

    /** @param  list<string>|null  $blockedWorkplaceIds */
    private function query(
        string $workplaceId,
        CarbonImmutable $startTime,
        CarbonImmutable $endTime,
        ?string $excludeBookingId,
        ?array $blockedWorkplaceIds,
    ): Builder {
        $blocked = $blockedWorkplaceIds ?? $this->resolver->resolve($workplaceId);

        $query = DB::table('bookings')
            // Half-open comparison: 10:00–11:00 does not collide with 11:00–12:00.
            ->where('start_time', '<', $endTime)
            ->where('end_time', '>', $startTime)
            ->where(function (Builder $query) use ($workplaceId, $blocked): void {
                $query
                    ->where('workplace_id', $workplaceId)
                    ->orWhereExists(function (Builder $query) use ($workplaceId): void {
                        $query->select(DB::raw(1))
                            ->from('booking_blocked_workplaces')
                            ->whereColumn('booking_blocked_workplaces.booking_id', 'bookings.id')
                            ->where('booking_blocked_workplaces.workplace_id', $workplaceId);
                    });

                if ($blocked !== []) {
                    $query->orWhereIn('workplace_id', $blocked);
                }
            });

        if ($excludeBookingId !== null) {
            // When changing, the booking does not collide with itself.
            $query->where('id', '!=', $excludeBookingId);
        }

        return $query;
    }
}
