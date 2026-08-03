<?php

namespace App\Domain\Booking;

use App\Models\GlobalSetting;
use App\Models\Role;
use App\Models\Workplace;
use Carbon\CarbonImmutable;

/**
 * Prüft eine Buchung gegen sämtliche Regeln der Spec. Einziger Ort, an dem diese
 * Regeln implementiert sind — das Frontend fragt über `POST /bookings/validate`
 * hier nach, statt sie nachzubauen.
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

        // --- Raster und Reihenfolge ---------------------------------------

        if (! $this->isOnGrid($candidate->startTime) || ! $this->isOnGrid($candidate->endTime)) {
            $violations[] = ViolationCode::NotOnGrid;
        }

        if ($candidate->endTime <= $candidate->startTime) {
            $violations[] = ViolationCode::NotOnGrid;
        }

        // --- Zustand des Arbeitsplatzes -----------------------------------

        if (! $workplace->isBookable()) {
            $violations[] = ViolationCode::WorkplaceNotBookable;
        }

        if ($workplace->usage_rules !== null && ! $candidate->usageRulesAcknowledged) {
            $violations[] = ViolationCode::UsageRulesNotAcknowledged;
        }

        // --- Zeitregeln ----------------------------------------------------

        // Nur beim Anlegen: eine bereits laufende Buchung soll sich weiterhin
        // ändern lassen, und ihr Beginn liegt naturgemäss in der Vergangenheit.
        // Dass eine vollständig vergangene Buchung unantastbar ist, regelt die
        // Endzeit-Prüfung in der HTTP-Schicht.
        if (! $candidate->isEdit() && $candidate->startTime->isPast()) {
            $violations[] = ViolationCode::StartsInPast;
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

        // --- Kollisionen ---------------------------------------------------

        $blocked = $this->resolver->resolve($candidate->workplaceId);

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
