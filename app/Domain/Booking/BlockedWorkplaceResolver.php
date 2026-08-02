<?php

namespace App\Domain\Booking;

use Illuminate\Support\Facades\DB;

/**
 * Löst auf, welche Arbeitsplätze eine Buchung auf einem gegebenen Arbeitsplatz
 * mitblockiert — die Vereinigung aus der expliziten ID-Liste und den per Tag
 * getroffenen Arbeitsplätzen.
 *
 * Das Ergebnis wird beim Erstellen bzw. Ändern der Buchung als Snapshot
 * festgehalten. Spätere Änderungen an Blockierungen oder Tags berühren
 * bestehende Buchungen deshalb nicht.
 */
final class BlockedWorkplaceResolver
{
    /** @return list<string> */
    public function resolve(string $workplaceId): array
    {
        $explicit = DB::table('workplace_blocks_workplaces')
            ->where('workplace_id', $workplaceId)
            ->pluck('blocked_workplace_id');

        // Der Vergleich der Tags läuft über die Kollation der Spalten und ist
        // damit case-insensitiv, wie in der Spec verlangt.
        $byTag = DB::table('workplace_blocks_tags as rule')
            ->join('workplace_tags as tagged', 'tagged.tag', '=', 'rule.tag')
            ->where('rule.workplace_id', $workplaceId)
            ->pluck('tagged.workplace_id');

        $ids = $explicit->merge($byTag)
            ->unique()
            // Der eigene Arbeitsplatz gehört nicht in die Liste.
            ->reject(fn (string $id): bool => $id === $workplaceId)
            ->values()
            ->all();

        sort($ids);

        return $ids;
    }
}
