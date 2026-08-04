<?php

namespace App\Domain\Booking;

use RuntimeException;

/**
 * A booking violates the rules. Carries the full validation result along so that
 * the HTTP layer can turn it into a 409 or a 422.
 */
class BookingRuleException extends RuntimeException
{
    public function __construct(public readonly ValidationResult $result)
    {
        parent::__construct('The booking violates the booking rules.');
    }

    public function isCollision(): bool
    {
        return $this->result->has(ViolationCode::Collision);
    }
}
