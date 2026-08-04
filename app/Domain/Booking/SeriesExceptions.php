<?php

namespace App\Domain\Booking;

use App\Models\Booking;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * The beats at which a series should no longer generate anything.
 *
 * Two operations write here, and both mean the same thing: "there is already a
 * decision at this point of the rhythm". Deleting an instance means wanting the
 * occurrence gone; moving it means wanting it elsewhere — in both cases a
 * subsequently generated instance at the original time would be a regression.
 *
 * Deliberately a table of its own rather than a soft delete on `bookings`: a
 * cancelled occurrence left standing as a row would have to be filtered out in
 * every query — including in the collision check, the only place that bypasses
 * the model and goes through the query builder. A condition forgotten there would
 * block other people's workplaces with a booking nobody can see. This way the
 * exception has exactly one reader.
 */
final class SeriesExceptions
{
    /**
     * The exempted points in time of a series, as "Y-m-d H:i:s" in UTC — in the
     * form in which a beat can be compared directly.
     *
     * @return list<string>
     */
    public function cancelledAt(string $seriesId): array
    {
        return DB::table('booking_series_exceptions')
            ->where('booking_series_id', $seriesId)
            ->pluck('occurrence_start')
            ->map(fn (string $value): string => CarbonImmutable::parse($value)->toDateTimeString())
            ->all();
    }

    /**
     * Records that the series should no longer generate anything at this
     * instance's previous point in time. Does nothing if the booking belongs to no
     * series or the instance is already detached — in that case the exception has
     * been in place since the first intervention.
     */
    public function recordFor(Booking $booking): void
    {
        if ($booking->booking_series_id === null || $booking->series_detached) {
            return;
        }

        $this->record($booking->booking_series_id, $booking->start_time);
    }

    public function record(string $seriesId, CarbonImmutable $occurrenceStart): void
    {
        DB::table('booking_series_exceptions')->insertOrIgnore([
            'booking_series_id' => $seriesId,
            'occurrence_start' => $occurrenceStart->utc()->toDateTimeString(),
        ]);
    }
}
