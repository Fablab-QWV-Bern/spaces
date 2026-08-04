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

it('changes the global configuration', function () {
    $this->actingAs($this->admin)
        ->putJson('/api/config', configPayload())
        ->assertValidRequest()
        ->assertValidResponse(200)
        ->assertJsonPath('opensAt', '07:00')
        ->assertJsonPath('closesAt', '22:00')
        ->assertJsonPath('maxBookingEndOffsetDays', 60);

    expect(GlobalSetting::current()->timezone)->toBe('Europe/Zurich');
});

// The time grid is fixed at 15 minutes; an opening at 07:10 would have no column.
it('requires times on the quarter-hour grid', function () {
    $this->actingAs($this->admin)
        ->putJson('/api/config', configPayload(['opensAt' => '07:10']))
        ->assertValidResponse(422);
});

it('requires closing after opening', function () {
    $this->actingAs($this->admin)
        ->putJson('/api/config', configPayload(['opensAt' => '22:00', 'closesAt' => '07:00']))
        ->assertValidResponse(422);

    // Do not compare the string length: "09:00" and "10:00" are the same length
    // and yet one comes before the other.
    $this->actingAs($this->admin)
        ->putJson('/api/config', configPayload(['opensAt' => '09:00', 'closesAt' => '09:00']))
        ->assertValidResponse(422);
});

it('rejects an unknown timezone', function () {
    $this->actingAs($this->admin)
        ->putJson('/api/config', configPayload(['timezone' => 'Europe/Quartier']))
        ->assertValidResponse(422);
});

it('lets only manageRoles write', function () {
    $this->actingAs($this->member)
        ->putJson('/api/config', configPayload())
        ->assertValidResponse(403);

    $this->putJson('/api/config', configPayload())->assertValidResponse(403);
});

it('stays readable by everyone', function () {
    $this->getJson('/api/config')->assertValidResponse(200);
});
