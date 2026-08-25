<?php

use App\Models\Booking;
use App\Models\Role;
use App\Models\Workplace;
use Carbon\CarbonImmutable;
use Database\Seeders\DatabaseSeeder;
use Spectator\Spectator;

beforeEach(function () {
    Spectator::using('reservation-api.yml');
    $this->seed(DatabaseSeeder::class);

    $this->travelTo(CarbonImmutable::parse('2026-08-03 07:00', 'Europe/Zurich'));

    $this->admin = Role::where('name', 'Admin')->firstOrFail();
    $this->member = Role::where('name', 'Mitglied')->firstOrFail();
    $this->areaId = Workplace::findOrFail('holz-1')->area_id;
});

function workplacePayload(array $overrides = []): array
{
    return array_merge([
        'id' => 'hobelbank-1',
        'name' => 'Hobelbank 1',
        'status' => 'OK',
        'areaId' => test()->areaId,
    ], $overrides);
}

it('creates a workplace', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/workplaces', workplacePayload([
            'description' => 'Lange Bank am Fenster.',
            'tags' => ['#Laut', 'laut', 'Staubig'],
            'blocksWorkplaceIds' => ['holz-2'],
            'blocksWorkplacesWithTag' => ['leise'],
        ]))
        ->assertValidRequest()
        ->assertValidResponse(201)
        ->assertJsonPath('id', 'hobelbank-1')
        // Tags come back without "#" and without duplicates; the first spelling wins.
        ->assertJsonPath('tags', ['Laut', 'Staubig'])
        ->assertJsonPath('blocksWorkplaceIds', ['holz-2'])
        ->assertJsonPath('blocksWorkplacesWithTag', ['leise'])
        ->assertHeader('Location');
});

it('rejects a duplicate identifier with 409', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/workplaces', workplacePayload(['id' => 'holz-1']))
        ->assertValidResponse(409);
});

it('rejects an identifier that does not fit into a URL', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/workplaces', workplacePayload(['id' => 'Hobelbank 1']))
        ->assertValidResponse(422);
});

it('changes a workplace', function () {
    $this->actingAs($this->admin)
        ->putJson('/api/workplaces/holz-1', workplacePayload([
            'name' => 'Holz 1 neu',
            'status' => 'DEFECT',
            'wikiUrl' => 'https://wiki.example.org/holz-1',
            'maxBookingDurationMinutes' => 120,
        ]))
        ->assertValidRequest()
        ->assertValidResponse(200)
        ->assertJsonPath('id', 'holz-1')
        ->assertJsonPath('name', 'Holz 1 neu')
        ->assertJsonPath('status', 'DEFECT')
        ->assertJsonPath('maxBookingDurationMinutes', 120);
});

// The identifier is in the path; one sent along in the body is ignored.
it('does not change the identifier along with it', function () {
    $this->actingAs($this->admin)
        ->putJson('/api/workplaces/holz-1', workplacePayload(['id' => 'ganz-anders']))
        ->assertValidResponse(200)
        ->assertJsonPath('id', 'holz-1');

    expect(Workplace::find('ganz-anders'))->toBeNull();
});

it('does not block itself', function () {
    $this->actingAs($this->admin)
        ->putJson('/api/workplaces/holz-1', workplacePayload([
            'blocksWorkplaceIds' => ['holz-1', 'holz-2'],
        ]))
        ->assertValidResponse(200)
        ->assertJsonPath('blocksWorkplaceIds', ['holz-2']);
});

it('numbers the order anew within each area', function () {
    $areaId = Workplace::findOrFail('holz-1')->area_id;

    $inArea = Workplace::where('area_id', $areaId)
        ->orderBy('sort_order')->orderBy('name')->pluck('id')->all();
    $elsewhere = Workplace::where('area_id', '!=', $areaId)->pluck('id')->all();

    $reversed = array_reverse($inArea);

    $this->actingAs($this->admin)
        ->putJson('/api/workplaces/order', ['ids' => [...$elsewhere, ...$reversed]])
        ->assertValidRequest()
        ->assertValidResponse(200);

    expect(Workplace::where('area_id', $areaId)->orderBy('sort_order')->pluck('id')->all())
        ->toBe($reversed)
        // The position counts within the area, so every area starts at 0.
        ->and(Workplace::where('area_id', $areaId)->min('sort_order'))->toBe(0);
});

it('refuses an incomplete order', function () {
    $this->actingAs($this->admin)
        ->putJson('/api/workplaces/order', ['ids' => ['holz-1']])
        ->assertValidResponse(422);
});

// The list comes from the admin view, and there the hidden ones are visible too.
it('expects the disabled workplaces in the order as well', function () {
    Workplace::findOrFail('holz-2')->update(['status' => Workplace::STATUS_DISABLED]);

    $ids = Workplace::where('status', '!=', Workplace::STATUS_DISABLED)->pluck('id')->all();

    $this->actingAs($this->admin)
        ->putJson('/api/workplaces/order', ['ids' => $ids])
        ->assertValidResponse(422);
});

it('deletes a workplace and clears it from other blocking lists', function () {
    $this->actingAs($this->admin)
        ->putJson('/api/workplaces/holz-2', workplacePayload([
            'id' => 'holz-2',
            'name' => 'Holz 2',
            'blocksWorkplaceIds' => ['holz-3'],
        ]))
        ->assertValidResponse(200);

    $this->actingAs($this->admin)
        ->deleteJson('/api/workplaces/holz-3')
        ->assertValidRequest()
        ->assertValidResponse(204);

    expect(Workplace::find('holz-3'))->toBeNull();
    expect(Workplace::findOrFail('holz-2')->blocksWorkplaces()->pluck('id')->all())->toBe([]);
});

it('refuses deletion when there are future bookings', function () {
    Booking::create([
        'workplace_id' => 'holz-3',
        'name' => 'Später', 'contact' => 'spaeter@example.org',
        'start_time' => CarbonImmutable::parse('2026-08-03 09:00', 'Europe/Zurich')->utc(),
        'end_time' => CarbonImmutable::parse('2026-08-03 11:00', 'Europe/Zurich')->utc(),
        'chargeable_duration_minutes' => 120,
    ]);

    $this->actingAs($this->admin)
        ->deleteJson('/api/workplaces/holz-3')
        ->assertValidResponse(422);

    expect(Workplace::find('holz-3'))->not->toBeNull();
});

it('lets only manageWorkplaces write', function () {
    $this->actingAs($this->member)
        ->postJson('/api/workplaces', workplacePayload())
        ->assertValidResponse(403);

    $this->deleteJson('/api/workplaces/holz-1')->assertValidResponse(403);

    $this->actingAs($this->member)
        ->putJson('/api/workplaces/order', ['ids' => Workplace::pluck('id')->all()])
        ->assertValidResponse(403);
});
