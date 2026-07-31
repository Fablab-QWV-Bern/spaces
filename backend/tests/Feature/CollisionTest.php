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

/** Legt eine Buchung samt aufgeloestem Snapshot an, so wie es der Service tut. */
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

it('erkennt eine Ueberschneidung auf demselben Arbeitsplatz', function () {
    workplace('holz-1');
    $existing = booking('holz-1', '2026-08-03 09:00', '2026-08-03 11:00');

    expect(conflictsFor('holz-1', '2026-08-03 10:00', '2026-08-03 12:00'))
        ->toBe([$existing->id]);
});

it('behandelt Zeitraeume halboffen', function () {
    workplace('holz-1');
    booking('holz-1', '2026-08-03 10:00', '2026-08-03 11:00');

    // Direkt anschliessend ist keine Kollision.
    expect(conflictsFor('holz-1', '2026-08-03 11:00', '2026-08-03 12:00'))->toBe([]);
    // Direkt davor auch nicht.
    expect(conflictsFor('holz-1', '2026-08-03 09:00', '2026-08-03 10:00'))->toBe([]);
});

it('laesst verschiedene Arbeitsplaetze in Ruhe', function () {
    workplace('holz-1');
    workplace('holz-2');
    booking('holz-1', '2026-08-03 09:00', '2026-08-03 11:00');

    expect(conflictsFor('holz-2', '2026-08-03 09:00', '2026-08-03 11:00'))->toBe([]);
});

it('kollidiert, wenn der neue Arbeitsplatz im Snapshot der bestehenden steht', function () {
    workplace('kurs');
    workplace('holz-1');
    // Der Kurs blockiert Holz 1.
    Workplace::findOrFail('kurs')->blocksWorkplaces()->sync(['holz-1']);

    $kursBuchung = booking('kurs', '2026-08-03 09:00', '2026-08-03 12:00');

    expect(conflictsFor('holz-1', '2026-08-03 10:00', '2026-08-03 11:00'))
        ->toBe([$kursBuchung->id]);
});

it('kollidiert, wenn der bestehende Arbeitsplatz im Snapshot des neuen steht', function () {
    workplace('kurs');
    workplace('holz-1');
    Workplace::findOrFail('kurs')->blocksWorkplaces()->sync(['holz-1']);

    $holzBuchung = booking('holz-1', '2026-08-03 10:00', '2026-08-03 11:00');

    // Jetzt umgekehrt: der Kurs will gebucht werden, Holz 1 ist belegt.
    expect(conflictsFor('kurs', '2026-08-03 09:00', '2026-08-03 12:00'))
        ->toBe([$holzBuchung->id]);
});

it('laesst zwei Buchungen in Ruhe, die denselben dritten Platz blockieren', function () {
    // Der Fall, den eine naive Mengenschnitt-Implementierung falsch machen wuerde.
    workplace('a');
    workplace('b');
    workplace('c');

    Workplace::findOrFail('a')->blocksWorkplaces()->sync(['c']);
    Workplace::findOrFail('b')->blocksWorkplaces()->sync(['c']);

    booking('a', '2026-08-03 09:00', '2026-08-03 12:00');

    // A und B blockieren beide C, aber nicht einander.
    expect(conflictsFor('b', '2026-08-03 09:00', '2026-08-03 12:00'))->toBe([]);
});

it('blockiert nicht transitiv', function () {
    workplace('a');
    workplace('b');
    workplace('c');

    Workplace::findOrFail('a')->blocksWorkplaces()->sync(['b']);
    Workplace::findOrFail('b')->blocksWorkplaces()->sync(['c']);

    booking('a', '2026-08-03 09:00', '2026-08-03 12:00');

    // A blockiert B, B blockiert C — A blockiert C aber nicht.
    expect(conflictsFor('c', '2026-08-03 09:00', '2026-08-03 12:00'))->toBe([]);
});

it('loest Tag-Blockierungen beim Buchen auf', function () {
    workplace('ruhetag');
    workplace('holz-1');

    Workplace::findOrFail('holz-1')->syncTags(['werkstatt']);
    Workplace::findOrFail('ruhetag')->syncBlocksWorkplacesWithTag(['werkstatt']);

    $ruhetag = booking('ruhetag', '2026-08-03 08:00', '2026-08-03 21:00');

    expect($ruhetag->blockedWorkplaceIds())->toBe(['holz-1'])
        ->and(conflictsFor('holz-1', '2026-08-03 10:00', '2026-08-03 11:00'))
        ->toBe([$ruhetag->id]);
});

it('vergleicht Tags ohne Ruecksicht auf Gross- und Kleinschreibung', function () {
    workplace('ruhetag');
    workplace('holz-1');

    Workplace::findOrFail('holz-1')->syncTags(['Werkstatt']);
    Workplace::findOrFail('ruhetag')->syncBlocksWorkplacesWithTag(['werkstatt']);

    expect(app(BlockedWorkplaceResolver::class)->resolve('ruhetag'))->toBe(['holz-1']);
});

it('haelt bestehende Buchungen aus spaeteren Tag-Aenderungen heraus', function () {
    workplace('ruhetag');
    workplace('holz-1');
    workplace('holz-2');

    Workplace::findOrFail('holz-1')->syncTags(['werkstatt']);
    Workplace::findOrFail('ruhetag')->syncBlocksWorkplacesWithTag(['werkstatt']);

    $ruhetag = booking('ruhetag', '2026-08-03 08:00', '2026-08-03 21:00');

    // Holz 2 bekommt den Tag erst nachtraeglich.
    Workplace::findOrFail('holz-2')->syncTags(['werkstatt']);

    // Der Snapshot der bestehenden Buchung bleibt, wie er war.
    expect($ruhetag->blockedWorkplaceIds())->toBe(['holz-1'])
        ->and(conflictsFor('holz-2', '2026-08-03 10:00', '2026-08-03 11:00'))->toBe([]);
});

it('nimmt die geaenderte Buchung von der Pruefung aus', function () {
    workplace('holz-1');
    $existing = booking('holz-1', '2026-08-03 09:00', '2026-08-03 11:00');

    expect(conflictsFor('holz-1', '2026-08-03 09:00', '2026-08-03 12:00', $existing->id))
        ->toBe([]);
});

it('nimmt den eigenen Arbeitsplatz nicht in den Snapshot auf', function () {
    workplace('holz-1');
    Workplace::findOrFail('holz-1')->syncTags(['werkstatt']);
    Workplace::findOrFail('holz-1')->syncBlocksWorkplacesWithTag(['werkstatt']);

    expect(app(BlockedWorkplaceResolver::class)->resolve('holz-1'))->toBe([]);
});

// Die Wächter-Bedingung in conflictingBookingIdsForUpdate ("muss in einer
// Transaktion laufen") lässt sich hier nicht prüfen: RefreshDatabase umschliesst
// jeden Test selbst mit einer Transaktion, die Bedingung ist also immer erfüllt.

it('sperrt die geprueften Zeilen innerhalb einer Transaktion', function () {
    workplace('holz-1');
    $existing = booking('holz-1', '2026-08-03 09:00', '2026-08-03 11:00');

    $conflicts = DB::transaction(fn () => test()->checker->conflictingBookingIdsForUpdate(
        'holz-1',
        CarbonImmutable::parse('2026-08-03 10:00', 'Europe/Zurich')->utc(),
        CarbonImmutable::parse('2026-08-03 12:00', 'Europe/Zurich')->utc(),
    ));

    expect($conflicts)->toBe([$existing->id]);
});
