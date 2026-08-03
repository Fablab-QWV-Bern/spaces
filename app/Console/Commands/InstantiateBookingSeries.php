<?php

namespace App\Console\Commands;

use App\Domain\Booking\SeriesWriter;
use App\Models\BookingSeries;
use Illuminate\Console\Command;

/**
 * Schiebt den Horizont aller Serien täglich wieder auf ein Jahr vor.
 *
 * Jede Serie läuft in ihrer eigenen Transaktion: eine, deren Instanzen alle
 * kollidieren, soll die übrigen nicht aufhalten, und ein Abbruch mittendrin
 * lässt keine halb erzeugte Serie zurück — `instantiated_until` wandert erst
 * mit dem Commit.
 */
class InstantiateBookingSeries extends Command
{
    protected $signature = 'booking-series:instantiate';

    protected $description = 'Erzeugt die Instanzen aller Buchungsserien bis ein Jahr im Voraus';

    public function handle(SeriesWriter $writer): int
    {
        $created = 0;
        $skipped = 0;

        BookingSeries::query()->orderBy('id')->each(function (BookingSeries $series) use ($writer, &$created, &$skipped): void {
            $before = $series->bookings()->count();
            $gaps = $writer->extend($series);

            $created += $series->bookings()->count() - $before;
            $skipped += count($gaps);
        });

        $this->info("Serien instanziert: {$created} Buchungen erzeugt, {$skipped} wegen Belegung ausgelassen.");

        return self::SUCCESS;
    }
}
