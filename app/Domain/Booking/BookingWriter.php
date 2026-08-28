<?php

namespace App\Domain\Booking;

use App\Models\Booking;
use App\Models\Role;
use Illuminate\Support\Facades\DB;

/**
 * Creates and changes bookings. Check and write run in one transaction with a
 * lock on the affected rows — that is the only way two simultaneous requests
 * cannot both get through.
 */
final class BookingWriter
{
    public function __construct(
        private readonly BookingValidator $validator,
        private readonly SeriesExceptions $exceptions,
    ) {}

    /**
     * @param  array{name: string, contact: string}  $booker
     *
     * @throws BookingRuleException
     */
    public function create(
        BookingCandidate $candidate,
        Role $role,
        array $booker,
        ?string $ipAddress = null,
    ): Booking {
        return DB::transaction(function () use ($candidate, $role, $booker, $ipAddress): Booking {
            $result = $this->check($candidate, $role);

            $booking = Booking::create([
                'creator_role_id' => $role->id,
                'ip_address' => $ipAddress,
                'workplace_id' => $candidate->workplaceId,
                'name' => $booker['name'],
                'contact' => $booker['contact'],
                'usage_rules_acknowledged' => $candidate->usageRulesAcknowledged,
                'skip_automatic_blocking' => $candidate->skipAutomaticBlocking,
                'start_time' => $candidate->startTime,
                'end_time' => $candidate->endTime,
                'chargeable_duration_minutes' => $result->chargeableDurationMinutes,
            ]);

            // The snapshot is taken from the validation result rather than
            // resolved afresh — otherwise something could change between check
            // and write.
            $booking->setBlockedWorkplaceIds($result->blockedWorkplaceIds);

            return $booking;
        });
    }

    /**
     * @param  array{name: string, contact: string}  $booker
     *
     * @throws BookingRuleException
     */
    public function update(
        Booking $booking,
        BookingCandidate $candidate,
        Role $role,
        array $booker,
    ): Booking {
        return DB::transaction(function () use ($booking, $candidate, $role, $booker): Booking {
            $result = $this->check($candidate, $role);

            // Recorded before filling: afterwards start_time holds the new time
            // and the beat would no longer be available.
            $occurrenceStart = $booking->start_time;
            $wasDetached = (bool) $booking->series_detached;

            $booking->fill([
                'workplace_id' => $candidate->workplaceId,
                'name' => $booker['name'],
                'contact' => $booker['contact'],
                'usage_rules_acknowledged' => $candidate->usageRulesAcknowledged,
                'skip_automatic_blocking' => $candidate->skipAutomaticBlocking,
                'start_time' => $candidate->startTime,
                'end_time' => $candidate->endTime,
                'chargeable_duration_minutes' => $result->chargeableDurationMinutes,
            ]);

            // Changing a series instance by hand detaches it: the next edit of
            // the series will leave it alone afterwards. Only on an actual change
            // — a form that is opened and saved unchanged should not pin the
            // occurrence down forever.
            if ($booking->booking_series_id !== null && $booking->isDirty()) {
                if (! $wasDetached) {
                    $this->exceptions->record($booking->booking_series_id, $occurrenceStart);
                }

                $booking->series_detached = true;
            }

            $booking->save();

            $booking->setBlockedWorkplaceIds($result->blockedWorkplaceIds);

            return $booking->refresh();
        });
    }

    /**
     * Deletes a booking. For a series instance the cancelled occurrence stays
     * cancelled — otherwise it would come back on the next change to the series.
     */
    public function delete(Booking $booking): void
    {
        DB::transaction(function () use ($booking): void {
            $this->exceptions->recordFor($booking);

            $booking->delete();
        });
    }

    /** @throws BookingRuleException */
    private function check(BookingCandidate $candidate, Role $role): ValidationResult
    {
        $result = $this->validator->validate($candidate, $role, lockForUpdate: true);

        if (! $result->isValid()) {
            throw new BookingRuleException($result);
        }

        return $result;
    }
}
