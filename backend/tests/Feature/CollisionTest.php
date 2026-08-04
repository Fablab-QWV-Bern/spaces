<?php

use App\Domain\Booking\BlockedWorkplaceResolver;
use App\Domain\Booking\CollisionChecker;
use App\Models\Area;
use App\Models\Booking;
use App\Models\Workplace;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

beforeEach(function () {
    $this->area = Area::create([
        'name' => 'Werkstatt', 'color' => '#84cc16',
        'max_booking_duration_minutes' => 480, 'sort_order' => 1,
    ]);

    $this->checker = app(CollisionChecker::class);
});

function workplace(string $id, ?Area $area = null): Workplace
{
    return Workplace::create([
        'id' => $id,
        'name' => ucfirst($id),
        'area_id' => ($area ?? test()->area)->id,
    ]);
}

/** Creates a booking with a resolved snapshot, the way the service does. */
function booking(string $workplaceId, string $start, string $end): Booking
{
    $booking = Booking::create([
        'workplace_id' => $workplaceId,
        'name' => 'Testperson',
        'contact' => 'test@example.org',
        'start_time' => CarbonImmutable::parse($start, 'Europe/Zurich')->utc(),
        'end_time' => CarbonImmutable::parse($end, 'Europe/Zurich')->utc(),
        'chargeable_duration_minutes' => 60,
    ]);

    $booking->setBlockedWorkplaceIds(app(BlockedWorkplaceResolver::class)->resolve($workplaceId));

    return $booking;
}

function conflictsFor(string $workplaceId, string $start, string $end, ?string $exclude = null): array
{
    return test()->checker->conflictingBookingIds(
        $workplaceId,
        CarbonImmutable::parse($start, 'Europe/Zurich')->utc(),
        CarbonImmutable::parse($end, 'Europe/Zurich')->utc(),
        $exclude,
    );
}

it('detects an overlap on the same workplace', function () {
    workplace('holz-1');
    $existing = booking('holz-1', '2026-08-03 09:00', '2026-08-03 11:00');

    expect(conflictsFor('holz-1', '2026-08-03 10:00', '2026-08-03 12:00'))
        ->toBe([$existing->id]);
});

it('treats time ranges as half-open', function () {
    workplace('holz-1');
    booking('holz-1', '2026-08-03 10:00', '2026-08-03 11:00');

    // Directly adjoining is not a collision.
    expect(conflictsFor('holz-1', '2026-08-03 11:00', '2026-08-03 12:00'))->toBe([]);
    // Nor is directly before.
    expect(conflictsFor('holz-1', '2026-08-03 09:00', '2026-08-03 10:00'))->toBe([]);
});

it('leaves different workplaces alone', function () {
    workplace('holz-1');
    workplace('holz-2');
    booking('holz-1', '2026-08-03 09:00', '2026-08-03 11:00');

    expect(conflictsFor('holz-2', '2026-08-03 09:00', '2026-08-03 11:00'))->toBe([]);
});

it('collides when the new workplace is in the existing booking snapshot', function () {
    workplace('kurs');
    workplace('holz-1');
    // The course blocks Holz 1.
    Workplace::findOrFail('kurs')->blocksWorkplaces()->sync(['holz-1']);

    $kursBuchung = booking('kurs', '2026-08-03 09:00', '2026-08-03 12:00');

    expect(conflictsFor('holz-1', '2026-08-03 10:00', '2026-08-03 11:00'))
        ->toBe([$kursBuchung->id]);
});

it('collides when the existing workplace is in the new booking snapshot', function () {
    workplace('kurs');
    workplace('holz-1');
    Workplace::findOrFail('kurs')->blocksWorkplaces()->sync(['holz-1']);

    $holzBuchung = booking('holz-1', '2026-08-03 10:00', '2026-08-03 11:00');

    // Now the other way round: the course wants to be booked, Holz 1 is taken.
    expect(conflictsFor('kurs', '2026-08-03 09:00', '2026-08-03 12:00'))
        ->toBe([$holzBuchung->id]);
});

