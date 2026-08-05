<?php

namespace App\Domain\Booking;

/**
 * The rule violations the booking check can report. The values are at the same
 * time the codes that `POST /bookings/validate` delivers.
 */
enum ViolationCode: string
{
    case Collision = 'COLLISION';
    case OutsideOpeningHours = 'OUTSIDE_OPENING_HOURS';
    case ExceedsMaxDuration = 'EXCEEDS_MAX_DURATION';
    case ExceedsMaxEndOffset = 'EXCEEDS_MAX_END_OFFSET';
    case EndsInPast = 'ENDS_IN_PAST';
    case NotOnGrid = 'NOT_ON_GRID';
    case SpansNightNotAllowed = 'SPANS_NIGHT_NOT_ALLOWED';
    case WorkplaceNotBookable = 'WORKPLACE_NOT_BOOKABLE';
    case UsageRulesNotAcknowledged = 'USAGE_RULES_NOT_ACKNOWLEDGED';
}
