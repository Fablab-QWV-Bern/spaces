<?php

use App\Models\Booking;
use App\Models\Role;
use Carbon\CarbonImmutable;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\Hash;
use Spectator\Spectator;

beforeEach(function () {
    Spectator::using('reservation-api.yml');
    $this->seed(DatabaseSeeder::class);

    $this->admin = Role::where('name', 'Admin')->firstOrFail();
    $this->member = Role::where('name', 'Mitglied')->firstOrFail();
    $this->anonymous = Role::anonymous();
});

function permissions(array $overrides = []): array
{
    return array_merge(array_fill_keys(array_keys(Role::PERMISSIONS), false), $overrides);
}

function rolePayload(array $overrides = []): array
{
    return array_merge([
        'name' => 'Kursleitung',
        'password' => 'kursleitung-kennwort',
        'permissions' => permissions(['viewBookings' => true, 'manageBookings' => true]),
    ], $overrides);
}

it('listet die Rollen', function () {
    $this->actingAs($this->admin)
        ->getJson('/api/roles')
        ->assertValidRequest()
        ->assertValidResponse(200)
        ->assertJsonCount(3);
});

it('legt eine Rolle an', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/roles', rolePayload())
        ->assertValidRequest()
        ->assertValidResponse(201)
        ->assertJsonPath('name', 'Kursleitung')
        ->assertJsonPath('isAnonymous', false)
        ->assertJsonPath('permissions.manageBookings', true)
        ->assertJsonPath('permissions.manageRoles', false)
        ->assertHeader('Location');

    $role = Role::where('name', 'Kursleitung')->firstOrFail();

    expect(Hash::check('kursleitung-kennwort', $role->password))->toBeTrue();
});

it('verlangt beim Anlegen ein Kennwort', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/roles', rolePayload(['password' => null]))
        ->assertValidResponse(422);
});

it('weist einen doppelten Namen ab', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/roles', rolePayload(['name' => 'Mitglied']))
        ->assertValidResponse(422);
});

it('aendert Name und Berechtigungen', function () {
    $this->actingAs($this->admin)
        ->putJson("/api/roles/{$this->member->id}", rolePayload([
            'name' => 'Mitglieder',
            'password' => null,
            'permissions' => permissions(['viewBookings' => true]),
        ]))
        ->assertValidRequest()
        ->assertValidResponse(200)
        ->assertJsonPath('name', 'Mitglieder')
        ->assertJsonPath('permissions.manageBookings', false);
});

// Sonst müsste man das Kennwort bei jeder Umbenennung neu setzen.
it('laesst ein weggelassenes Kennwort stehen', function () {
    $before = $this->member->password;

    $this->actingAs($this->admin)
        ->putJson("/api/roles/{$this->member->id}", [
            'name' => 'Mitglied',
            'permissions' => permissions(['viewBookings' => true]),
        ])
        ->assertValidRequest()
        ->assertValidResponse(200);

    expect($this->member->fresh()->password)->toBe($before);
});

it('setzt ein neues Kennwort', function () {
    $this->actingAs($this->admin)
        ->putJson("/api/roles/{$this->member->id}", rolePayload([
            'name' => 'Mitglied',
            'password' => 'ganz-neues-kennwort',
        ]))
        ->assertValidResponse(200);

    expect(Hash::check('ganz-neues-kennwort', $this->member->fresh()->password))->toBeTrue();
});

it('gibt der anonymen Rolle kein Kennwort', function () {
    $this->actingAs($this->admin)
        ->putJson("/api/roles/{$this->anonymous->id}", rolePayload([
            'name' => 'Anonym',
            'password' => 'anonym-kennwort',
            'permissions' => permissions(['viewBookings' => true]),
        ]))
        ->assertValidResponse(422);

    expect($this->anonymous->fresh()->password)->toBeNull();
});

// Sonst könnte sich jeder Aufruf ohne Anmeldung selbst zum Verwalter machen.
it('gibt der anonymen Rolle kein manageRoles', function () {
    $this->actingAs($this->admin)
        ->putJson("/api/roles/{$this->anonymous->id}", rolePayload([
            'name' => 'Anonym',
            'password' => null,
            'permissions' => permissions(['viewBookings' => true, 'manageRoles' => true]),
        ]))
        ->assertValidResponse(422);
});

it('nimmt der letzten verwaltenden Rolle das Recht nicht weg', function () {
    $this->actingAs($this->admin)
        ->putJson("/api/roles/{$this->admin->id}", rolePayload([
            'name' => 'Admin',
            'password' => null,
            'permissions' => permissions(['manageRoles' => false]),
        ]))
        ->assertValidResponse(422);

    expect($this->admin->fresh()->manage_roles)->toBeTrue();
});

it('erlaubt den Entzug, sobald eine zweite Rolle verwalten darf', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/roles', rolePayload([
            'name' => 'Vorstand',
            'permissions' => permissions(['manageRoles' => true]),
        ]))
        ->assertValidResponse(201);

    $this->actingAs($this->admin)
        ->putJson("/api/roles/{$this->admin->id}", rolePayload([
            'name' => 'Admin',
            'password' => null,
            'permissions' => permissions(['manageRoles' => false]),
        ]))
        ->assertValidResponse(200);
});

it('loescht eine Rolle', function () {
    $this->actingAs($this->admin)
        ->deleteJson("/api/roles/{$this->member->id}")
        ->assertValidRequest()
        ->assertValidResponse(204);

    expect(Role::find($this->member->id))->toBeNull();
});

// Die Buchung ist ein historischer Beleg: sie behält die Rollen-ID, auch wenn
// dahinter keine Rolle mehr steht.
it('laesst Buchungen der geloeschten Rolle stehen', function () {
    $booking = Booking::create([
        'workplace_id' => 'holz-1',
        'creator_role_id' => $this->member->id,
        'name' => 'Hans Cramer',
        'contact' => 'hans@example.org',
        'start_time' => CarbonImmutable::parse('2026-08-03 09:00', 'Europe/Zurich')->utc(),
        'end_time' => CarbonImmutable::parse('2026-08-03 11:00', 'Europe/Zurich')->utc(),
        'chargeable_duration_minutes' => 120,
    ]);

    $this->actingAs($this->admin)
        ->deleteJson("/api/roles/{$this->member->id}")
        ->assertValidResponse(204);

    expect($booking->fresh()->creator_role_id)->toBe($this->member->id);
});

it('loescht weder die anonyme noch die letzte verwaltende Rolle', function () {
    $this->actingAs($this->admin)
        ->deleteJson("/api/roles/{$this->anonymous->id}")
        ->assertValidResponse(422);

    $this->actingAs($this->admin)
        ->deleteJson("/api/roles/{$this->admin->id}")
        ->assertValidResponse(422);

    expect(Role::count())->toBe(3);
});

it('laesst nur manageRoles lesen und schreiben', function () {
    $this->actingAs($this->member)->getJson('/api/roles')->assertValidResponse(403);
    $this->actingAs($this->member)->postJson('/api/roles', rolePayload())->assertValidResponse(403);
    $this->getJson('/api/roles')->assertValidResponse(403);
});
