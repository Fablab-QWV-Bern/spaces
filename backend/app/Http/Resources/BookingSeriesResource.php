<?php

namespace App\Http\Resources;

use App\Models\BookingSeries;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin BookingSeries
 *
 * `firstInstanceStart` und `firstInstanceEnd` gehen ohne Zeitzonenangabe hinaus —
 * anders als jede andere Zeit in dieser API. Sie sind Wanduhrzeit, und ein
 * angehängtes `Z` machte aus einer Serie um 09:00 im Winter eine um 10:00.
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

    /** "2026-08-03 09:00:00" wird zu "2026-08-03T09:00", ohne dabei umzurechnen. */
    private static function wallClock(string $value): string
    {
        return CarbonImmutable::parse($value)->format('Y-m-d\TH:i');
    }
}
