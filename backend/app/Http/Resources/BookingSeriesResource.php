<?php

namespace App\Http\Resources;

use App\Models\BookingSeries;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin BookingSeries
 *
 * `firstInstanceStart` and `firstInstanceEnd` go out without a timezone — unlike
 * every other time in this API. They are wall-clock time, and an appended `Z`
 * would turn a series at 09:00 into one at 10:00 in winter.
 */
class BookingSeriesResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'workplaceId' => $this->workplace_id,
            'name' => $this->name,
            'contact' => $this->contact,
            'interval' => $this->interval,
            'intervalCount' => $this->interval_count,
            'firstInstanceStart' => self::wallClock($this->first_instance_start),
            'firstInstanceEnd' => self::wallClock($this->first_instance_end),
            'endDate' => $this->end_date?->toDateString(),
            'instantiatedUntil' => $this->instantiated_until->toDateString(),
        ];
    }

    /** "2026-08-03 09:00:00" becomes "2026-08-03T09:00", without converting. */
    private static function wallClock(string $value): string
    {
        return CarbonImmutable::parse($value)->format('Y-m-d\TH:i');
    }
}
