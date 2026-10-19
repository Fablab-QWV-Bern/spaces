<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\GlobalSetting;
use App\Models\Role;
use App\Models\Workplace;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\View\View;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
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
 * The same goes for the other two parameters:
 *
 * - `?datum=` shows another day. Today leaves out what has ended; any other day
 *   shows all of it, since "still coming" means nothing there. The footer pages
 *   by day and leads back to today through the date itself — plain links, as
 *   the page works without script, each carrying the other parameters along. The
 *   minutely reload goes back to today, so paging is only ever a look.
 * - `?mode=dark` or `light` fixes the colours for a host page whose setting the
 *   widget cannot see; without it they follow `prefers-color-scheme`.
 *
 * Not in `spec/reservation-api.yml`: that governs the JSON API under `/api`.
 * This is a rendered page at the web root, a sibling of the SPA.
 */
class AgendaWidgetController extends Controller
{
    /**
     * The colours `?mode=` may fix, with the background each paints — the one the
     * page itself uses, repeated for the manifest because JSON cannot read CSS.
     */
    private const MODES = ['light' => '#f4f4f5', 'dark' => '#1a1a1c'];

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

        $workplace = $this->workplace($request);
        $mode = $this->mode($request);

        $timezone = GlobalSetting::current()->timezone;
        $now = CarbonImmutable::now();
        $today = $now->setTimezone($timezone)->startOfDay();
        $day = $this->day($request->query('datum'), $timezone) ?? $today;
        $isToday = $day->equalTo($today);

        $bookings = Booking::query()
            ->with('workplace')
            ->where('end_time', '>', $isToday ? $now : $day)
            ->where('start_time', '<=', $day->endOfDay())
            ->when($workplace, fn ($query) => $query->where('workplace_id', $workplace->id))
            ->orderBy('start_time')
            ->get();

        return view('widget.agenda', [
            'groups' => $this->group($bookings, $now, $day, $timezone),
            'mode' => $mode,
            'isToday' => $isToday,
            'date' => $day->locale('de')->isoFormat('dd, D. MMMM YYYY'),
            'previous' => $this->link($request, $day->subDay()->toDateString()),
            'next' => $this->link($request, $day->addDay()->toDateString()),
            'today' => $this->link($request, null),
            'manifest' => rtrim('/agenda.webmanifest'.$this->link($request, null), '?'),
        ]);
    }

    /**
     * The agenda as an app of its own on a home screen — for a tablet hung on
     * the wall in full screen. Separate from the SPA's manifest, with its own
     * `id` and `scope`: a home-screen icon for the agenda should open the agenda
     * and nothing else, and paging must not leave it.
     *
     * Generated rather than a file, because the start page has to be the one it
     * was added from: the workplace and the mode go along, the date does not —
     * a kiosk opened tomorrow should show tomorrow. Older Safari ignores all of
     * this and goes by the meta tags in the page instead (see there).
     */
    public function manifest(Request $request): JsonResponse
    {
        $this->workplace($request);
        $background = self::MODES[$this->mode($request) ?? 'light'];

        return response()->json([
            'id' => '/agenda',
            'name' => 'Belegungen QWV',
            'short_name' => 'Belegungen',
            'lang' => 'de-CH',
            'start_url' => rtrim('/agenda'.$this->link($request, null), '?'),
            'scope' => '/agenda',
            'display' => 'fullscreen',
            'theme_color' => $background,
            'background_color' => $background,
            // The SPA's icons, which the deployment puts next to this page.
            'icons' => [
                ['src' => '/icon-192.png', 'sizes' => '192x192', 'type' => 'image/png'],
                ['src' => '/icon-512.png', 'sizes' => '512x512', 'type' => 'image/png'],
            ],
        ], options: JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
            ->header('Content-Type', 'application/manifest+json');
    }

    /** The workplace from `?arbeitsplatz=`, null for all; an unknown id is a 404. */
    private function workplace(Request $request): ?Workplace
    {
        $id = $request->query('arbeitsplatz');

        return is_string($id) && $id !== '' ? Workplace::findOrFail($id) : null;
    }

    /** `light` or `dark` from `?mode=`, null to follow the system; anything else is a 404. */
    private function mode(Request $request): ?string
    {
        $mode = $request->query('mode');
        abort_unless($mode === null || (is_string($mode) && array_key_exists($mode, self::MODES)), 404);

        return $mode;
    }

    /**
     * The day asked for as local midnight, or null without one. A value that is
     * no calendar date is a 404 like an unknown workplace. The pattern keeps
     * `createFromFormat` from throwing on words, the round trip keeps it from
     * rolling 2026-02-30 over into March.
     */
    private function day(mixed $value, string $timezone): ?CarbonImmutable
    {
        if ($value === null) {
            return null;
        }

        $day = is_string($value) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)
            ? CarbonImmutable::createFromFormat('!Y-m-d', $value, $timezone)
            : false;

        abort_unless($day instanceof CarbonImmutable && $day->toDateString() === $value, 404);

        return $day;
    }

    /**
     * This page with another `datum`, the other parameters kept. Relative, so it
     * holds behind whatever host the embed is served under. Today goes without
     * the parameter, so a link back to it keeps following the calendar.
     */
    private function link(Request $request, ?string $date): string
    {
        $query = array_filter(
            [...$request->query(), 'datum' => $date],
            fn ($value) => $value !== null && $value !== '',
        );

        return $query === [] ? '?' : '?'.http_build_query($query);
    }

    /**
     * The bookings in groups: a running "Aktuell" first, then one group per part
     * of the day something starts in, in the order of the day. A part with
     * nothing in it opens no heading.
     *
     * @param  Collection<int, Booking>  $bookings
     * @return list<array{heading: string, entries: list<array{where: string, when: string, who: string}>}>
     */
    private function group(
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
                'when' => $start->format('H:i').'–'.$end->format('H:i'),
                'who' => $booking->name,
            ];

            if ($booking->start_time <= $now && $booking->end_time > $now) {
                $running[] = $entry;

                continue;
            }

            // A booking carried over from the night before belongs to the
            // morning of this day, not to the evening it began in.
            $ahead[$this->partOfDay((int) $start->max($day)->format('G'))][] = $entry;
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
