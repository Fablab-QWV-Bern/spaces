<?php

namespace App\Domain\Booking;

/**
 * Die Regelverstösse, die die Buchungsprüfung melden kann. Die Werte sind
 * zugleich die Codes, die `POST /bookings/validate` ausliefert.
 */
enum ViolationCode: string
{
    case Collision = 'COLLISION';
    case OutsideOpeningHours = 'OUTSIDE_OPENING_HOURS';
    case ExceedsMaxDuration = 'EXCEEDS_MAX_DURATION';
    case ExceedsMaxEndOffset = 'EXCEEDS_MAX_END_OFFSET';
    case StartsInPast = 'STARTS_IN_PAST';
    case NotOnGrid = 'NOT_ON_GRID';
    case SpansNightNotAllowed = 'SPANS_NIGHT_NOT_ALLOWED';
    case WorkplaceNotBookable = 'WORKPLACE_NOT_BOOKABLE';
    case UsageRulesNotAcknowledged = 'USAGE_RULES_NOT_ACKNOWLEDGED';
}
