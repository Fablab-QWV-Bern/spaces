<?php

namespace App\Http\Resources;

use App\Models\Booking;
use App\Support\CurrentRole;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Booking
 *
 * Setzt die Sichtbarkeitsregeln der Spec durch: Name und Kontakt nur mit
 * `viewBookingsDetails`, die IP-Adresse nur mit `manageRoles`. Beide Felder
 * bleiben im Schema und werden auf null gesetzt, statt zu verschwinden — sonst
 * müsste der Client zwei Formen unterscheiden.
 */
class BookingResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $role = app(CurrentRole::class);
        $seesDetails = $role->can('viewBookingsDetails');

        return [
            'id' => $this->id,
            'creatorRoleId' => $this->creator_role_id,
            'ipAddress' => $role->can('manageRoles') ? $this->ip_address : null,
            'createdAt' => $this->created_at?->toIso8601ZuluString(),
            'workplaceId' => $this->workplace_id,
            'blockedWorkplaceIds' => $this->blockedWorkplaceIds(),
            'name' => $seesDetails ? $this->name : null,
            'contact' => $seesDetails ? $this->contact : null,
            'usageRulesAcknowledged' => $this->usage_rules_acknowledged,
            'startTime' => $this->start_time->toIso8601ZuluString(),
            'endTime' => $this->end_time->toIso8601ZuluString(),
            'chargeableDurationMinutes' => $this->chargeable_duration_minutes,
            'bookingSeriesId' => $this->booking_series_id,
        ];
    }
}
