<?php

namespace App\Http\Resources;

use App\Models\GlobalSetting;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin GlobalSetting */
class ConfigResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            // MariaDB liefert TIME als "08:00:00", die API will "08:00".
            'opensAt' => substr($this->opens_at, 0, 5),
            'closesAt' => substr($this->closes_at, 0, 5),
            'maxBookingEndOffsetDays' => $this->max_booking_end_offset_days,
            'timezone' => $this->timezone,
        ];
    }
}
