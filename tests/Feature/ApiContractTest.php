<?php

use App\Domain\Booking\BlockedWorkplaceResolver;
use App\Models\Booking;
use App\Models\Role;
use Carbon\CarbonImmutable;
use Database\Seeders\DatabaseSeeder;
use Spectator\Spectator;

/**
 * Checks every response against spec/reservation-api.yml. That way the
 * implementation cannot drift from the spec unnoticed — a renamed or forgotten
 * field turns the test suite red.
 */
beforeEach(function () {
    Spectator::using('reservation-api.yml');

    $this->seed(DatabaseSeeder::class);

    // Two bookings with different data profiles, so that the check also covers
    // the nullable fields: one created by a role, one without.
    Booking::create([
        'workplace_id' => 'holz-1',
        'creator_role_id' => Role::where('name', 'Mitglied')->value('id'),
        'ip_address' => '192.0.2.42',
        'name' => 'Hans Cramer',
        'contact' => 'hans@example.org',
        'start_time' => CarbonImmutable::parse('2026-08-03 09:00', 'Europe/Zurich')->utc(),
        'end_time' => CarbonImmutable::parse('2026-08-03 11:00', 'Europe/Zurich')->utc(),
        'chargeable_duration_minutes' => 120,
    ]);

    $ruhetag = Booking::create([
        'workplace_id' => 'ruhetag',
        'name' => 'Team',
        'contact' => 'team@example.org',
        'start_time' => CarbonImmutable::parse('2026-08-03 08:00', 'Europe/Zurich')->utc(),
        'end_time' => CarbonImmutable::parse('2026-08-03 21:00', 'Europe/Zurich')->utc(),
        'chargeable_duration_minutes' => 780,
    ]);

    $ruhetag->setBlockedWorkplaceIds(app(BlockedWorkplaceResolver::class)->resolve('ruhetag'));

    $this->booking = $ruhetag;
});

it('holds the contract for /config', function () {
    $this->getJson('/api/config')->assertValidRequest()->assertValidResponse(200);
});

it('holds the contract for /session', function () {
    $this->getJson('/api/session')->assertValidRequest()->assertValidResponse(200);
});

it('holds the contract for /session/roles', function () {
    $this->getJson('/api/session/roles')->assertValidRequest()->assertValidResponse(200);
});

it('holds the contract for /roles', function () {
    $admin = Role::where('name', 'Admin')->firstOrFail();

    $this->actingAs($admin)->getJson('/api/roles')->assertValidRequest()->assertValidResponse(200);

    $this->actingAs($admin)
        ->getJson("/api/roles/{$admin->id}")
        ->assertValidRequest()
        ->assertValidResponse(200);
});

it('holds the contract for /areas', function () {
    $this->getJson('/api/areas')->assertValidRequest()->assertValidResponse(200);
});

it('holds the contract for /areas/{id}', function () {
    $id = $this->getJson('/api/areas')->json('0.id');

    $this->getJson("/api/areas/{$id}")->assertValidRequest()->assertValidResponse(200);
});

it('holds the contract for /workplaces', function () {
    $this->getJson('/api/workplaces')->assertValidRequest()->assertValidResponse(200);
});

it('holds the contract for /workplaces/{id}', function () {
    $this->getJson('/api/workplaces/holz-1')->assertValidRequest()->assertValidResponse(200);
});

it('holds the contract for /bookings', function () {
    $this->getJson('/api/bookings?from=2026-08-03T00:00:00Z&to=2026-08-04T00:00:00Z')
        ->assertValidRequest()
        ->assertValidResponse(200);
});

it('holds the contract for /bookings/{id}', function () {
    $this->getJson("/api/bookings/{$this->booking->id}")
        ->assertValidRequest()
        ->assertValidResponse(200);
});

it('holds the contract for /calendar.ics', function () {
    $this->get('/api/calendar.ics')->assertValidRequest()->assertValidResponse(200);

    $this->get('/api/calendar.ics?workplaceId=holz-1')->assertValidRequest()->assertValidResponse(200);

    $this->get('/api/calendar.ics?workplaceId=gibtsnicht')->assertValidResponse(404);
});

it('holds the contract for the error responses', function () {
    // 422 for a missing time window.
    $this->getJson('/api/bookings')->assertValidResponse(422);

    // 404 for an unknown resource.
    $this->getJson('/api/workplaces/gibtsnicht')->assertValidResponse(404);
});

it('holds the contract for the 403 response', function () {
    Role::where('is_anonymous', true)->update(['view_bookings' => false]);

    $this->getJson('/api/bookings?from=2026-08-03T00:00:00Z&to=2026-08-04T00:00:00Z')
        ->assertValidResponse(403);
});
