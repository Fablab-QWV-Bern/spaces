<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class WorkplaceResource extends JsonResource
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
            'description' => $this->description,
            'status' => $this->status,
            'location' => $this->location,
            'areaId' => $this->area_id, // Critical fix: camelCase
            'wikiUrl' => $this->wiki_url,
            'maxBookingDurationMinutes' => $this->max_booking_duration_minutes,
            'sortOrder' => $this->sort_order,
            'blocksWorkplaceIds' => $this->blocks_workplace_ids,
            'blocksWorkplacesWithTag' => $this->blocks_workplaces_with_tag,
            'tags' => $this->tags,
        ];
    }
}
