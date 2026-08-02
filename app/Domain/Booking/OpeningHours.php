<?php

namespace App\Domain\Booking;

use App\Models\GlobalSetting;
use Carbon\CarbonImmutable;

/**
 * Die Öffnungszeiten als Wertobjekt. Rechnet konsequent in lokaler Zeit — die
 * Buchungen selbst sind UTC, aber "08:00 bis 21:00" ist eine Aussage über die
 * Wanduhr und muss über die Zeitumstellung hinweg gelten.
 */
final readonly class OpeningHours
{
    public function __construct(
        private string $opensAt,
        private string $closesAt,
        public string $timezone,
    ) {}

    public static function fromSettings(GlobalSetting $settings): self
    {
        return new self($settings->opens_at, $settings->closes_at, $settings->timezone);
    }

    /**
     * Die anrechenbare Dauer: nur die Zeit innerhalb der Öffnungszeiten. Die
     * Nachtstunden einer Buchung über Nacht zählen nicht mit — eine Buchung von
     * Freitag 20:00 bis Samstag 09:00 ergibt 120 Minuten.
     */
    public function chargeableMinutes(CarbonImmutable $start, CarbonImmutable $end): int
    {
        if ($end <= $start) {
            return 0;
        }

        $startLocal = $start->setTimezone($this->timezone);
        $endLocal = $end->setTimezone($this->timezone);

        $minutes = 0;
        $day = $startLocal->startOfDay();
        $lastDay = $endLocal->startOfDay();

        while ($day <= $lastDay) {
            $windowStart = $this->opensOn($day);
            $windowEnd = $this->closesOn($day);

            $overlapStart = $startLocal->greaterThan($windowStart) ? $startLocal : $windowStart;
            $overlapEnd = $endLocal->lessThan($windowEnd) ? $endLocal : $windowEnd;

            if ($overlapEnd > $overlapStart) {
                // diffInMinutes auf echten Zeitpunkten, damit eine Zeitumstellung
                // innerhalb des Fensters korrekt eingerechnet würde.
                $minutes += (int) $overlapStart->diffInMinutes($overlapEnd);
            }

            $day = $day->addDay()->startOfDay();
        }

        return $minutes;
    }

    /** Liegt der Zeitpunkt als Buchungsbeginn im offenen Bereich? */
    public function isValidStart(CarbonImmutable $instant): bool
    {
        $local = $instant->setTimezone($this->timezone);

        return $local >= $this->opensOn($local) && $local < $this->closesOn($local);
    }

    /** Ein Ende genau zur Schliesszeit ist erlaubt, ein Ende zur Öffnungszeit nicht. */
    public function isValidEnd(CarbonImmutable $instant): bool
    {
        $local = $instant->setTimezone($this->timezone);

        return $local > $this->opensOn($local) && $local <= $this->closesOn($local);
    }

    /**
     * Überspannt die Buchung eine Nacht? Gemessen an den lokalen Kalendertagen,
     * nicht an der verstrichenen Zeit.
     */
    public function spansNight(CarbonImmutable $start, CarbonImmutable $end): bool
    {
        return $start->setTimezone($this->timezone)->toDateString()
            !== $end->setTimezone($this->timezone)->toDateString();
    }

    public function today(): CarbonImmutable
    {
        return CarbonImmutable::now($this->timezone)->startOfDay();
    }

    private function opensOn(CarbonImmutable $localDay): CarbonImmutable
    {
        return $this->at($localDay, $this->opensAt);
    }

    private function closesOn(CarbonImmutable $localDay): CarbonImmutable
    {
        return $this->at($localDay, $this->closesAt);
    }

    private function at(CarbonImmutable $localDay, string $time): CarbonImmutable
    {
        [$hours, $minutes] = array_map(intval(...), explode(':', $time));

        // setTime setzt die Wanduhrzeit. Ein addHours() ab Mitternacht wäre falsch:
        // es addiert absolute Zeit und würde das Öffnungsfenster am Tag der
        // Zeitumstellung um eine Stunde verschieben.
        return $localDay->setTime($hours, $minutes);
    }
}
