<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Role;
use App\Models\Workplace;
use App\Support\Ical\CalendarFeed;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * The subscription feed for calendar clients.
 *
 * Always rendered as the anonymous role, even when the call brings a session
 * cookie. A calendar client has none — what a logged-in browser saw here would
 * otherwise not be what the subscription delivers afterwards. This way the feed
 * is the same document for everyone, and a shared link cannot leak contact
 * details the anonymous role does not show anyway.
 */
class CalendarFeedController extends Controller
{
    /** The same sliding window as in the system this one replaces. */
    private const WINDOW_MONTHS = 3;

    public function __construct(private readonly CalendarFeed $feed) {}

    public function show(Request $request): Response
    {
        $role = Role::anonymous();

        abort_unless($role->can('viewBookings'), 403, 'Die aktuelle Rolle darf das nicht (viewBookings).');

        $filters = $request->validate([
            'workplaceId' => ['sometimes', 'string'],
        ]);

        // A typo in the subscription link should stand out rather than pass as an
        // empty calendar — one would only notice that weeks later.
        $workplace = isset($filters['workplaceId']) ? Workplace::findOrFail($filters['workplaceId']) : null;

        $now = CarbonImmutable::now()->utc();

        $bookings = Booking::query()
            ->with('workplace.area')
            ->where('start_time', '<', $now->addMonths(self::WINDOW_MONTHS))
            ->where('end_time', '>', $now->subMonths(self::WINDOW_MONTHS))
            ->when($workplace, fn ($query) => $query->where('workplace_id', $workplace->id))
            ->orderBy('start_time')
            ->get();

        $body = $this->feed->render(
            $bookings,
            $this->title($workplace),
            $request->getHost(),
            $role->can('viewBookingsDetails'),
        );

        return response($body, 200, ['Content-Type' => 'text/calendar; charset=utf-8']);
    }

    private function title(?Workplace $workplace): string
    {
        $name = config('app.name');

        return $workplace !== null ? "{$name} – {$workplace->name}" : $name;
    }
}
