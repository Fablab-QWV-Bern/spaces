<?php

namespace App\Domain\Booking;

use App\Models\Booking;
use App\Models\Role;
use Illuminate\Support\Facades\DB;

/**
 * Legt Buchungen an und ändert sie. Prüfung und Schreiben laufen in einer
 * Transaktion mit Sperre auf den betroffenen Zeilen — nur so können zwei
 * gleichzeitige Anfragen nicht beide durchkommen.
 */
final class BookingWriter
{
    public function __construct(private readonly BookingValidator $validator) {}

    /**
     * @param  array{name: string, contact: string}  $booker
     *
     * @throws BookingRuleException
     */
    public function create(
        BookingCandidate $candidate,
        Role $role,
        array $booker,
        ?string $ipAddress = null,
    ): Booking {
        return DB::transaction(function () use ($candidate, $role, $booker, $ipAddress): Booking {
            $result = $this->check($candidate, $role);

            $booking = Booking::create([
                'creator_role_id' => $role->id,
                'ip_address' => $ipAddress,
                'workplace_id' => $candidate->workplaceId,
                'name' => $booker['name'],
                'contact' => $booker['contact'],
                'usage_rules_acknowledged' => $candidate->usageRulesAcknowledged,
                'start_time' => $candidate->startTime,
                'end_time' => $candidate->endTime,
                'chargeable_duration_minutes' => $result->chargeableDurationMinutes,
            ]);

            // Der Snapshot wird aus dem Prüfergebnis übernommen, nicht neu
            // aufgelöst — sonst könnte sich zwischen Prüfung und Schreiben etwas
            // ändern.
            $booking->setBlockedWorkplaceIds($result->blockedWorkplaceIds);

            return $booking;
        });
    }

    /**
     * @param  array{name: string, contact: string}  $booker
     *
     * @throws BookingRuleException
     */
    public function update(
        Booking $booking,
        BookingCandidate $candidate,
        Role $role,
        array $booker,
    ): Booking {
        return DB::transaction(function () use ($booking, $candidate, $role, $booker): Booking {
            $result = $this->check($candidate, $role);

            $booking->update([
                'workplace_id' => $candidate->workplaceId,
                'name' => $booker['name'],
                'contact' => $booker['contact'],
                'usage_rules_acknowledged' => $candidate->usageRulesAcknowledged,
                'start_time' => $candidate->startTime,
                'end_time' => $candidate->endTime,
                'chargeable_duration_minutes' => $result->chargeableDurationMinutes,
            ]);

            $booking->setBlockedWorkplaceIds($result->blockedWorkplaceIds);

            return $booking->refresh();
        });
    }

    /** @throws BookingRuleException */
    private function check(BookingCandidate $candidate, Role $role): ValidationResult
    {
        $result = $this->validator->validate($candidate, $role, lockForUpdate: true);

        if (! $result->isValid()) {
            throw new BookingRuleException($result);
        }

        return $result;
    }
}
