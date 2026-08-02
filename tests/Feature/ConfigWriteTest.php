<?php

use App\Models\GlobalSetting;
use App\Models\Role;
use Database\Seeders\DatabaseSeeder;
use Spectator\Spectator;

beforeEach(function () {
    Spectator::using('reservation-api.yml');
    $this->seed(DatabaseSeeder::class);

    $this->admin = Role::where('name', 'Admin')->firstOrFail();
    $this->member = Role::where('name', 'Mitglied')->firstOrFail();
});

function configPayload(array $overrides = []): array
{
    return array_merge([
        'opensAt' => '07:00',
        'closesAt' => '22:00',
        'maxBookingEndOffsetDays' => 60,
        'timezone' => 'Europe/Zurich',
    ], $overrides);
}

it('aendert die globale Konfiguration', function () {
    $this->actingAs($this->admin)
        ->putJson('/api/config', configPayload())
        ->assertValidRequest()
        ->assertValidResponse(200)
        ->assertJsonPath('opensAt', '07:00')
        ->assertJsonPath('closesAt', '22:00')
        ->assertJsonPath('maxBookingEndOffsetDays', 60);

    expect(GlobalSetting::current()->timezone)->toBe('Europe/Zurich');
});

// Das Zeitraster ist fix 15 Minuten; eine Öffnung um 07:10 hätte keine Spalte.
it('verlangt Zeiten auf dem Viertelstundenraster', function () {
    $this->actingAs($this->admin)
        ->putJson('/api/config', configPayload(['opensAt' => '07:10']))
        ->assertValidResponse(422);
});

it('verlangt Schluss nach Oeffnung', function () {
    $this->actingAs($this->admin)
        ->putJson('/api/config', configPayload(['opensAt' => '22:00', 'closesAt' => '07:00']))
        ->assertValidResponse(422);

    // Nicht die Länge der Zeichenkette vergleichen: "09:00" und "10:00" sind
    // gleich lang, und trotzdem liegt das eine vor dem anderen.
    $this->actingAs($this->admin)
        ->putJson('/api/config', configPayload(['opensAt' => '09:00', 'closesAt' => '09:00']))
        ->assertValidResponse(422);
});

it('weist eine unbekannte Zeitzone ab', function () {
    $this->actingAs($this->admin)
        ->putJson('/api/config', configPayload(['timezone' => 'Europe/Quartier']))
        ->assertValidResponse(422);
});

it('laesst nur manageRoles schreiben', function () {
    $this->actingAs($this->member)
        ->putJson('/api/config', configPayload())
        ->assertValidResponse(403);

    $this->putJson('/api/config', configPayload())->assertValidResponse(403);
});

it('bleibt fuer alle lesbar', function () {
    $this->getJson('/api/config')->assertValidResponse(200);
});
