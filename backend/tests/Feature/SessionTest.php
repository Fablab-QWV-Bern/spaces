<?php

use App\Models\Role;
use Database\Seeders\GlobalSettingSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Support\Facades\RateLimiter;
use Spectator\Spectator;

beforeEach(function () {
    Spectator::using('reservation-api.yml');
    $this->seed(GlobalSettingSeeder::class);
    $this->seed(RoleSeeder::class);
    RateLimiter::clear('login:127.0.0.1');
});

it('meldet mit richtigem Kennwort an', function () {
    $this->postJson('/api/session', [
        'roleName' => 'Mitglied',
        'password' => 'mitglied-kennwort',
    ])
        ->assertValidRequest()
        ->assertValidResponse(200)
        ->assertJsonPath('roleName', 'Mitglied')
        ->assertJsonPath('isAnonymous', false)
        ->assertJsonPath('permissions.manageBookings', true);

    expect(auth()->check())->toBeTrue();
});

it('weist ein falsches Kennwort zurueck', function () {
    $this->postJson('/api/session', [
        'roleName' => 'Mitglied',
        'password' => 'falsch',
    ])->assertValidResponse(401);

    expect(auth()->check())->toBeFalse();
});

it('laesst die anonyme Rolle sich nicht anmelden', function () {
    // Sie hat kein Kennwort — ohne die ausdrueckliche Sperre koennte ein leerer
    // Hash-Vergleich zum Erfolg fuehren.
    $this->postJson('/api/session', [
        'roleName' => 'Anonym',
        'password' => '',
    ])->assertStatus(422);

    $this->postJson('/api/session', [
        'roleName' => 'Anonym',
        'password' => 'irgendwas',
    ])->assertValidResponse(401);
});

it('bremst nach zu vielen Versuchen', function () {
    foreach (range(1, 5) as $ignored) {
        $this->postJson('/api/session', ['roleName' => 'Mitglied', 'password' => 'falsch'])
            ->assertStatus(401);
    }

    $this->postJson('/api/session', ['roleName' => 'Mitglied', 'password' => 'mitglied-kennwort'])
        ->assertValidResponse(429);
});

it('meldet ab und faellt auf die anonyme Rolle zurueck', function () {
    $this->actingAs(Role::where('name', 'Admin')->firstOrFail());

    $this->deleteJson('/api/session')->assertStatus(204);

    expect(auth()->check())->toBeFalse();
});

it('verlangt Rollenname und Kennwort', function () {
    $this->postJson('/api/session', [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['roleName', 'password']);
});

it('listet die anmeldbaren Rollen ohne die anonyme', function () {
    $this->getJson('/api/session/roles')
        ->assertValidRequest()
        ->assertValidResponse(200)
        ->assertExactJson(['Mitglied', 'Admin']);
});
