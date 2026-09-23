<?php

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

it('answers an unknown workplace with 404 rather than an empty agenda', function () {
    $this->get(agenda(['arbeitsplatz' => 'gibt-es-nicht']))->assertNotFound();
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

it('shows all of another day, without Aktuell', function () {
    $body = $this->get(agenda(['datum' => '2026-09-02']))->getContent();

    expect($body)->toContain('Erst morgen')
        ->and($body)->not->toContain('Am Morgen')
        ->and($body)->not->toContain('<h2>Aktuell</h2>');
});

it('keeps what has ended on a past day', function () {
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-09-02 06:00:00', 'UTC'));

    $body = $this->get(agenda(['datum' => '2026-09-01']))->getContent();

    expect($body)->toContain('Schon vorbei')
        ->and($body)->toContain('Am Abend')
        ->and($body)->not->toContain('<h2>Aktuell</h2>');
});

it('files a booking carried over from the night before under Vormittag', function () {
    Booking::create([
        'workplace_id' => 'metall-vorne',
        'name' => 'Ueber Nacht',
        'contact' => 'x@example.org',
        'start_time' => CarbonImmutable::parse('2026-09-02 17:00:00', 'UTC'),
        'end_time' => CarbonImmutable::parse('2026-09-03 07:00:00', 'UTC'),
        'chargeable_duration_minutes' => 120,
    ]);

    $body = $this->get(agenda(['datum' => '2026-09-03']))->getContent();

    expect($body)->toContain('<h2>Vormittag</h2>')
        ->and($body)->not->toContain('<h2>Abend</h2>')
        ->and($body)->toContain('Ueber Nacht');
});

it('pages by day in the footer and keeps the other parameters', function () {
    $body = $this->get(agenda(['datum' => '2026-09-01', 'arbeitsplatz' => 'holz-1', 'mode' => 'dark']))
        ->getContent();

    expect($body)->toContain('href="?datum=2026-08-31&amp;arbeitsplatz=holz-1&amp;mode=dark"')
        ->and($body)->toContain('href="?datum=2026-09-02&amp;arbeitsplatz=holz-1&amp;mode=dark"')
        ->and($body)->toContain('href="?arbeitsplatz=holz-1&amp;mode=dark"')
        ->and($body)->toContain('Di, 1. September 2026');
});

it('forces dark or light when asked, and follows the system otherwise', function () {
    $auto = $this->get(agenda())->getContent();
    $dark = $this->get(agenda(['mode' => 'dark']))->getContent();
    $light = $this->get(agenda(['mode' => 'light']))->getContent();

    expect($auto)->toContain('prefers-color-scheme: dark')
        ->and($dark)->not->toContain('prefers-color-scheme: dark')
        ->and($dark)->toContain('color-scheme: dark;')
        ->and($light)->not->toContain('#1a1a1c')
        ->and($light)->toContain('color-scheme: light;');
});

it('answers an unknown mode or a date that does not exist with 404', function () {
    $this->get(agenda(['mode' => 'dunkel']))->assertNotFound();
    $this->get(agenda(['datum' => '2026-02-30']))->assertNotFound();
    $this->get(agenda(['datum' => 'morgen']))->assertNotFound();
});

it('reloads onto today, keeping the other parameters', function () {
    $this->get(agenda(['datum' => '2026-09-02', 'arbeitsplatz' => 'holz-1', 'mode' => 'dark']))
        ->assertSee('<meta http-equiv="refresh" content="60; url=?arbeitsplatz=holz-1&amp;mode=dark">', false);
});
