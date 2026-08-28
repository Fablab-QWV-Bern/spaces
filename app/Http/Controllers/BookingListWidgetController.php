<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\GlobalSetting;
use App\Models\Role;
use App\Models\Workplace;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Request;

/**
 * A bare list of the next bookings on one workplace, rendered as an HTML page
 * meant to be dropped into an <iframe> — the "what is coming up here" widget the
 * old system served as `coming_up.php?room=…`. The room match by name has become
 * `?arbeitsplatz=` with the workplace id, and `?max=` caps the number of rows.
 *
 * Like the iCalendar feed it always renders as the anonymous role, even with a
 * session cookie: an embed on a public page has no login, and what a logged-in
 * browser saw here would not be what a visitor sees afterwards. So it is the
 * same document for everyone, and `viewBookings` is checked here rather than by
 * the middleware.
 *
 * It is not in `spec/reservation-api.yml`: that governs the JSON API under
 * `/api`. This is a rendered page at the web root, a sibling of the SPA.
 */
class BookingListWidgetController extends Controller
{
    /** Used when the caller names no `max`, and the ceiling one cannot exceed. */
    private const DEFAULT_LIMIT = 5;

    private const MAX_LIMIT = 20;

    public function __invoke(Request $request): View
    {
        abort_unless(
            Role::anonymous()->can('viewBookings'),
            403,
            'Die Buchungen sind nicht öffentlich einsehbar.',
        );

        $id = $request->query('arbeitsplatz');

        // Not a redirect back to a form there is none of: an embed with a broken
        // URL should fail loudly in place.
        abort_if(! is_string($id) || $id === '', 422, 'Der Parameter „arbeitsplatz“ fehlt.');

        // A typo in the embed URL should surface as a 404, not as an empty list
        // one only notices weeks later — same reasoning as the feed.
        $workplace = Workplace::with('area')->findOrFail($id);

        // A garbage `max` falls back to the default rather than erroring — the
        // widget stays up.
        $max = (int) $request->query('max', '0');
        $limit = $max >= 1 ? min($max, self::MAX_LIMIT) : self::DEFAULT_LIMIT;

        $timezone = GlobalSetting::current()->timezone;

        $bookings = Booking::query()
            ->where('workplace_id', $workplace->id)
            ->where('end_time', '>', CarbonImmutable::now())
            ->orderBy('start_time')
            ->limit($limit)
            ->get();

        $entries = $bookings->map(fn (Booking $booking): array => [
            'when' => $this->formatWhen(
                $booking->start_time->setTimezone($timezone),
                $booking->end_time->setTimezone($timezone),
            ),
            'name' => $booking->name,
        ]);

        return view('widget.bookings', [
            'workplace' => $workplace,
            'entries' => $entries,
        ]);
    }

    /**
     * "Samstag, 12. September 9 — 12 Uhr", and across midnight
     * "Samstag, 12. September 21 Uhr — Sonntag, 13. September 8 Uhr". A whole
     * hour loses its ":00"; the rest reads as "9.30", the way a time of day is
     * written in the workshop's German.
     */
    private function formatWhen(CarbonImmutable $start, CarbonImmutable $end): string
    {
        $day = fn (CarbonImmutable $time): string => $time->locale('de')->isoFormat('dd, D. MMM');
        $clock = fn (CarbonImmutable $time): string => $time->minute === 0
            ? (string) $time->hour
            : $time->format('G.i');

        if ($start->isSameDay($end)) {
            return $day($start).' '.$clock($start).' – '.$clock($end).' Uhr';
        }

        return $day($start).' '.$clock($start).' Uhr – '.$day($end).' '.$clock($end).' Uhr';
    }
}
