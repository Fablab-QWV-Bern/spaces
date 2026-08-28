<?php

use App\Models\Area;
use App\Models\Booking;
use App\Models\Role;
use Carbon\CarbonImmutable;
use Database\Seeders\DatabaseSeeder;

beforeEach(function () {
    $this->seed(DatabaseSeeder::class);

    $this->anonymous = Role::where('is_anonymous', true)->firstOrFail();
    $this->admin = Role::where('name', 'Admin')->firstOrFail();

    // 08:00 in Europe/Zurich (CEST, UTC+2) on a fixed day, so the part-of-day
    // grouping is checkable.
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-09-01 06:00:00', 'UTC'));

    $book = fn (string $name, string $from, string $to, string $workplace = 'holz-1') => Booking::create([
        'workplace_id' => $workplace,
        'name' => $name,
        'contact' => 'x@example.org',
        'start_time' => CarbonImmutable::parse($from, 'UTC'),
        'end_time' => CarbonImmutable::parse($to, 'UTC'),
        'chargeable_duration_minutes' => 120,
    ]);

    $book('Laeuft gerade', '2026-09-01 05:30:00', '2026-09-01 08:00:00');
    $book('Schon vorbei', '2026-09-01 04:00:00', '2026-09-01 05:00:00');
    $book('Am Morgen', '2026-09-01 07:00:00', '2026-09-01 09:00:00');
    $book('Am Nachmittag', '2026-09-01 12:00:00', '2026-09-01 14:00:00');
    $book('Am Abend', '2026-09-01 16:00:00', '2026-09-01 18:00:00');
    $book('Erst morgen', '2026-09-02 07:00:00', '2026-09-02 09:00:00');
});

afterEach(fn () => CarbonImmutable::setTestNow());

function agenda(array $query = []): string
{
    return '/agenda'.($query === [] ? '' : '?'.http_build_query($query));
}

it('renders the agenda with its heading', function () {
    $this->get(agenda())->assertOk()->assertSee('Belegungen heute');
});

it('groups by running and by the part of the day something starts in, in order', function () {
    $body = $this->get(agenda())->getContent();

    foreach (['Aktuell', 'Vormittag', 'Nachmittag', 'Abend'] as $heading) {
        expect($body)->toContain("<h2>{$heading}</h2>");
    }

    expect(strpos($body, 'Aktuell'))->toBeLessThan(strpos($body, 'Vormittag'))
        ->and(strpos($body, 'Vormittag'))->toBeLessThan(strpos($body, 'Nachmittag'))
        ->and(strpos($body, 'Nachmittag'))->toBeLessThan(strpos($body, 'Abend'));
});

it('puts a booking that has started under Aktuell, and shows its local time range', function () {
    $body = $this->get(agenda())->getContent();

    expect($body)->toContain('Laeuft gerade')
        ->and($body)->toContain('07:30–10:00');
});

it('leaves out what has ended and what only starts tomorrow', function () {
    $body = $this->get(agenda())->getContent();

    expect($body)->not->toContain('Schon vorbei')
        ->and($body)->not->toContain('Erst morgen');
});

it('narrows to one workplace', function () {
    Booking::create([
        'workplace_id' => 'metall-vorne',
        'name' => 'Woanders',
        'contact' => 'x@example.org',
        'start_time' => CarbonImmutable::parse('2026-09-01 07:00:00', 'UTC'),
        'end_time' => CarbonImmutable::parse('2026-09-01 09:00:00', 'UTC'),
        'chargeable_duration_minutes' => 120,
    ]);

    $this->get(agenda(['arbeitsplatz' => 'holz-1']))
        ->assertSee('Am Morgen')
        ->assertDontSee('Woanders');
});

it('narrows to one area', function () {
    Booking::create([
        'workplace_id' => 'metall-vorne',
        'name' => 'Im Metall',
        'contact' => 'x@example.org',
        'start_time' => CarbonImmutable::parse('2026-09-01 07:00:00', 'UTC'),
        'end_time' => CarbonImmutable::parse('2026-09-01 09:00:00', 'UTC'),
        'chargeable_duration_minutes' => 120,
    ]);

    $metall = Area::where('name', 'Metall')->firstOrFail();

    $this->get(agenda(['bereich' => $metall->id]))
        ->assertSee('Im Metall')
        ->assertDontSee('Am Morgen');
});

it('answers an unknown filter with 404 rather than an empty agenda', function () {
    $this->get(agenda(['arbeitsplatz' => 'gibt-es-nicht']))->assertNotFound();
    $this->get(agenda(['bereich' => 'gibt-es-nicht']))->assertNotFound();
});

it('says so when nothing is left for today', function () {
    Booking::query()->delete();

    $this->get(agenda())
        ->assertOk()
        ->assertSee('Für heute ist nichts mehr eingetragen.');
});

it('refuses when the anonymous role may not see bookings', function () {
    $this->anonymous->update(['view_bookings' => false]);

    $this->get(agenda())->assertForbidden();
});

it('shows a logged-in admin nothing other than a visitor sees', function () {
    $asVisitor = $this->get(agenda())->getContent();
    $asAdmin = $this->actingAs($this->admin)->get(agenda())->getContent();

    expect($asAdmin)->toBe($asVisitor)
        ->and($asAdmin)->not->toContain('x@example.org');
});
