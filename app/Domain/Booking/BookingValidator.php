<?php

namespace App\Domain\Booking;

use App\Models\GlobalSetting;
use App\Models\Role;
use App\Models\Workplace;
use Carbon\CarbonImmutable;

/**
 * Checks a booking against all the rules of the spec. The only place where these
 * rules are implemented — the frontend asks here via `POST /bookings/validate`
 * rather than reimplementing them.
 */
final class BookingValidator
{
    public const GRID_MINUTES = 15;

    public function __construct(
        private readonly CollisionChecker $collisions,
        private readonly BlockedWorkplaceResolver $resolver,
    ) {}

    public function validate(BookingCandidate $candidate, Role $role, bool $lockForUpdate = false): ValidationResult
    {
        $settings = GlobalSetting::current();
        $hours = OpeningHours::fromSettings($settings);

        $workplace = Workplace::with('area')->find($candidate->workplaceId);

        if ($workplace === null) {
            return new ValidationResult(
                [ViolationCode::WorkplaceNotBookable], [], 0, [],
            );
        }

        $area = $workplace->area;
        $violations = [];
        $latestEnd = null;

        // --- Grid and ordering ---------------------------------------------

        if (! $this->isOnGrid($candidate->startTime) || ! $this->isOnGrid($candidate->endTime)) {
            $violations[] = ViolationCode::NotOnGrid;
        }

        if ($candidate->endTime <= $candidate->startTime) {
            $violations[] = ViolationCode::NotOnGrid;
        }

        // --- State of the workplace ----------------------------------------

        if (! $workplace->isBookable()) {
            $violations[] = ViolationCode::WorkplaceNotBookable;
        }

        if ($workplace->usage_rules !== null && ! $candidate->usageRulesAcknowledged) {
            $violations[] = ViolationCode::UsageRulesNotAcknowledged;
        }

        // --- Time rules ------------------------------------------------------

        // The start may lie in the past — whoever sat down first and books
        // afterwards enters the time they began. What must not lie behind us is
        // the end: such a booking would occupy nothing any more. Only when
        // creating; that an existing booking already over is untouchable is
        // handled by the end-time check in the HTTP layer.
        if (! $candidate->isEdit() && $candidate->endTime->isPast()) {
            $violations[] = ViolationCode::EndsInPast;
        }

        if (! $hours->isValidStart($candidate->startTime) || ! $hours->isValidEnd($candidate->endTime)) {
            $violations[] = ViolationCode::OutsideOpeningHours;
        }

        if ($hours->spansNight($candidate->startTime, $candidate->endTime)
            && ! $area->allow_nightly_activities) {
            $violations[] = ViolationCode::SpansNightNotAllowed;
        }

        $chargeable = $hours->chargeableMinutes($candidate->startTime, $candidate->endTime);

        if (! $role->can('noTimeRestrictions')) {
            if ($chargeable > $workplace->effectiveMaxBookingDurationMinutes($area)) {
                $violations[] = ViolationCode::ExceedsMaxDuration;
            }

            $latestEnd = $hours->today()->addDays($area->effectiveMaxBookingEndOffsetDays($settings));

            if ($candidate->endTime->setTimezone($hours->timezone)->startOfDay() > $latestEnd) {
                $violations[] = ViolationCode::ExceedsMaxEndOffset;
            }
        }

        // --- Collisions ------------------------------------------------------

        // With automatic blocking switched off the booking sweeps in nothing:
        // the snapshot stays empty and the collision query drops its third arm
        // (this booking blocks an existing one's workplace). The other two —
        // same workplace, and an existing booking that blocks this one — still
        // apply, so the switch cannot be used to slip past someone else's course.
        $blocked = $candidate->skipAutomaticBlocking
            ? []
            : $this->resolver->resolve($candidate->workplaceId);

        $conflicts = $lockForUpdate
            ? $this->collisions->conflictingBookingIdsForUpdate(
                $candidate->workplaceId,
                $candidate->startTime,
                $candidate->endTime,
                $candidate->excludeBookingId,
                $blocked,
            )
            : $this->collisions->conflictingBookingIds(
                $candidate->workplaceId,
                $candidate->startTime,
                $candidate->endTime,
                $candidate->excludeBookingId,
                $blocked,
            );

        if ($conflicts !== []) {
            $violations[] = ViolationCode::Collision;
        }

        return new ValidationResult(
            array_values(array_unique($violations, SORT_REGULAR)),
            $conflicts,
            $chargeable,
            $blocked,
            $latestEnd,
        );
    }

    private function isOnGrid(CarbonImmutable $instant): bool
    {
        return $instant->second === 0
            && $instant->minute % self::GRID_MINUTES === 0;
    }
}
