<?php

namespace App\Domain\Booking;

use App\Models\GlobalSetting;
use Carbon\CarbonImmutable;

/**
 * The opening hours as a value object. Computes consistently in local time — the
 * bookings themselves are UTC, but "08:00 to 21:00" is a statement about the wall
 * clock and has to hold across a DST change.
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
     * The chargeable duration: only the time within the opening hours. The night
     * hours of an overnight booking do not count — a booking from Friday 20:00 to
     * Saturday 09:00 comes to 120 minutes.
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
                // diffInMinutes on real instants, so that a DST change inside
                // the window would be accounted for correctly.
                $minutes += (int) $overlapStart->diffInMinutes($overlapEnd);
            }

            $day = $day->addDay()->startOfDay();
        }

        return $minutes;
    }

    /** Does this instant, as a booking start, fall inside the open window? */
    public function isValidStart(CarbonImmutable $instant): bool
    {
        $local = $instant->setTimezone($this->timezone);

        return $local >= $this->opensOn($local) && $local < $this->closesOn($local);
    }

    /** An end exactly at closing time is allowed, an end at opening time is not. */
    public function isValidEnd(CarbonImmutable $instant): bool
    {
        $local = $instant->setTimezone($this->timezone);

        return $local > $this->opensOn($local) && $local <= $this->closesOn($local);
    }

    /**
     * Does the booking span a night? Measured by the local calendar days, not by
     * the elapsed time.
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

        // setTime sets the wall-clock time. An addHours() from midnight would be
        // wrong: it adds absolute time and would shift the opening window by an
        // hour on the day of a DST change.
        return $localDay->setTime($hours, $minutes);
    }
}
