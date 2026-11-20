<?php

namespace App\Http\Controllers;

use App\Models\Area;
use App\Models\Booking;
use App\Models\GlobalSetting;
use App\Models\Role;
use App\Models\Workplace;
use App\Support\DayAgenda;
use App\Support\FloorPlan;
use App\Support\LegacyColor;
use App\Support\Occupancy;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\View\View;

/**
 * The board — `/tafel` — the overview map for a tablet on the wall that is too
 * old for the interface: an iPad 4 stops at iOS 10.3, where the Angular bundle
 * does not even parse and the map's popover, anchor positioning and
 * `color-mix()` are years away.
 *
 * What it keeps of the map is what one reads from a step away: the plan in the
 * areas' colours, a figure on every bench that is taken or about to be, and the
 * agenda column beside it. What it leaves out is everything one would touch —
 * no card, no way into the form. A wall display is looked at, not used.
 *
 * Rendered here rather than in the browser, so the old Safari only has to paint.
 * The decisions are made on the server — which benches are taken, which colour
 * each area is in a spelling Safari 10 knows — and the one thing that cannot be
 * done here is left to a short script in the page: standing the figure on a
 * bench needs the bench's bounding box, and only a browser that has laid out the
 * drawing knows that.
 *
 * Like `/agenda` it renders as the anonymous role whatever the session, and
 * reloads itself once a minute. Not in `spec/reservation-api.yml`, which governs
 * the JSON API.
 */
class BoardController extends Controller
{
    public function __invoke(): View
    {
        abort_unless(
            Role::anonymous()->can('viewBookings'),
            403,
            'Die Buchungen sind nicht öffentlich einsehbar.',
        );

        $timezone = GlobalSetting::current()->timezone;
        $now = CarbonImmutable::now();
        $today = $now->setTimezone($timezone)->startOfDay();

        // What a visitor's map would know: disabled workplaces are not among
        // them, so their benches turn grey like any other the configuration does
        // not know.
        $workplaces = Workplace::query()
            ->where('status', '!=', Workplace::STATUS_DISABLED)
            ->get(['id', 'area_id']);

        // Converted, and then only what reads as a colour: the values go into
        // style attributes, and a stray semicolon would carry more than a fill.
        $colors = Area::query()->pluck('color', 'id')
            ->map(fn (string $color): string => LegacyColor::toRgb($color))
            ->filter(fn (string $color): bool => preg_match('/^[#\w\s(),.%\/+-]+$/', $color) === 1);

        $taken = Booking::query()
            ->where('end_time', '>', $now)
            ->where('start_time', '<=', $now->addMinutes(Occupancy::SOON_MINUTES))
            ->get();
        Booking::primeBlockedWorkplaceIds($taken);

        $remaining = Booking::query()
            ->with('workplace')
            ->where('end_time', '>', $now)
            ->where('start_time', '<=', $today->endOfDay())
            ->orderBy('start_time')
            ->get();

        return view('widget.board', [
            'plan' => FloorPlan::inline(),
            // The time over the plan, which shows the present moment; the date
            // over the agenda, which lists the day.
            'time' => $now->setTimezone($timezone)->format('H:i'),
            // Seconds to the next full minute, plus one so the reload lands
            // after the turn rather than a hair before it — the time over the
            // plan then changes when a clock would.
            'refresh' => 61 - (int) $now->format('s'),
            'date' => $now->setTimezone($timezone)->locale('de')->isoFormat('dd, D. MMMM'),
            'areaColors' => $colors->all(),
            'groups' => DayAgenda::group($remaining, $now, $today, $timezone),
            // What the script needs: every workplace with its area's colour —
            // null where the area is unknown, so the bench keeps its drawn one
            // rather than counting as a stray — and the state of every one that
            // is taken.
            'marking' => [
                'colors' => $workplaces
                    ->mapWithKeys(fn (Workplace $workplace) => [$workplace->id => $colors[$workplace->area_id] ?? null])
                    ->all(),
                'taken' => Occupancy::at($taken, $now),
            ],
        ]);
    }
}
