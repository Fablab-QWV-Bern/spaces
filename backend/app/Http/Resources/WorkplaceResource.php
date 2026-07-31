<?php

namespace App\Http\Resources;

use App\Models\Workplace;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

/** @mixin Workplace */
class WorkplaceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            'usageRules' => $this->usage_rules,
            'photoUrl' => $this->url($this->photo_path),
            'photoThumbnailUrl' => $this->url($this->photo_thumbnail_path),
            'status' => $this->status,
            'location' => $this->location,
            'areaId' => $this->area_id,
            'wikiUrl' => $this->wiki_url,
            'maxBookingDurationMinutes' => $this->max_booking_duration_minutes,
            'blocksWorkplaceIds' => $this->blocksWorkplaces->modelKeys(),
            'blocksWorkplacesWithTag' => $this->blocksWorkplacesWithTag(),
            'tags' => $this->tags(),
            'sortOrder' => $this->sort_order,
        ];
    }

    private function url(?string $path): ?string
    {
        return $path === null ? null : Storage::disk('public')->url($path);
    }
}
