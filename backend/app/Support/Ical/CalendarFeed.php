<?php

namespace App\Support\Ical;

use App\Models\Booking;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Buchungen als iCalendar-Dokument, wie es Kalenderclients abonnieren.
 *
 * Je Buchung ein VEVENT. Serieninstanzen sind eigene Buchungen und damit eigene
 * Ereignisse mit eigener UID — bewusst kein RRULE: eine Instanz ist ein
 * Zeitpunkt in der Datenbank, und eine geänderte Serie wirft ihre künftigen
 * Instanzen ohnehin weg und legt sie neu an. Der Feed muss von Serien nichts
 * wissen.
 *
 * Die Zeiten stehen in UTC (Form „…Z"). Lokalzeit mit TZID verlangte eine
 * mitgelieferte VTIMEZONE-Komponente mitsamt Umstellungsregeln; die braucht
 * nur, wer RRULE schreibt.
 */
final class CalendarFeed
{
    private const FORMAT = 'Ymd\THis\Z';

    /**
     * @param  Collection<int, Booking>  $bookings  mit geladenem workplace.area
     * @param  string  $host  für die UID — sie muss weltweit eindeutig sein
     * @param  bool  $withContact  ob die Rolle den Kontakt sehen darf
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
            // Beides sagt dasselbe; die Clients lesen mal das eine, mal das andere.
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
