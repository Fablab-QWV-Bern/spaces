<?php

namespace App\Domain\Booking;

use RuntimeException;

/**
 * Eine Buchung verstösst gegen die Regeln. Trägt das vollständige Prüfergebnis
 * mit, damit die HTTP-Schicht daraus 409 oder 422 machen kann.
 */
class BookingRuleException extends RuntimeException
{
    public function __construct(public readonly ValidationResult $result)
    {
        parent::__construct('Die Buchung verstösst gegen die Buchungsregeln.');
    }

    public function isCollision(): bool
    {
        return $this->result->has(ViolationCode::Collision);
    }
}
