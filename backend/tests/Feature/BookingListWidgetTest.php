<?php

use App\Models\Booking;
use App\Models\Role;
use Carbon\CarbonImmutable;
use Database\Seeders\DatabaseSeeder;

beforeEach(function () {
    $this->seed(DatabaseSeeder::class);

    $this->anonymous = Role::where('is_anonymous', true)->firstOrFail();
    $this->admin = Role::where('name', 'Admin')->firstOrFail();

    // A fixed Saturday so the German date formatting is checkable. 07:00 UTC is
    // 09:00 in Europe/Zurich in September.
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-09-01 12:00:00', 'UTC'));

    $this->start = CarbonImmutable::parse('2026-09-12 07:00:00', 'UTC');

    $this->booking = Booking::create([
        'workplace_id' => 'holz-1',
        'name' => 'Nelson Platoni',
        'contact' => 'nelson@example.org',
        'start_time' => $this->start,
        'end_time' => $this->start->addHours(3),
        'chargeable_duration_minutes' => 180,
    ]);
});

afterEach(fn () => CarbonImmutable::setTestNow());

function widget(array $query = []): string
{
    return '/liste'.($query === [] ? '' : '?'.http_build_query($query));
}

it('renders an HTML list of the upcoming bookings', function () {
    $response = $this->get(widget(['arbeitsplatz' => 'holz-1']))->assertOk();

    $response->assertSee('<ul>', false);
    $response->assertSee('Nelson Platoni');
});

it('writes date and time the way the workshop reads them, in local time', function () {
    $this->get(widget(['arbeitsplatz' => 'holz-1']))
        ->assertSee('Sa, 12. Sep 9 – 12 Uhr');
});

it('keeps the minutes when a booking does not start on the hour', function () {
    $this->booking->update([
        'start_time' => CarbonImmutable::parse('2026-09-12 07:30:00', 'UTC'),
    ]);

    $this->get(widget(['arbeitsplatz' => 'holz-1']))
        ->assertSee('Sa, 12. Sep 9.30 – 12 Uhr');
});

it('names both days for a booking that runs across midnight', function () {
    $this->booking->update([
        'start_time' => CarbonImmutable::parse('2026-09-12 19:00:00', 'UTC'),
        'end_time' => CarbonImmutable::parse('2026-09-13 06:00:00', 'UTC'),
    ]);

    $this->get(widget(['arbeitsplatz' => 'holz-1']))
        ->assertSee('Sa, 12. Sep 21 Uhr – So, 13. Sep 8 Uhr');
});

it('shows only future bookings on that workplace, in order', function () {
    Booking::create([
        'workplace_id' => 'holz-1',
        'name' => 'Schon vorbei',
        'contact' => 'past@example.org',
        'start_time' => CarbonImmutable::now()->subDays(2),
        'end_time' => CarbonImmutable::now()->subDays(2)->addHour(),
        'chargeable_duration_minutes' => 60,
    ]);

    Booking::create([
        'workplace_id' => 'holz-1',
        'name' => 'Kommt zuerst',
        'contact' => 'next@example.org',
        'start_time' => CarbonImmutable::now()->addDay(),
        'end_time' => CarbonImmutable::now()->addDay()->addHour(),
        'chargeable_duration_minutes' => 60,
    ]);

    $body = $this->get(widget(['arbeitsplatz' => 'holz-1']))->getContent();

    expect($body)->toContain('Kommt zuerst')
        ->and($body)->toContain('Nelson Platoni')
        ->and($body)->not->toContain('Schon vorbei')
        ->and(strpos($body, 'Kommt zuerst'))->toBeLessThan(strpos($body, 'Nelson Platoni'));
});

it('shows bookings only for the workplace that was asked for', function () {
    Booking::create([
        'workplace_id' => 'holz-2',
        'name' => 'Anderer Platz',
        'contact' => 'other@example.org',
        'start_time' => $this->start,
        'end_time' => $this->start->addHour(),
        'chargeable_duration_minutes' => 60,
    ]);

    $this->get(widget(['arbeitsplatz' => 'holz-1']))
        ->assertSee('Nelson Platoni')
        ->assertDontSee('Anderer Platz');
});

it('limits the rows to max, and caps max at twenty', function () {
    foreach (range(1, 25) as $offset) {
        Booking::create([
            'workplace_id' => 'holz-3',
            'name' => "Buchung {$offset}",
            'contact' => "b{$offset}@example.org",
            'start_time' => $this->start->addDays($offset),
            'end_time' => $this->start->addDays($offset)->addHour(),
            'chargeable_duration_minutes' => 60,
        ]);
    }

    $count = fn (string $body) => substr_count($body, '<li>');

    expect($count($this->get(widget(['arbeitsplatz' => 'holz-3', 'max' => 3]))->getContent()))->toBe(3)
        ->and($count($this->get(widget(['arbeitsplatz' => 'holz-3']))->getContent()))->toBe(5)
        ->and($count($this->get(widget(['arbeitsplatz' => 'holz-3', 'max' => 999]))->getContent()))->toBe(20);
});

it('says so when nothing is coming up', function () {
    $this->booking->delete();

    $this->get(widget(['arbeitsplatz' => 'holz-1']))
        ->assertOk()
        ->assertSee('Keine bevorstehenden Buchungen.');
});

it('answers an unknown workplace with 404, a missing one with 422', function () {
    $this->get(widget(['arbeitsplatz' => 'gibt-es-nicht']))->assertNotFound();
    $this->get(widget())->assertStatus(422);
});

it('refuses when the anonymous role may not see bookings', function () {
    $this->anonymous->update(['view_bookings' => false]);

    $this->get(widget(['arbeitsplatz' => 'holz-1']))->assertForbidden();
});

it('shows a logged-in admin nothing other than a visitor sees', function () {
    $asVisitor = $this->get(widget(['arbeitsplatz' => 'holz-1']))->getContent();
    $asAdmin = $this->actingAs($this->admin)->get(widget(['arbeitsplatz' => 'holz-1']))->getContent();

    expect($asAdmin)->toBe($asVisitor)
        ->and($asAdmin)->not->toContain('nelson@example.org');
});
