<?php

namespace App\Domain\Booking;

use Carbon\CarbonImmutable;

final readonly class ValidationResult
{
    /**
     * @param  list<ViolationCode>  $violations
     * @param  list<string>  $conflictingBookingIds
     * @param  list<string>  $blockedWorkplaceIds  The snapshot stored for a valid
     *                                             booking.
     * @param  CarbonImmutable|null  $latestBookableDay  The last day on which the booking
     *                                                   would be allowed to end; null where
     *                                                   no horizon applies. Only the message
     *                                                   needs it — without it, how far "this
     *                                                   far in advance" reaches stays open.
     */
    public function __construct(
        public array $violations,
        public array $conflictingBookingIds,
        public int $chargeableDurationMinutes,
        public array $blockedWorkplaceIds,
        public ?CarbonImmutable $latestBookableDay = null,
    ) {}

    public function isValid(): bool
    {
        return $this->violations === [];
    }

    public function has(ViolationCode $code): bool
    {
        return in_array($code, $this->violations, strict: true);
    }

    /** @return list<string> */
    public function violationCodes(): array
    {
        return array_map(fn (ViolationCode $code): string => $code->value, $this->violations);
    }
}
