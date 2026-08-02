<?php

namespace App\Http\Resources;

use App\Models\Area;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Area */
class AreaResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'color' => $this->color,
            'maxBookingDurationMinutes' => $this->max_booking_duration_minutes,
            'maxBookingEndOffsetDays' => $this->max_booking_end_offset_days,
            'allowNightlyActivities' => $this->allow_nightly_activities,
            'sortOrder' => $this->sort_order,
        ];
    }
}
