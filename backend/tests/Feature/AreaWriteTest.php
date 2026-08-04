<?php

use App\Models\Area;
use App\Models\Role;
use App\Models\Workplace;
use Database\Seeders\DatabaseSeeder;
use Spectator\Spectator;

beforeEach(function () {
    Spectator::using('reservation-api.yml');
    $this->seed(DatabaseSeeder::class);

    $this->admin = Role::where('name', 'Admin')->firstOrFail();
    $this->member = Role::where('name', 'Mitglied')->firstOrFail();
});

function areaPayload(array $overrides = []): array
{
    return array_merge([
        'name' => 'Textil',
        'color' => 'oklch(0.8 0.1 20)',
        'maxBookingDurationMinutes' => 240,
        'allowNightlyActivities' => false,
    ], $overrides);
}

it('creates an area', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/areas', areaPayload())
        ->assertValidRequest()
        ->assertValidResponse(201)
        ->assertJsonPath('name', 'Textil')
        ->assertJsonPath('maxBookingEndOffsetDays', null)
        ->assertHeader('Location');

    expect(Area::where('name', 'Textil')->exists())->toBeTrue();
});

it('changes an area', function () {
    $area = Area::where('name', 'Holz')->firstOrFail();

    $this->actingAs($this->admin)
        ->putJson("/api/areas/{$area->id}", areaPayload([
            'name' => 'Holzwerkstatt',
            'maxBookingEndOffsetDays' => 90,
            'sortOrder' => 35,
        ]))
        ->assertValidRequest()
        ->assertValidResponse(200)
        ->assertJsonPath('name', 'Holzwerkstatt')
        ->assertJsonPath('maxBookingEndOffsetDays', 90)
        ->assertJsonPath('sortOrder', 35);
});

// PUT replaces the whole area — an omitted field does not keep its previous
// value, otherwise the horizon could never be set back to "global".
it('resets omitted fields', function () {
    $area = Area::where('name', 'Kurse')->firstOrFail();
    expect($area->max_booking_end_offset_days)->not->toBeNull();

    $this->actingAs($this->admin)
        ->putJson("/api/areas/{$area->id}", areaPayload())
        ->assertValidResponse(200)
        ->assertJsonPath('maxBookingEndOffsetDays', null);
});

it('deletes an empty area', function () {
    $area = Area::create([
        'name' => 'Leer',
        'color' => 'oklch(0.8 0.1 20)',
        'max_booking_duration_minutes' => 60,
    ]);

    $this->actingAs($this->admin)
        ->deleteJson("/api/areas/{$area->id}")
        ->assertValidRequest()
        ->assertValidResponse(204);

    expect(Area::find($area->id))->toBeNull();
});

it('refuses deletion while workplaces are assigned', function () {
    $area = Workplace::findOrFail('holz-1')->area;

    $this->actingAs($this->admin)
        ->deleteJson("/api/areas/{$area->id}")
        ->assertValidResponse(422);

    expect(Area::find($area->id))->not->toBeNull();
});

it('rejects invalid input', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/areas', areaPayload(['maxBookingDurationMinutes' => 20]))
        ->assertValidResponse(422);

    $this->actingAs($this->admin)
        ->postJson('/api/areas', areaPayload(['name' => '']))
        ->assertValidResponse(422);
});

it('lets only manageAreas write', function () {
    $this->actingAs($this->member)
        ->postJson('/api/areas', areaPayload())
        ->assertValidResponse(403);

    $this->postJson('/api/areas', areaPayload())->assertValidResponse(403);
});
