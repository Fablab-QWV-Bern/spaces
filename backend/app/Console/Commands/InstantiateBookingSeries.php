<?php

namespace App\Console\Commands;

use App\Domain\Booking\SeriesWriter;
use App\Models\BookingSeries;
use Illuminate\Console\Command;

/**
 * Pushes the horizon of all series back out to a year, daily.
 *
 * Every series runs in its own transaction: one whose instances all collide
 * should not hold up the rest, and an abort halfway through leaves no
 * half-generated series behind — `instantiated_until` only moves with the commit.
 */
class InstantiateBookingSeries extends Command
{
    protected $signature = 'booking-series:instantiate';

    protected $description = 'Generates the instances of all booking series up to a year ahead';

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

        $this->info("Series instantiated: {$created} bookings created, {$skipped} left out due to occupancy.");

        return self::SUCCESS;
    }
}
