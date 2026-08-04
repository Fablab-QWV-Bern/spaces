<?php

namespace App\Http\Resources;

use App\Models\Booking;
use App\Support\CurrentRole;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Booking
 *
 * Enforces the visibility rules of the spec: the name is already visible with
 * `viewBookings` (which is needed to reach this endpoint anyway), the contact only
 * with `viewBookingsDetails`, the IP address only with `manageRoles`. `contact`
 * stays in the schema and is set to null rather than disappearing — otherwise the
 * client would have to distinguish two shapes.
 */
class BookingResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $role = app(CurrentRole::class);

        return [
            'id' => $this->id,
            'creatorRoleId' => $this->creator_role_id,
            'ipAddress' => $role->can('manageRoles') ? $this->ip_address : null,
            'createdAt' => $this->created_at?->toIso8601ZuluString(),
            'workplaceId' => $this->workplace_id,
            'blockedWorkplaceIds' => $this->blockedWorkplaceIds(),
            'name' => $this->name,
            'contact' => $role->can('viewBookingsDetails') ? $this->contact : null,
            'usageRulesAcknowledged' => $this->usage_rules_acknowledged,
            'startTime' => $this->start_time->toIso8601ZuluString(),
            'endTime' => $this->end_time->toIso8601ZuluString(),
            'chargeableDurationMinutes' => $this->chargeable_duration_minutes,
            'bookingSeriesId' => $this->booking_series_id,
            'seriesDetached' => (bool) $this->series_detached,
        ];
    }
}
