<?php

namespace App\Domain\Booking;

use App\Models\Booking;
use App\Models\BookingSeries;
use App\Models\GlobalSetting;
use App\Models\Role;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Creates booking series, changes them and generates their instances.
 *
 * The rules are checked once against the first instance, not against every one:
 * what makes up a series — workplace, wall-clock time, duration — is the same for
 * all instances, and what differs (the occupancy) is checked by every instance for
 * itself anyway. If one collides, it drops out; the series is created regardless.
 */
final class SeriesWriter
{
    /** How far ahead instances are generated. */
    public const HORIZON_YEARS = 1;

    public function __construct(
        private readonly BookingValidator $validator,
        private readonly CollisionChecker $collisions,
        private readonly BlockedWorkplaceResolver $resolver,
        private readonly SeriesExceptions $exceptions,
    ) {}

    /**
     * @param  array<string, mixed>  $data  Already validated fields from BookingSeriesWrite
     * @return array{0: BookingSeries, 1: list<SkippedInstance>}
     *
     * @throws BookingRuleException
     */
    public function create(array $data, Role $role): array
    {
        return DB::transaction(function () use ($data, $role): array {
            $this->checkShape($data, $role);

            $series = BookingSeries::create([
                'workplace_id' => $data['workplaceId'],
                'name' => $data['name'],
                'contact' => $data['contact'],
                'interval' => $data['interval'],
                'interval_count' => $data['intervalCount'],
                'first_instance_start' => $this->wallClock($data['firstInstanceStart']),
                'first_instance_end' => $this->wallClock($data['firstInstanceEnd']),
                'end_date' => $data['endDate'] ?? null,
                'instantiated_until' => $this->horizon(),
            ]);

            return [$series, $this->reconcile($series, $this->today())];
        });
    }

    /**
     * Changes the series and reconciles its future instances. Past and running
     * ones stay as they are — they have taken place — and so do the detached ones
     * that somebody has adjusted by hand.
     *
     * @param  array<string, mixed>  $data
     * @return array{0: BookingSeries, 1: list<SkippedInstance>}
     *
     * @throws BookingRuleException
     */
    public function update(BookingSeries $series, array $data, Role $role): array
    {
        return DB::transaction(function () use ($series, $data, $role): array {
            $this->checkShape($data, $role);

            $series->update([
                'workplace_id' => $data['workplaceId'],
                'name' => $data['name'],
                'contact' => $data['contact'],
                'interval' => $data['interval'],
                'interval_count' => $data['intervalCount'],
                'first_instance_start' => $this->wallClock($data['firstInstanceStart']),
                'first_instance_end' => $this->wallClock($data['firstInstanceEnd']),
                'end_date' => $data['endDate'] ?? null,
                'instantiated_until' => $this->horizon(),
            ]);

            return [$series->refresh(), $this->reconcile($series, $this->today())];
        });
    }

    /**
     * Deletes the series. Its future instances vanish with it; the past ones
     * remain as standalone bookings — the foreign key merely clears
     * `booking_series_id` there.
     */
    public function delete(BookingSeries $series): void
    {
        DB::transaction(function () use ($series): void {
            $this->deleteFutureInstances($series);
            $series->delete();
        });
    }

    /**
     * Catches up on whatever has accrued since the last run and pushes the
     * horizon back out to a year. Only what lies after `instantiated_until` is
     * generated — which is why the run may happen any number of times.
     *
     * @return list<SkippedInstance>
     */
    public function extend(BookingSeries $series): array
    {
        return DB::transaction(function () use ($series): array {
            $horizon = $this->horizon();

            $firstDay = CarbonImmutable::parse(
                $series->instantiated_until->addDay()->toDateString(),
                $this->timezone(),
            );

            if ($firstDay > $horizon) {
                return [];
            }

            $skipped = $this->reconcile($series, $firstDay);

            $series->update(['instantiated_until' => $horizon]);

            return $skipped;
        });
    }

