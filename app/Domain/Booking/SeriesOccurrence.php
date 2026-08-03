<?php

namespace App\Domain\Booking;

use Carbon\CarbonImmutable;

/** Ein einzelner Termin einer Serie, bereits in UTC umgerechnet. */
final readonly class SeriesOccurrence
{
    public function __construct(
        /** UTC */
        public CarbonImmutable $startTime,
        /** UTC */
        public CarbonImmutable $endTime,
    ) {}
}
