<?php

namespace App\Support\Ical;

use App\Models\Booking;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Bookings as an iCalendar document, the way calendar clients subscribe to it.
 *
 * One VEVENT per booking. Series instances are bookings of their own and
 * therefore events of their own with their own UID — deliberately no RRULE: an
 * instance is a point in time in the database, and a changed series reconciles
 * its future instances anyway. The feed needs to know nothing about series.
 *
 * The times are in UTC (the "…Z" form). Local time with TZID would require an
 * accompanying VTIMEZONE component including the transition rules; only whoever
 * writes RRULE needs that.
 */
final class CalendarFeed
{
    private const FORMAT = 'Ymd\THis\Z';

    /**
     * @param  Collection<int, Booking>  $bookings  with workplace.area eager-loaded
     * @param  string  $host  for the UID — it has to be globally unique
     * @param  bool  $withContact  whether the role may see the contact
     */
    public function render(Collection $bookings, string $title, string $host, bool $withContact): string
    {
        $document = (new IcalDocument)
            ->begin('VCALENDAR')
            ->raw('PRODID', '-//Quartierwerkstatt Viktoria//Reservationssystem//DE')
            ->raw('VERSION', '2.0')
            ->raw('CALSCALE', 'GREGORIAN')
            ->raw('METHOD', 'PUBLISH')
            ->text('X-WR-CALNAME', $title)
            // Both say the same thing; clients read sometimes one, sometimes the other.
            ->raw('REFRESH-INTERVAL', 'PT1H', ['VALUE' => 'DURATION'])
            ->raw('X-PUBLISHED-TTL', 'PT1H');

        $stamp = CarbonImmutable::now()->utc()->format(self::FORMAT);

        foreach ($bookings as $booking) {
            $this->event($document, $booking, $stamp, $host, $withContact);
        }

        return $document->end('VCALENDAR')->render();
    }

    private function event(
        IcalDocument $document,
        Booking $booking,
        string $stamp,
        string $host,
        bool $withContact,
    ): void {
        $workplace = $booking->workplace;

        $document
            ->begin('VEVENT')
            ->raw('UID', "{$booking->id}@{$host}")
            ->raw('DTSTAMP', $stamp)
            ->raw('LAST-MODIFIED', ($booking->updated_at ?? $booking->start_time)->utc()->format(self::FORMAT))
            ->raw('DTSTART', $booking->start_time->utc()->format(self::FORMAT))
            ->raw('DTEND', $booking->end_time->utc()->format(self::FORMAT))
            ->text('SUMMARY', "{$workplace->name}: {$booking->name}")
            ->text('LOCATION', $workplace->location ?: "{$workplace->name} ({$workplace->area->name})");

        if ($withContact && $booking->contact !== null && $booking->contact !== '') {
            $document->text('DESCRIPTION', $booking->contact);
        }

        $document
            ->raw('SEQUENCE', '0')
            ->raw('STATUS', 'CONFIRMED')
            ->end('VEVENT');
    }
}
