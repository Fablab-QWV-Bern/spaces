<?php

namespace App\Domain\Booking;

use Carbon\CarbonImmutable;

/**
 * Ein Termin, der wegen einer bestehenden Buchung ausgelassen wurde. Die Serie
 * entsteht trotzdem — der Aufrufer bekommt die Lücke gemeldet, statt dass die
 * ganze Anlage scheitert.
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
