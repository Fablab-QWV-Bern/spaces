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
    public function __construct(
        private readonly BookingValidator $validator,
        private readonly SeriesExceptions $exceptions,
    ) {}

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

            // Vor dem Füllen festgehalten: danach steht in start_time die neue
            // Zeit, der Takt-Zeitpunkt wäre dann nicht mehr zu haben.
            $occurrenceStart = $booking->start_time;
            $wasDetached = (bool) $booking->series_detached;

            $booking->fill([
                'workplace_id' => $candidate->workplaceId,
                'name' => $booker['name'],
                'contact' => $booker['contact'],
                'usage_rules_acknowledged' => $candidate->usageRulesAcknowledged,
                'start_time' => $candidate->startTime,
                'end_time' => $candidate->endTime,
                'chargeable_duration_minutes' => $result->chargeableDurationMinutes,
            ]);

            // Wer eine Serieninstanz von Hand ändert, koppelt sie ab: das nächste
            // Bearbeiten der Serie lässt sie danach stehen. Nur bei einer echten
            // Änderung — ein Formular, das man öffnet und ungeändert speichert,
            // soll den Termin nicht für immer festnageln.
            if ($booking->booking_series_id !== null && $booking->isDirty()) {
                if (! $wasDetached) {
                    $this->exceptions->record($booking->booking_series_id, $occurrenceStart);
                }

                $booking->series_detached = true;
            }

            $booking->save();

            $booking->setBlockedWorkplaceIds($result->blockedWorkplaceIds);

            return $booking->refresh();
        });
    }

    /**
     * Löscht eine Buchung. Bei einer Serieninstanz bleibt der gestrichene Termin
     * gestrichen — sonst käme er beim nächsten Ändern der Serie zurück.
     */
    public function delete(Booking $booking): void
    {
        DB::transaction(function () use ($booking): void {
            $this->exceptions->recordFor($booking);

            $booking->delete();
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
