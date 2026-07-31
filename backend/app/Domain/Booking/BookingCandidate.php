<?php

namespace App\Domain\Booking;

use Carbon\CarbonImmutable;

/** Die zu prüfende Buchung, unabhängig davon ob sie neu ist oder eine Änderung. */
final readonly class BookingCandidate
{
    public function __construct(
        public string $workplaceId,
        /** UTC */
        public CarbonImmutable $startTime,
        /** UTC */
        public CarbonImmutable $endTime,
        public bool $usageRulesAcknowledged = false,
        /** Beim Ändern gesetzt, damit die Buchung nicht mit sich selbst kollidiert. */
        public ?string $excludeBookingId = null,
    ) {}
}
