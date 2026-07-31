<?php

namespace App\Http\Resources;

use App\Models\Booking;
use App\Support\CurrentRole;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Booking
 *
 * Setzt die Sichtbarkeitsregeln der Spec durch: der Name ist bereits mit
 * `viewBookings` sichtbar (das braucht es sowieso, um diesen Endpunkt zu
 * erreichen), der Kontakt erst mit `viewBookingsDetails`, die IP-Adresse nur
 * mit `manageRoles`. `contact` bleibt im Schema und wird auf null gesetzt,
 * statt zu verschwinden — sonst müsste der Client zwei Formen unterscheiden.
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
        ];
    }
}
