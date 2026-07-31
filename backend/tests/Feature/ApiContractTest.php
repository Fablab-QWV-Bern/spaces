<?php

use App\Domain\Booking\BlockedWorkplaceResolver;
use App\Models\Booking;
use App\Models\Role;
use Carbon\CarbonImmutable;
use Database\Seeders\DatabaseSeeder;
use Spectator\Spectator;

/**
 * Prüft jede Antwort gegen spec/reservation-api.yml. Damit kann die
 * Implementierung nicht unbemerkt von der Spec abweichen — ein umbenanntes oder
 * vergessenes Feld macht die Testsuite rot.
 */
beforeEach(function () {
    Spectator::using('reservation-api.yml');

    $this->seed(DatabaseSeeder::class);

    // Zwei Buchungen mit unterschiedlichem Datenprofil, damit die Prüfung auch
    // die nullbaren Felder trifft: eine von einer Rolle erstellt, eine ohne.
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

it('haelt den Vertrag fuer /config', function () {
    $this->getJson('/api/config')->assertValidRequest()->assertValidResponse(200);
});

it('haelt den Vertrag fuer /session', function () {
    $this->getJson('/api/session')->assertValidRequest()->assertValidResponse(200);
});

it('haelt den Vertrag fuer /session/roles', function () {
    $this->getJson('/api/session/roles')->assertValidRequest()->assertValidResponse(200);
});

it('haelt den Vertrag fuer /areas', function () {
    $this->getJson('/api/areas')->assertValidRequest()->assertValidResponse(200);
});

it('haelt den Vertrag fuer /areas/{id}', function () {
    $id = $this->getJson('/api/areas')->json('0.id');

    $this->getJson("/api/areas/{$id}")->assertValidRequest()->assertValidResponse(200);
});

it('haelt den Vertrag fuer /workplaces', function () {
    $this->getJson('/api/workplaces')->assertValidRequest()->assertValidResponse(200);
});

it('haelt den Vertrag fuer /workplaces/{id}', function () {
    $this->getJson('/api/workplaces/holz-1')->assertValidRequest()->assertValidResponse(200);
});

it('haelt den Vertrag fuer /bookings', function () {
    $this->getJson('/api/bookings?from=2026-08-03T00:00:00Z&to=2026-08-04T00:00:00Z')
        ->assertValidRequest()
        ->assertValidResponse(200);
});

it('haelt den Vertrag fuer /bookings/{id}', function () {
    $this->getJson("/api/bookings/{$this->booking->id}")
        ->assertValidRequest()
        ->assertValidResponse(200);
});

it('haelt den Vertrag fuer die Fehlerantworten', function () {
    // 422 bei fehlendem Zeitfenster.
    $this->getJson('/api/bookings')->assertValidResponse(422);

    // 404 bei unbekannter Ressource.
    $this->getJson('/api/workplaces/gibtsnicht')->assertValidResponse(404);
});

it('haelt den Vertrag fuer die 403-Antwort', function () {
    Role::where('is_anonymous', true)->update(['view_bookings' => false]);

    $this->getJson('/api/bookings?from=2026-08-03T00:00:00Z&to=2026-08-04T00:00:00Z')
        ->assertValidResponse(403);
});
