<?php

namespace App\Domain\Booking;

use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Findet Buchungen, die mit einer neuen oder geänderten Buchung kollidieren.
 *
 * Eine Kollision liegt vor, wenn sich die Zeiträume überschneiden UND mindestens
 * eine der drei Bedingungen gilt:
 *
 *   1. gleicher Arbeitsplatz
 *   2. der Arbeitsplatz der neuen Buchung steht im Snapshot der bestehenden
 *   3. der Arbeitsplatz der bestehenden Buchung steht im Snapshot der neuen
 *
 * Zwei Buchungen, die denselben dritten Arbeitsplatz blockieren, kollidieren
 * damit bewusst NICHT miteinander — blockiert ist nur der dritte.
 */
final class CollisionChecker
{
    public function __construct(private readonly BlockedWorkplaceResolver $resolver) {}

    /**
     * @param  list<string>|null  $blockedWorkplaceIds  Snapshot der neuen Buchung;
     *                                                  wird sonst frisch aufgelöst.
     * @return list<string> IDs der kollidierenden Buchungen
     */
    public function conflictingBookingIds(
        string $workplaceId,
        CarbonImmutable $startTime,
        CarbonImmutable $endTime,
        ?string $excludeBookingId = null,
        ?array $blockedWorkplaceIds = null,
    ): array {
        return $this
            ->query($workplaceId, $startTime, $endTime, $excludeBookingId, $blockedWorkplaceIds)
            ->orderBy('start_time')
            ->pluck('id')
            ->all();
    }

    /**
     * Wie conflictingBookingIds, sperrt die geprüften Zeilen aber bis zum Ende der
     * Transaktion. InnoDB setzt dabei auch Gap-Locks auf den durchsuchten Bereich,
     * sodass parallel keine kollidierende Buchung dazwischengeschoben werden kann.
     *
     * Muss innerhalb einer Transaktion aufgerufen werden — sonst ist die Sperre
     * sofort wieder weg.
     *
     * @param  list<string>|null  $blockedWorkplaceIds
     * @return list<string>
     */
    public function conflictingBookingIdsForUpdate(
        string $workplaceId,
        CarbonImmutable $startTime,
        CarbonImmutable $endTime,
        ?string $excludeBookingId = null,
        ?array $blockedWorkplaceIds = null,
    ): array {
        if (DB::transactionLevel() === 0) {
            throw new \LogicException(
                'conflictingBookingIdsForUpdate muss innerhalb einer Transaktion laufen.',
            );
        }

        return $this
            ->query($workplaceId, $startTime, $endTime, $excludeBookingId, $blockedWorkplaceIds)
            ->lockForUpdate()
            ->orderBy('start_time')
            ->pluck('id')
            ->all();
    }

    /** @param  list<string>|null  $blockedWorkplaceIds */
    private function query(
        string $workplaceId,
        CarbonImmutable $startTime,
        CarbonImmutable $endTime,
        ?string $excludeBookingId,
        ?array $blockedWorkplaceIds,
    ): Builder {
        $blocked = $blockedWorkplaceIds ?? $this->resolver->resolve($workplaceId);

        $query = DB::table('bookings')
            // Halboffener Vergleich: 10:00–11:00 kollidiert nicht mit 11:00–12:00.
            ->where('start_time', '<', $endTime)
            ->where('end_time', '>', $startTime)
            ->where(function (Builder $query) use ($workplaceId, $blocked): void {
                $query
                    ->where('workplace_id', $workplaceId)
                    ->orWhereExists(function (Builder $query) use ($workplaceId): void {
                        $query->select(DB::raw(1))
                            ->from('booking_blocked_workplaces')
                            ->whereColumn('booking_blocked_workplaces.booking_id', 'bookings.id')
                            ->where('booking_blocked_workplaces.workplace_id', $workplaceId);
                    });

                if ($blocked !== []) {
                    $query->orWhereIn('workplace_id', $blocked);
                }
            });

        if ($excludeBookingId !== null) {
            // Beim Ändern kollidiert die Buchung nicht mit sich selbst.
            $query->where('id', '!=', $excludeBookingId);
        }

        return $query;
    }
}
