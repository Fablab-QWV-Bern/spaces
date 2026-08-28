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
use Illuminate\Support\Facades\DB;

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
            'tag' => ['sometimes', 'string'],
        ]);

        // A typo in the subscription link should stand out rather than pass as an
        // empty calendar — one would only notice that weeks later. The same holds
        // for a tag: it is a 404 when no workplace carries it.
        $workplace = isset($filters['workplaceId']) ? Workplace::findOrFail($filters['workplaceId']) : null;

        // Comma-separated, with a leading "#" and surrounding space tolerated as
        // in the admin form. Matching then runs through the column's
        // case-insensitive collation, like tag-based blocking.
        $tags = collect(explode(',', $filters['tag'] ?? ''))
            ->map(fn (string $tag): string => ltrim(trim($tag), '#'))
            ->filter()
            ->values();

        foreach ($tags as $tag) {
            abort_unless(
                DB::table('workplace_tags')->where('tag', $tag)->exists(),
                404,
                "Kein Arbeitsplatz trägt den Tag «{$tag}».",
            );
        }

        $now = CarbonImmutable::now()->utc();

        $bookings = Booking::query()
            ->with('workplace.area')
            ->where('start_time', '<', $now->addMonths(self::WINDOW_MONTHS))
            ->where('end_time', '>', $now->subMonths(self::WINDOW_MONTHS))
            ->when($workplace, fn ($query) => $query->where('workplace_id', $workplace->id))
            ->when($tags->isNotEmpty(), fn ($query) => $query->whereIn(
                'workplace_id',
                DB::table('workplace_tags')->select('workplace_id')->whereIn('tag', $tags->all()),
            ))
            ->orderBy('start_time')
            ->get();

        $body = $this->feed->render(
            $bookings,
            $this->title($workplace, $tags->all()),
            $request->getHost(),
            $role->can('viewBookingsDetails'),
        );

        return response($body, 200, ['Content-Type' => 'text/calendar; charset=utf-8']);
    }

    /**
     * The calendar name the client shows. It carries whichever filter is in
     * force so a subscriber can tell two feeds apart; the workplace wins when
     * both are given.
     *
     * @param  list<string>  $tags
     */
    private function title(?Workplace $workplace, array $tags): string
    {
        $name = config('app.name');

        $suffix = match (true) {
            $workplace !== null => $workplace->name,
            $tags !== [] => implode(', ', array_map(fn (string $tag): string => "#{$tag}", $tags)),
            default => null,
        };

        return $suffix !== null ? "{$name} – {$suffix}" : $name;
    }
}
