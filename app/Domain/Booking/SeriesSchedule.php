<?php

namespace App\Domain\Booking;

use App\Models\BookingSeries;
use Carbon\CarbonImmutable;
use InvalidArgumentException;

/**
 * Works out when a series takes place.
 *
 * Everything is computed in local wall-clock time and only converted to UTC at
 * the end. That is the only way a weekly series at 09:00 stays at 09:00 across a
 * DST change — adding to UTC timestamps would shift it by an hour twice a year.
 */
final readonly class SeriesSchedule
{
    public function __construct(
        /** One of the BookingSeries::INTERVAL_* values. */
        private string $interval,
        private int $intervalCount,
        /** Local wall-clock time of the first instance. */
        private CarbonImmutable $firstStart,
        /** Local wall-clock time of the first instance; may fall on the following day. */
        private CarbonImmutable $firstEnd,
        /** Last day on which the series may take place; null means unbounded. */
        private ?CarbonImmutable $endDate,
        private string $timezone,
    ) {}

    public static function forSeries(BookingSeries $series, string $timezone): self
    {
        return new self(
            $series->interval,
            $series->interval_count,
            $series->firstInstanceStartIn($timezone),
            $series->firstInstanceEndIn($timezone),
            $series->end_date === null
                ? null
                : CarbonImmutable::parse($series->end_date->toDateString(), $timezone),
            $timezone,
        );
    }

    /**
     * The occurrences whose date lies between `$firstDay` and `$lastDay` (both
     * inclusive) and that do not start before `$notBefore`.
     *
     * @param  CarbonImmutable  $firstDay  Local day, inclusive
     * @param  CarbonImmutable  $lastDay  Local day, inclusive
     * @param  CarbonImmutable  $notBefore  UTC point in time
     * @return list<SeriesOccurrence>
     */
    public function occurrencesBetween(
        CarbonImmutable $firstDay,
        CarbonImmutable $lastDay,
        CarbonImmutable $notBefore,
    ): array {
        $firstDay = $firstDay->startOfDay();
        $lastDay = $lastDay->startOfDay();

        if ($this->endDate !== null && $this->endDate < $lastDay) {
            $lastDay = $this->endDate->startOfDay();
        }

        // How many calendar days after the start the instance ends — one for an
        // overnight booking, none otherwise.
        $nightsSpanned = (int) $this->firstStart->startOfDay()
            ->diffInDays($this->firstEnd->startOfDay());

        $occurrences = [];

        // Counting starts at the first instance, even if it lies far in the past:
        // a series running for years costs a few thousand loop iterations without a
        // single query. That is cheaper than a second calculation deriving the
        // entry point, which can be off by one for MONTHLY.
        for ($n = 0; ; $n++) {
            $date = $this->dateOf($n);

            if ($date === null) {
                // A skipped month (e.g. the 31st in February). Whether the series
                // ends here is decided by the month itself.
                if ($this->monthOf($n) > $lastDay) {
                    break;
                }

                continue;
            }

            if ($date > $lastDay) {
                break;
            }

            if ($date < $firstDay) {
                continue;
            }

            $start = $this->at($date, $this->firstStart);
            $end = $this->at($date->addDays($nightsSpanned), $this->firstEnd);

            if ($start->utc() < $notBefore) {
                continue;
            }

            $occurrences[] = new SeriesOccurrence($start->utc(), $end->utc());
        }

        return $occurrences;
    }

    /** The first instance, regardless of window and end date. */
    public function firstOccurrence(): SeriesOccurrence
    {
        return new SeriesOccurrence($this->firstStart->utc(), $this->firstEnd->utc());
    }

    /** The local date of the n-th instance; null if that occurrence drops out. */
    private function dateOf(int $n): ?CarbonImmutable
    {
        $step = $n * $this->intervalCount;

        return match ($this->interval) {
            BookingSeries::INTERVAL_WEEKLY => $this->firstStart->startOfDay()->addWeeks($step),
            // MONTHLY means the same day of the month. Months without that day
            // drop out — not slid onto the 28th, but skipped.
            BookingSeries::INTERVAL_MONTHLY => $this->firstStart->day > $this->monthOf($n)->daysInMonth
                ? null
                : $this->monthOf($n)->day($this->firstStart->day),
            default => throw new InvalidArgumentException("Unknown interval: {$this->interval}"),
        };
    }

    private function monthOf(int $n): CarbonImmutable
    {
        return $this->firstStart->startOfDay()->startOfMonth()
            ->addMonths($n * $this->intervalCount);
    }

    /** Puts the wall-clock time of `$time` onto the local day `$day`. */
    private function at(CarbonImmutable $day, CarbonImmutable $time): CarbonImmutable
    {
        return $day->setTime($time->hour, $time->minute);
    }
}
