<?php

namespace App\Domain\Booking;

use App\Models\BookingSeries;
use Carbon\CarbonImmutable;
use InvalidArgumentException;

/**
 * Rechnet aus, wann eine Serie stattfindet.
 *
 * Gerechnet wird durchgehend in lokaler Wanduhrzeit und erst am Schluss nach UTC
 * umgerechnet. Nur so bleibt eine wöchentliche Serie um 09:00 über die
 * Zeitumstellung hinweg um 09:00 — addierte man UTC-Zeitpunkte, verschöbe sie
 * sich zweimal im Jahr um eine Stunde.
 */
final readonly class SeriesSchedule
{
    public function __construct(
        /** Einer der BookingSeries::INTERVAL_*-Werte. */
        private string $interval,
        private int $intervalCount,
        /** Lokale Wanduhrzeit der ersten Instanz. */
        private CarbonImmutable $firstStart,
        /** Lokale Wanduhrzeit der ersten Instanz; darf am Folgetag liegen. */
        private CarbonImmutable $firstEnd,
        /** Letzter Tag, an dem die Serie stattfinden darf; null heisst unbegrenzt. */
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
     * Die Termine, deren Datum zwischen `$firstDay` und `$lastDay` liegt (beide
     * einschliesslich) und die nicht vor `$notBefore` beginnen.
     *
     * @param  CarbonImmutable  $firstDay  Lokaler Tag, einschliesslich
     * @param  CarbonImmutable  $lastDay  Lokaler Tag, einschliesslich
     * @param  CarbonImmutable  $notBefore  UTC-Zeitpunkt
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

        // Wie viele Kalendertage nach dem Beginn die Instanz endet — bei einer
        // Buchung über Nacht einer, sonst keiner.
        $nightsSpanned = (int) $this->firstStart->startOfDay()
            ->diffInDays($this->firstEnd->startOfDay());

        $occurrences = [];

        // Gezählt wird ab der ersten Instanz, auch wenn sie lange zurückliegt:
        // eine seit Jahren laufende Serie kostet ein paar tausend Schleifendurchläufe
        // ohne eine einzige Abfrage. Das ist billiger als eine zweite Rechnung, die
        // den Einstiegspunkt herleitet und bei MONTHLY danebenliegen kann.
        for ($n = 0; ; $n++) {
            $date = $this->dateOf($n);

            if ($date === null) {
                // Ein übersprungener Monat (z.B. der 31. im Februar). Ob die Serie
                // damit zu Ende ist, entscheidet der Monat selbst.
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

    /** Die erste Instanz, ohne Rücksicht auf Fenster und Endtag. */
    public function firstOccurrence(): SeriesOccurrence
    {
        return new SeriesOccurrence($this->firstStart->utc(), $this->firstEnd->utc());
    }

    /** Das lokale Datum der n-ten Instanz; null, wenn dieser Termin ausfällt. */
    private function dateOf(int $n): ?CarbonImmutable
    {
        $step = $n * $this->intervalCount;

        return match ($this->interval) {
            BookingSeries::INTERVAL_WEEKLY => $this->firstStart->startOfDay()->addWeeks($step),
            // MONTHLY meint denselben Tag im Monat. Monate, die diesen Tag nicht
            // haben, fallen aus — nicht auf den 28. gerutscht, sondern übersprungen.
            BookingSeries::INTERVAL_MONTHLY => $this->firstStart->day > $this->monthOf($n)->daysInMonth
                ? null
                : $this->monthOf($n)->day($this->firstStart->day),
            default => throw new InvalidArgumentException("Unbekanntes Intervall: {$this->interval}"),
        };
    }

    private function monthOf(int $n): CarbonImmutable
    {
        return $this->firstStart->startOfDay()->startOfMonth()
            ->addMonths($n * $this->intervalCount);
    }

    /** Setzt die Wanduhrzeit von `$time` auf den lokalen Tag `$day`. */
    private function at(CarbonImmutable $day, CarbonImmutable $time): CarbonImmutable
    {
        return $day->setTime($time->hour, $time->minute);
    }
}
