<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\GlobalSetting;
use App\Models\Role;
use App\Models\Workplace;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\View\View;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;

/**
 * The agenda — "Belegungen heute" — as a standalone page for embedding: the
 * column that sits beside the overview map (frontend `map/agenda.ts`), without
 * the map.
 *
 * Today's bookings that have not yet ended, grouped into "Aktuell" and the part
 * of the day something starts in — Vormittag, Nachmittag, Abend, cut at noon and
 * at five within the 08:00–21:00 opening hours. One row per booking, not per
 * blocked workplace: a booking that blocks three benches is one event.
 *
 * Like `/liste` and the iCal feed it always renders as the anonymous role, even
 * with a session cookie, and checks `viewBookings` itself — so the embed is the
 * same document for everyone. Optional `?arbeitsplatz=` narrows it to one
 * workplace; an unknown id is a 404, so a typo in an embed URL surfaces at once.
 *
 * Not in `spec/reservation-api.yml`: that governs the JSON API under `/api`.
 * This is a rendered page at the web root, a sibling of the SPA.
 */
class AgendaWidgetController extends Controller
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

    public function __invoke(Request $request): View
    {
        abort_unless(
            Role::anonymous()->can('viewBookings'),
            403,
            'Die Buchungen sind nicht öffentlich einsehbar.',
        );

        $workplaceId = $request->query('arbeitsplatz');

        $workplace = is_string($workplaceId) && $workplaceId !== ''
            ? Workplace::findOrFail($workplaceId)
            : null;

        $timezone = GlobalSetting::current()->timezone;
        $now = CarbonImmutable::now();
        $endOfToday = $now->setTimezone($timezone)->endOfDay();

        $bookings = Booking::query()
            ->with('workplace')
            ->where('end_time', '>', $now)
            ->where('start_time', '<=', $endOfToday)
            ->when($workplace, fn ($query) => $query->where('workplace_id', $workplace->id))
            ->orderBy('start_time')
            ->get();

        return view('widget.agenda', [
            'groups' => $this->group($bookings, $now, $timezone),
        ]);
    }

    /**
     * The bookings in groups: a running "Aktuell" first, then one group per part
     * of the day something still starts in, in the order of the day. A part with
     * nothing in it opens no heading.
     *
     * @param  Collection<int, Booking>  $bookings
     * @return list<array{heading: string, entries: list<array{where: string, when: string, who: string}>}>
     */
    private function group(Collection $bookings, CarbonImmutable $now, string $timezone): array
    {
        $running = [];
        $ahead = [];

        foreach ($bookings as $booking) {
            $start = $booking->start_time->setTimezone($timezone);
            $end = $booking->end_time->setTimezone($timezone);

            $entry = [
                'where' => $booking->workplace?->name ?? $booking->workplace_id,
                'when' => $start->format('H:i').'–'.$end->format('H:i'),
                'who' => $booking->name,
            ];

            if ($booking->start_time <= $now) {
                $running[] = $entry;

                continue;
            }

            $ahead[$this->partOfDay((int) $start->format('G'))][] = $entry;
        }

        $groups = $running === [] ? [] : [['heading' => 'Aktuell', 'entries' => $running]];

        foreach (array_reverse(self::PARTS) as $part) {
            if (! empty($ahead[$part['heading']])) {
                $groups[] = ['heading' => $part['heading'], 'entries' => $ahead[$part['heading']]];
            }
        }

        return $groups;
    }

    /** The last part of the day that has already begun at this hour. */
    private function partOfDay(int $hour): string
    {
        foreach (self::PARTS as $part) {
            if ($hour >= $part['from']) {
                return $part['heading'];
            }
        }

        return self::PARTS[array_key_last(self::PARTS)]['heading'];
    }
}
