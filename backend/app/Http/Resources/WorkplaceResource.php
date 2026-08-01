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

    /**
     * Bewusst ohne Schema und Host: API, Ablage und SPA liegen auf demselben
     * Host. Eine absolute URL käme aus APP_URL, und ein falsch gesetztes APP_URL
     * auf dem Hosting würde jedes Foto auf einmal unerreichbar machen.
     */
    private function url(?string $path): ?string
    {
        if ($path === null) {
            return null;
        }

        return parse_url(Storage::disk('public')->url($path), PHP_URL_PATH);
    }
}
