<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BookingResource extends JsonResource
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
            'creatorRoleId' => $this->creator_role_id,
            'workplaceId' => $this->workplace_id,
            'name' => $this->name,
            'contact' => $this->contact,
            'startTime' => $this->start_time,
            'endTime' => $this->end_time,
            'bookingSeriesId' => $this->booking_series_id,
        ];
    }
}
