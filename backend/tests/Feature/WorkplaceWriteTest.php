<?php

use App\Models\Booking;
use App\Models\Role;
use App\Models\Workplace;
use Carbon\CarbonImmutable;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
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
            'sortOrder' => 5,
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
});

// Only the response is checked against the spec: Spectator compares the
// request's media type literally and trips over the "; boundary=…" that every
// multipart request carries.
it('accepts a photo and derives a thumbnail', function () {
    Storage::fake('public');

    $response = $this->actingAs($this->admin)
        ->post(
            '/api/workplaces/holz-1/photo',
            ['file' => UploadedFile::fake()->image('werkbank.jpg', 2400, 1200)],
            ['Accept' => 'application/json'],
        )
        ->assertValidResponse(200);

    $photo = $response->json('photoUrl');
    $thumbnail = $response->json('photoThumbnailUrl');

    // Without scheme and host — API, storage and SPA live on the same host.
    expect($photo)->toStartWith('/storage/')
        ->and($thumbnail)->toStartWith('/storage/')
        ->and($photo)->not->toBe($thumbnail);

    $workplace = Workplace::findOrFail('holz-1');

    Storage::disk('public')->assertExists($workplace->photo_path);
    Storage::disk('public')->assertExists($workplace->photo_thumbnail_path);

    // Scaled down to the longer edge, aspect ratio preserved.
    $size = getimagesizefromstring(Storage::disk('public')->get($workplace->photo_thumbnail_path));
    expect($size[0])->toBe(400)->and($size[1])->toBe(200);
});

it('replaces an existing photo and leaves nothing behind', function () {
    Storage::fake('public');

    $upload = fn () => $this->actingAs($this->admin)->post(
        '/api/workplaces/holz-1/photo',
        ['file' => UploadedFile::fake()->image('werkbank.jpg', 800, 600)],
        ['Accept' => 'application/json'],
    );

    $upload()->assertValidResponse(200);
    $first = Workplace::findOrFail('holz-1')->photo_path;

    $this->travel(1)->seconds();

    $upload()->assertValidResponse(200);
    $second = Workplace::findOrFail('holz-1')->photo_path;

    expect($second)->not->toBe($first);
    Storage::disk('public')->assertMissing($first);
});

it('deletes the photo', function () {
    Storage::fake('public');

    $this->actingAs($this->admin)->post(
        '/api/workplaces/holz-1/photo',
        ['file' => UploadedFile::fake()->image('werkbank.jpg', 800, 600)],
        ['Accept' => 'application/json'],
    );

    $path = Workplace::findOrFail('holz-1')->photo_path;

    $this->actingAs($this->admin)
        ->deleteJson('/api/workplaces/holz-1/photo')
        ->assertValidRequest()
        ->assertValidResponse(204);

    Storage::disk('public')->assertMissing($path);
    expect(Workplace::findOrFail('holz-1')->photo_path)->toBeNull();
});

it('rejects a file that is not an image', function () {
    Storage::fake('public');

    $this->actingAs($this->admin)
        ->post(
            '/api/workplaces/holz-1/photo',
            ['file' => UploadedFile::fake()->create('handbuch.pdf', 100, 'application/pdf')],
            ['Accept' => 'application/json'],
        )
        ->assertValidResponse(422);
});
