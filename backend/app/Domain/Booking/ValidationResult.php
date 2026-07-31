<?php

namespace App\Domain\Booking;

final readonly class ValidationResult
{
    /**
     * @param  list<ViolationCode>  $violations
     * @param  list<string>  $conflictingBookingIds
     * @param  list<string>  $blockedWorkplaceIds  Der Snapshot, der bei einer gültigen
     *                                             Buchung gespeichert wird.
     */
    public function __construct(
        public array $violations,
        public array $conflictingBookingIds,
        public int $chargeableDurationMinutes,
        public array $blockedWorkplaceIds,
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
