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

it('logs in with the correct password', function () {
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

it('rejects a wrong password', function () {
    $this->postJson('/api/session', [
        'roleName' => 'Mitglied',
        'password' => 'falsch',
    ])->assertValidResponse(401);

    expect(auth()->check())->toBeFalse();
});

it('does not let the anonymous role log in', function () {
    // It has no password — without the explicit block, an empty hash comparison
    // could succeed.
    $this->postJson('/api/session', [
        'roleName' => 'Anonym',
        'password' => '',
    ])->assertStatus(422);

    $this->postJson('/api/session', [
        'roleName' => 'Anonym',
        'password' => 'irgendwas',
    ])->assertValidResponse(401);
});

it('throttles after too many attempts', function () {
    foreach (range(1, 5) as $ignored) {
        $this->postJson('/api/session', ['roleName' => 'Mitglied', 'password' => 'falsch'])
            ->assertStatus(401);
    }

    $this->postJson('/api/session', ['roleName' => 'Mitglied', 'password' => 'mitglied-kennwort'])
        ->assertValidResponse(429);
});

it('logs out and falls back to the anonymous role', function () {
    $this->actingAs(Role::where('name', 'Admin')->firstOrFail());

    $this->deleteJson('/api/session')->assertStatus(204);

    expect(auth()->check())->toBeFalse();
});

it('requires role name and password', function () {
    $this->postJson('/api/session', [])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['roleName', 'password']);
});

it('lists the loggable-in roles without the anonymous one', function () {
    $this->getJson('/api/session/roles')
        ->assertValidRequest()
        ->assertValidResponse(200)
        ->assertExactJson(['Mitglied', 'Admin']);
});
