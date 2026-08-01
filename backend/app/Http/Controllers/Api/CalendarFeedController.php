<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Area;
use App\Models\Booking;
use App\Models\Role;
use App\Models\Workplace;
use App\Support\Ical\CalendarFeed;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Der Abonnement-Feed für Kalenderclients.
 *
 * Gerendert wird immer als anonyme Rolle, auch wenn der Aufruf ein
 * Sitzungscookie mitbringt. Ein Kalenderclient hat keines — was ein angemeldeter
 * Browser hier sähe, wäre sonst nicht das, was das Abo danach liefert. So ist
 * der Feed für alle dasselbe Dokument, und ein weitergegebener Link kann keine
 * Kontaktdaten ausspielen, die die anonyme Rolle nicht ohnehin zeigt.
 */
class CalendarFeedController extends Controller
{
    /** Dasselbe gleitende Fenster wie im System, das dieses hier ablöst. */
    private const WINDOW_MONTHS = 3;

    public function __construct(private readonly CalendarFeed $feed) {}

    public function show(Request $request): Response
    {
        $role = Role::anonymous();

        abort_unless($role->can('viewBookings'), 403, 'Die aktuelle Rolle darf das nicht (viewBookings).');

        $filters = $request->validate([
            'areaId' => ['sometimes', 'string'],
            'workplaceId' => ['sometimes', 'string'],
        ]);

        // Ein Tippfehler im Abo-Link soll auffallen, statt als leerer Kalender
        // durchzugehen — den würde man erst Wochen später bemerken.
        $area = isset($filters['areaId']) ? Area::findOrFail($filters['areaId']) : null;
        $workplace = isset($filters['workplaceId']) ? Workplace::findOrFail($filters['workplaceId']) : null;

        $now = CarbonImmutable::now()->utc();

        $bookings = Booking::query()
            ->with('workplace.area')
            ->where('start_time', '<', $now->addMonths(self::WINDOW_MONTHS))
            ->where('end_time', '>', $now->subMonths(self::WINDOW_MONTHS))
            ->when($workplace, fn ($query) => $query->where('workplace_id', $workplace->id))
            ->when($area, fn ($query) => $query->whereIn(
                'workplace_id',
                fn ($sub) => $sub->select('id')->from('workplaces')->where('area_id', $area->id),
            ))
            ->orderBy('start_time')
            ->get();

        $body = $this->feed->render(
            $bookings,
            $this->title($workplace, $area),
            $request->getHost(),
            $role->can('viewBookingsDetails'),
        );

        return response($body, 200, ['Content-Type' => 'text/calendar; charset=utf-8']);
    }

    private function title(?Workplace $workplace, ?Area $area): string
    {
        $name = config('app.name');

        return match (true) {
            $workplace !== null => "{$name} – {$workplace->name}",
            $area !== null => "{$name} – {$area->name}",
            default => $name,
        };
    }
}
