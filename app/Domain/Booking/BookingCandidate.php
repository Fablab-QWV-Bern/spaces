<?php

namespace App\Domain\Booking;

use Carbon\CarbonImmutable;

/** The booking to be checked, regardless of whether it is new or a change. */
final readonly class BookingCandidate
{
    public function __construct(
        public string $workplaceId,
        /** UTC */
        public CarbonImmutable $startTime,
        /** UTC */
        public CarbonImmutable $endTime,
        public bool $usageRulesAcknowledged = false,
        /**
         * When true the booking blocks only its own workplace — the workplaces it
         * would otherwise sweep in (by ID or tag) are left free.
         */
        public bool $skipAutomaticBlocking = false,
        /** Set when changing, so that the booking does not collide with itself. */
        public ?string $excludeBookingId = null,
    ) {}

    /**
     * Does the candidate refer to an existing booking? Among other things this
     * decides whether a start in the past is permissible.
     */
    public function isEdit(): bool
    {
        return $this->excludeBookingId !== null;
    }
}
