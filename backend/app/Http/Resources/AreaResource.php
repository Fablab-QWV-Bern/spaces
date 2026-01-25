<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AreaResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'color' => $this->color,
            'maxBookingDurationMinutes' => $this->max_booking_duration_minutes,
            'maxBookingEndOffsetDays' => $this->max_booking_end_offset_days,
            'sortOrder' => $this->sort_order,
        ];
    }
}
