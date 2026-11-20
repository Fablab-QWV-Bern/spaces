<?php

namespace App\Support;

use App\Models\Booking;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection;

/**
 * Which workplaces are taken right now or about to be — the server-side twin of
 * the frontend's `map/occupancy.ts`, for `/tafel`. Only the state is answered
 * here, not the card behind it: the board has no card.
 *
 * The rules are the same — a bench is taken by its own booking or by a blockage
 * from another, and a running booking beats one still within the half hour. The
 * map's further precedence, own before foreign and earliest first, only decides
 * which booking the card shows; for the bare state it collapses to "is anything
 * running, else is anything coming".
 */
class Occupancy
{
    /** How far ahead a booking already marks its workplace, as on the map. */
    public const SOON_MINUTES = 30;

    /**
     * The state of every workplace that is not free, by workplace id.
     *
     * @param  Collection<int, Booking>  $bookings  with their blocked lists primed
     * @return array<string, 'busy'|'soon'>
     */
    public static function at(Collection $bookings, CarbonImmutable $now): array
    {
        $own = [];
        $foreign = [];

        foreach ($bookings as $booking) {
            $own[$booking->workplace_id][] = $booking;

            foreach ($booking->blockedWorkplaceIds() as $blocked) {
                $foreign[$blocked][] = $booking;
            }
        }

        $states = [];

        foreach (array_keys($own + $foreign) as $workplaceId) {
            $state = self::onWorkplace($own[$workplaceId] ?? [], $foreign[$workplaceId] ?? [], $now);

            if ($state !== null) {
                $states[(string) $workplaceId] = $state;
            }
        }

        return $states;
    }

    /**
     * @param  list<Booking>  $own
     * @param  list<Booking>  $foreign
     * @return 'busy'|'soon'|null
     */
    private static function onWorkplace(array $own, array $foreign, CarbonImmutable $now): ?string
    {
        foreach ([...$own, ...$foreign] as $booking) {
            // The end no longer counts: at twelve on the dot the bench is free.
            if ($booking->start_time <= $now && $now < $booking->end_time) {
                return 'busy';
            }
        }

        $horizon = $now->addMinutes(self::SOON_MINUTES);

        foreach ([...$own, ...$foreign] as $booking) {
            if ($booking->start_time > $now && $booking->start_time <= $horizon) {
                return 'soon';
            }
        }

        return null;
    }
}
