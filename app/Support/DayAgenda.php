<?php

namespace App\Support;

use App\Models\Booking;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection;

/**
 * A day's bookings as "Belegungen heute" lists them: a running "Jetzt belegt" first,
 * then one group per part of the day something starts in — the server-side twin
 * of the frontend's `map/agenda.ts`, shared by `/agenda` and `/tafel`.
 */
class DayAgenda
{
    /**
     * The parts of the day, latest first so the first match walking down wins.
     * The cuts sit at noon and at five — five is when the workshop fills up with
     * whoever has finished work (see `map/agenda.ts`).
     */
    private const PARTS = [
        ['from' => 17, 'heading' => 'Abend'],
        ['from' => 12, 'heading' => 'Nachmittag'],
        ['from' => 0, 'heading' => 'Vormittag'],
    ];

    /**
     * The bookings in groups. A part with nothing in it opens no heading.
     *
     * @param  Collection<int, Booking>  $bookings
     * @return list<array{heading: string, running: bool, entries: list<array{where: string, when: string, who: string, areaId: ?string, workplaceId: string}>}>
     */
    public static function group(
        Collection $bookings,
        CarbonImmutable $now,
        CarbonImmutable $day,
        string $timezone,
    ): array {
        $running = [];
        $ahead = [];

        foreach ($bookings as $booking) {
            $start = $booking->start_time->setTimezone($timezone);
            $end = $booking->end_time->setTimezone($timezone);

            $entry = [
                'where' => $booking->workplace?->name ?? $booking->workplace_id,
                // Narrow no-break spaces around the dash: the times stay apart
                // without the range ever breaking across two lines.
                'when' => $start->format('H:i')."\u{202F}–\u{202F}".$end->format('H:i'),
                'who' => $booking->name,
                // For a mark in the area's colour; the colour itself is the
                // caller's business, since only /tafel shows it.
                'areaId' => $booking->workplace?->area_id,
                // For /tafel to find the bench a row belongs to, and back.
                'workplaceId' => $booking->workplace_id,
            ];

            if ($booking->start_time <= $now && $booking->end_time > $now) {
                $running[] = $entry;

                continue;
            }

            // A booking carried over from the night before belongs to the
            // morning of this day, not to the evening it began in.
            $ahead[self::partOfDay((int) $start->max($day)->format('G'))][] = $entry;
        }

        $groups = $running === [] ? [] : [['heading' => 'Jetzt belegt', 'running' => true, 'entries' => $running]];

        foreach (array_reverse(self::PARTS) as $part) {
            if (! empty($ahead[$part['heading']])) {
                $groups[] = ['heading' => $part['heading'], 'running' => false, 'entries' => $ahead[$part['heading']]];
            }
        }

        return $groups;
    }

    /** The last part of the day that has already begun at this hour. */
    private static function partOfDay(int $hour): string
    {
        foreach (self::PARTS as $part) {
            if ($hour >= $part['from']) {
                return $part['heading'];
            }
        }

        return self::PARTS[array_key_last(self::PARTS)]['heading'];
    }
}
