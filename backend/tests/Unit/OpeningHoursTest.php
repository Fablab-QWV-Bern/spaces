<?php

use App\Domain\Booking\OpeningHours;
use Carbon\CarbonImmutable;

/** Opening hours 08:00–21:00, displayed in Swiss time. */
function hours(): OpeningHours
{
    return new OpeningHours('08:00', '21:00', 'Europe/Zurich');
}

/** Builds a UTC instant from local Swiss wall-clock time. */
function local(string $wallClock): CarbonImmutable
{
    return CarbonImmutable::parse($wallClock, 'Europe/Zurich')->utc();
}

it('charges a booking within one day in full', function () {
    expect(hours()->chargeableMinutes(local('2026-08-03 09:00'), local('2026-08-03 11:00')))
        ->toBe(120);
});

it('leaves the night hours out', function () {
    // Friday 20:00 to Saturday 09:00: one hour in the evening, one in the morning.
    expect(hours()->chargeableMinutes(local('2026-08-07 20:00'), local('2026-08-08 09:00')))
        ->toBe(120);
});

it('sums only the time within the opening hours across several days', function () {
    // Fri 20:00 -> Sun 09:00: 60 + (Sat 08–21 = 780) + 60
    expect(hours()->chargeableMinutes(local('2026-08-07 20:00'), local('2026-08-09 09:00')))
        ->toBe(900);
});

it('stays with the wall clock across a DST change', function () {
    // On the night of 29 March 2026 the clocks go forward in Switzerland. In real
    // terms only 12 hours pass between 20:00 and 09:00, yet the two hours within
    // the opening hours are still charged.
    $start = local('2026-03-28 20:00');
    $end = local('2026-03-29 09:00');

    expect($start->diffInHours($end))->toBe(12.0)
        ->and(hours()->chargeableMinutes($start, $end))->toBe(120);
});

it('charges nothing when everything lies outside the opening hours', function () {
    expect(hours()->chargeableMinutes(local('2026-08-03 22:00'), local('2026-08-03 23:00')))
        ->toBe(0);
});

it('accepts start and end exactly at the boundaries', function () {
    expect(hours()->isValidStart(local('2026-08-03 08:00')))->toBeTrue()
        ->and(hours()->isValidEnd(local('2026-08-03 21:00')))->toBeTrue()
        // 21:00 is not a valid start, 08:00 not a valid end.
        ->and(hours()->isValidStart(local('2026-08-03 21:00')))->toBeFalse()
        ->and(hours()->isValidEnd(local('2026-08-03 08:00')))->toBeFalse();
});

it('rejects times outside the opening hours', function () {
    expect(hours()->isValidStart(local('2026-08-03 07:45')))->toBeFalse()
        ->and(hours()->isValidEnd(local('2026-08-03 21:15')))->toBeFalse();
});

it('recognises an overnight booking by the calendar day', function () {
    expect(hours()->spansNight(local('2026-08-03 09:00'), local('2026-08-03 21:00')))->toBeFalse()
        ->and(hours()->spansNight(local('2026-08-03 20:00'), local('2026-08-04 09:00')))->toBeTrue();
});
