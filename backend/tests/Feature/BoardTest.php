<?php

use App\Models\Area;
use App\Models\Booking;
use App\Models\Role;
use App\Models\Workplace;
use App\Support\LegacyColor;
use Carbon\CarbonImmutable;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    $this->seed(DatabaseSeeder::class);
    Storage::fake('public');

    $this->anonymous = Role::where('is_anonymous', true)->firstOrFail();

    // 10:00 in Europe/Zurich.
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-09-01 08:00:00', 'UTC'));

    $this->book = fn (string $name, string $from, string $to, string $workplace = 'holz-1') => Booking::create([
        'workplace_id' => $workplace,
        'name' => $name,
        'contact' => 'x@example.org',
        'start_time' => CarbonImmutable::parse($from, 'UTC'),
        'end_time' => CarbonImmutable::parse($to, 'UTC'),
        'chargeable_duration_minutes' => 120,
    ]);
});

afterEach(fn () => CarbonImmutable::setTestNow());

/** The JSON the page hands its script. */
function marking(string $body): array
{
    preg_match('/var marking = (\{.*?\});/s', $body, $match);

    return json_decode($match[1], true, flags: JSON_THROW_ON_ERROR);
}

it('inlines the shipped plan and states the present moment', function () {
    $body = $this->get('/tafel')->assertOk()->getContent();

    expect($body)->toContain('<svg')
        ->and($body)->toContain('id="Arbeitsplätze"')
        ->and($body)->toContain('preserveAspectRatio="xMinYMax meet"')
        ->and($body)->not->toContain('<?xml')
        ->and($body)->not->toContain('<!DOCTYPE svg')
        ->and($body)->toContain('<h1>Di. 1. Sep, 10:00 Uhr</h1>');
});

it('prefers an uploaded plan', function () {
    Storage::disk('public')->put('karte.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><g id="hochgeladen"/></svg>');

    $body = $this->get('/tafel')->getContent();

    expect($body)->toContain('id="hochgeladen"')
        ->and($body)->toContain('width: calc((100vh - 3rem) * 2)');
});

it('marks running bookings busy, imminent ones soon, and blockages like their own', function () {
    ($this->book)('Laeuft', '2026-09-01 07:00:00', '2026-09-01 09:00:00', 'holz-1');
    ($this->book)('Gleich', '2026-09-01 08:20:00', '2026-09-01 09:00:00', 'metall-vorne');
    ($this->book)('Spaeter', '2026-09-01 09:00:00', '2026-09-01 10:00:00', 'holz-2');
    $blocking = ($this->book)('Blockiert', '2026-09-01 07:30:00', '2026-09-01 09:00:00', 'metall-hinten');
    $blocking->setBlockedWorkplaceIds(['holz-3']);

    $taken = marking($this->get('/tafel')->getContent())['taken'];

    expect($taken)->toMatchArray(['holz-1' => 'busy', 'metall-vorne' => 'soon', 'holz-3' => 'busy'])
        ->and($taken)->not->toHaveKey('holz-2');
});

it('frees a bench at the moment its booking ends', function () {
    ($this->book)('Vorbei', '2026-09-01 06:00:00', '2026-09-01 08:00:00');

    expect(marking($this->get('/tafel')->getContent())['taken'])->toBe([]);
});

it('hands over every visible workplace with its area colour in a spelling Safari 10 knows', function () {
    Area::query()->update(['color' => 'oklch(0.8 0.1 130)']);
    Workplace::where('id', 'holz-2')->update(['status' => Workplace::STATUS_DISABLED]);

    $colors = marking($this->get('/tafel')->getContent())['colors'];

    expect($colors['holz-1'])->toBe('rgb(168, 203, 134)')
        ->and($colors)->not->toHaveKey('holz-2');
});

it('lists what is left of today beside the plan', function () {
    ($this->book)('Laeuft', '2026-09-01 07:00:00', '2026-09-01 09:00:00');
    ($this->book)('Am Abend', '2026-09-01 16:00:00', '2026-09-01 18:00:00');
    ($this->book)('Morgen', '2026-09-02 07:00:00', '2026-09-02 09:00:00');

    $body = $this->get('/tafel')->getContent();

    expect($body)->toContain('<h2>Aktuell</h2>')
        ->and($body)->toContain('<h2>Abend</h2>')
        ->and($body)->not->toContain('Morgen');
});

it('marks each agenda row with its area colour', function () {
    Area::query()->update(['color' => 'oklch(0.8 0.1 130)']);
    ($this->book)('Laeuft', '2026-09-01 07:00:00', '2026-09-01 09:00:00');

    expect($this->get('/tafel')->getContent())
        ->toContain('<li  style="background-color: rgb(168, 203, 134)" >');
});

it('leaves out an area colour that is more than a colour', function () {
    Area::query()->update(['color' => 'red; background: url(x)']);
    ($this->book)('Laeuft', '2026-09-01 07:00:00', '2026-09-01 09:00:00');

    expect($this->get('/tafel')->getContent())->not->toContain('url(x)');
});

it('refuses when the anonymous role may not see bookings', function () {
    $this->anonymous->update(['view_bookings' => false]);

    $this->get('/tafel')->assertForbidden();
});

it('converts oklch and oklab, and leaves every other spelling alone', function () {
    expect(LegacyColor::toRgb('oklch(0.8 0.1 130)'))->toBe('rgb(168, 203, 134)')
        ->and(LegacyColor::toRgb('oklch(80% 0.1 130deg)'))->toBe('rgb(168, 203, 134)')
        ->and(LegacyColor::toRgb('oklch(1 0 none)'))->toBe('rgb(255, 255, 255)')
        ->and(LegacyColor::toRgb('oklab(0 0 0 / 50%)'))->toBe('rgba(0, 0, 0, 0.5)')
        ->and(LegacyColor::toRgb('rgb(255,219,73)'))->toBe('rgb(255,219,73)')
        ->and(LegacyColor::toRgb('#abc'))->toBe('#abc');
});
