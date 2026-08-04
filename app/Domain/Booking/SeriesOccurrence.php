<?php

namespace App\Domain\Booking;

use Carbon\CarbonImmutable;

/** A single occurrence of a series, already converted to UTC. */
final readonly class SeriesOccurrence
{
    public function __construct(
        /** UTC */
        public CarbonImmutable $startTime,
        /** UTC */
        public CarbonImmutable $endTime,
    ) {}
}
