<?php

namespace App\Domain\Booking;

use Carbon\CarbonImmutable;

/**
 * An occurrence left out because of an existing booking. The series is created
 * regardless — the caller is told about the gap instead of the whole creation
 * failing.
 */
final readonly class SkippedInstance
{
    public function __construct(
        /** UTC */
        public CarbonImmutable $startTime,
        /** UTC */
        public CarbonImmutable $endTime,
        /** @var list<string> */
        public array $conflictingBookingIds,
    ) {}
}