it('leaves two bookings alone that block the same third workplace', function () {
    // The case a naive set-intersection implementation would get wrong.
    workplace('a');
    workplace('b');
    workplace('c');

    Workplace::findOrFail('a')->blocksWorkplaces()->sync(['c']);
    Workplace::findOrFail('b')->blocksWorkplaces()->sync(['c']);

    booking('a', '2026-08-03 09:00', '2026-08-03 12:00');

    // A and B both block C, but not each other.
    expect(conflictsFor('b', '2026-08-03 09:00', '2026-08-03 12:00'))->toBe([]);
});

it('does not block transitively', function () {
    workplace('a');
    workplace('b');
    workplace('c');

    Workplace::findOrFail('a')->blocksWorkplaces()->sync(['b']);
    Workplace::findOrFail('b')->blocksWorkplaces()->sync(['c']);

    booking('a', '2026-08-03 09:00', '2026-08-03 12:00');

    // A blocks B, B blocks C — but A does not block C.
    expect(conflictsFor('c', '2026-08-03 09:00', '2026-08-03 12:00'))->toBe([]);
});

it('resolves tag-based blocking at booking time', function () {
    workplace('ruhetag');
    workplace('holz-1');

    Workplace::findOrFail('holz-1')->syncTags(['werkstatt']);
    Workplace::findOrFail('ruhetag')->syncBlocksWorkplacesWithTag(['werkstatt']);

    $ruhetag = booking('ruhetag', '2026-08-03 08:00', '2026-08-03 21:00');

    expect($ruhetag->blockedWorkplaceIds())->toBe(['holz-1'])
        ->and(conflictsFor('holz-1', '2026-08-03 10:00', '2026-08-03 11:00'))
        ->toBe([$ruhetag->id]);
});

it('compares tags case-insensitively', function () {
    workplace('ruhetag');
    workplace('holz-1');

    Workplace::findOrFail('holz-1')->syncTags(['Werkstatt']);
    Workplace::findOrFail('ruhetag')->syncBlocksWorkplacesWithTag(['werkstatt']);

    expect(app(BlockedWorkplaceResolver::class)->resolve('ruhetag'))->toBe(['holz-1']);
});

it('keeps existing bookings out of later tag changes', function () {
    workplace('ruhetag');
    workplace('holz-1');
    workplace('holz-2');

    Workplace::findOrFail('holz-1')->syncTags(['werkstatt']);
    Workplace::findOrFail('ruhetag')->syncBlocksWorkplacesWithTag(['werkstatt']);

    $ruhetag = booking('ruhetag', '2026-08-03 08:00', '2026-08-03 21:00');

    // Holz 2 only gets the tag afterwards.
    Workplace::findOrFail('holz-2')->syncTags(['werkstatt']);

    // The existing booking's snapshot stays as it was.
    expect($ruhetag->blockedWorkplaceIds())->toBe(['holz-1'])
        ->and(conflictsFor('holz-2', '2026-08-03 10:00', '2026-08-03 11:00'))->toBe([]);
});

it('excludes the booking being changed from the check', function () {
    workplace('holz-1');
    $existing = booking('holz-1', '2026-08-03 09:00', '2026-08-03 11:00');

    expect(conflictsFor('holz-1', '2026-08-03 09:00', '2026-08-03 12:00', $existing->id))
        ->toBe([]);
});

it('does not include the workplace itself in the snapshot', function () {
    workplace('holz-1');
    Workplace::findOrFail('holz-1')->syncTags(['werkstatt']);
    Workplace::findOrFail('holz-1')->syncBlocksWorkplacesWithTag(['werkstatt']);

    expect(app(BlockedWorkplaceResolver::class)->resolve('holz-1'))->toBe([]);
});

// The guard condition in conflictingBookingIdsForUpdate ("must run inside a
// transaction") cannot be tested here: RefreshDatabase wraps every test in a
// transaction itself, so the condition is always satisfied.

it('locks the examined rows inside a transaction', function () {
    workplace('holz-1');
    $existing = booking('holz-1', '2026-08-03 09:00', '2026-08-03 11:00');

    $conflicts = DB::transaction(fn () => test()->checker->conflictingBookingIdsForUpdate(
        'holz-1',
        CarbonImmutable::parse('2026-08-03 10:00', 'Europe/Zurich')->utc(),
        CarbonImmutable::parse('2026-08-03 12:00', 'Europe/Zurich')->utc(),
    ));

    expect($conflicts)->toBe([$existing->id]);
});