    /**
     * Brings the instances between `$firstDay` and the horizon into agreement
     * with the series. Runs inside the caller's transaction so that the collision
     * check's locks hold until the write.
     *
     * Reconciled rather than deleted and recreated: an occurrence that still
     * exists keeps its row and therefore its ID. That is not merely thriftier —
     * the ID is the UID in the iCal feed, and a delete would make all future
     * occurrences vanish from every subscription and reappear as new ones.
     *
     * Two things are exempt: detached instances (somebody adjusted them by hand)
     * and beats with an exception (somebody cancelled or moved the occurrence).
     *
     * @return list<SkippedInstance>
     */
    private function reconcile(BookingSeries $series, CarbonImmutable $firstDay): array
    {
        $settings = GlobalSetting::current();
        $hours = OpeningHours::fromSettings($settings);

        $schedule = SeriesSchedule::forSeries($series, $settings->timezone);
        $blocked = $this->resolver->resolve($series->workplace_id);
        $now = CarbonImmutable::now('UTC');

        $cancelled = $this->exceptions->cancelledAt($series->id);

        $occurrences = array_values(array_filter(
            $schedule->occurrencesBetween($firstDay, $this->horizon(), $now),
            fn (SeriesOccurrence $occurrence): bool => ! in_array(
                $occurrence->startTime->toDateTimeString(), $cancelled, strict: true,
            ),
        ));

        // The not-yet-started instances inside the reconciled window, reachable
        // by their point in time. The window bounds are not decoration: the daily
        // run only reconciles the new far end of the year and must not clear away
        // what has long been correct before it.
        //
        // Detached ones are deliberately absent here: they are neither adjusted
        // nor cleaned up, and as occupancy they show up in the collision check
        // anyway.
        $existing = $series->bookings()
            ->where('start_time', '>', $now)
            ->where('start_time', '>=', $firstDay->utc())
            ->where('start_time', '<=', $this->horizon()->endOfDay()->utc())
            ->where('series_detached', false)
            ->get()
            ->keyBy(fn (Booking $booking): string => $booking->start_time->toDateTimeString());

        $wanted = array_map(
            fn (SeriesOccurrence $occurrence): string => $occurrence->startTime->toDateTimeString(),
            $occurrences,
        );

        // Clear away first, then write: an instance that no longer exists could
        // otherwise collide with the occurrence taking its place.
        foreach ($existing->keys()->diff($wanted) as $key) {
            $existing->pull($key)->delete();
        }

        $skipped = [];

        foreach ($occurrences as $occurrence) {
            $booking = $existing->get($occurrence->startTime->toDateTimeString());

            $conflicts = $this->collisions->conflictingBookingIdsForUpdate(
                $series->workplace_id,
                $occurrence->startTime,
                $occurrence->endTime,
                $booking?->getKey(),
                $blocked,
            );

            if ($conflicts !== []) {
                // An existing instance can be in the way too — for example when
                // the series moves to an occupied workplace.
                $booking?->delete();

                $skipped[] = new SkippedInstance(
                    $occurrence->startTime,
                    $occurrence->endTime,
                    $conflicts,
                );

                continue;
            }

            $attributes = [
                'workplace_id' => $series->workplace_id,
                'name' => $series->name,
                'contact' => $series->contact,
                // Whoever may create a series confirms the usage rules with it;
                // BookingSeriesWrite has no field of its own for that.
                'usage_rules_acknowledged' => true,
                'start_time' => $occurrence->startTime,
                'end_time' => $occurrence->endTime,
                'chargeable_duration_minutes' => $hours->chargeableMinutes(
                    $occurrence->startTime,
                    $occurrence->endTime,
                ),
            ];

            if ($booking !== null) {
                $booking->update($attributes);
            } else {
                $booking = Booking::create([
                    // Instances have no creator: they arise from the series, and
                    // later top-ups from a cron run without a session.
                    'creator_role_id' => null,
                    'booking_series_id' => $series->id,
                    ...$attributes,
                ]);
            }

            $booking->setBlockedWorkplaceIds($blocked);
        }

        return $skipped;
    }

    /**
     * Checks the shape of the series against its first instance.
     *
     * Three violations are exempt: a collision makes the individual instance drop
     * out rather than the series fail, the booking horizon does not apply to
     * series (otherwise nothing could be generated a year ahead), and a first
     * occurrence that is already over is normal for a series — it describes a
     * rhythm, not an appointment, and generation begins from now anyway.
     *
     * @param  array<string, mixed>  $data
     *
     * @throws BookingRuleException
     */
    private function checkShape(array $data, Role $role): void
    {
        $timezone = $this->timezone();

        $schedule = new SeriesSchedule(
            $data['interval'],
            (int) $data['intervalCount'],
            CarbonImmutable::parse($data['firstInstanceStart'], $timezone),
            CarbonImmutable::parse($data['firstInstanceEnd'], $timezone),
            null,
            $timezone,
        );

        $first = $schedule->firstOccurrence();

        $result = $this->validator->validate(
            new BookingCandidate(
                $data['workplaceId'],
                $first->startTime,
                $first->endTime,
                usageRulesAcknowledged: true,
            ),
            $role,
        );

        $relevant = array_values(array_filter(
            $result->violations,
            fn (ViolationCode $code): bool => ! in_array($code, [
                ViolationCode::Collision,
                ViolationCode::ExceedsMaxEndOffset,
                ViolationCode::EndsInPast,
            ], strict: true),
        ));

        if ($relevant !== []) {
            throw new BookingRuleException(new ValidationResult(
                $relevant,
                [],
                $result->chargeableDurationMinutes,
                $result->blockedWorkplaceIds,
            ));
        }
    }

    private function deleteFutureInstances(BookingSeries $series): void
    {
        $series->bookings()
            ->where('start_time', '>', CarbonImmutable::now('UTC'))
            ->delete();
    }

    /** "2026-08-03T09:00" becomes "2026-08-03 09:00:00" — without timezone, like the column. */
    private function wallClock(string $value): string
    {
        return str_replace('T', ' ', $value).':00';
    }

    private function timezone(): string
    {
        return GlobalSetting::current()->timezone;
    }

    private function today(): CarbonImmutable
    {
        return CarbonImmutable::now($this->timezone())->startOfDay();
    }

    /** The last day up to which instances are generated — local, not UTC. */
    private function horizon(): CarbonImmutable
    {
        return $this->today()->addYears(self::HORIZON_YEARS);
    }
}
