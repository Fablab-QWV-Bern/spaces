<?php

use App\Models\Booking;
use App\Models\Role;
use Carbon\CarbonImmutable;
use Database\Seeders\DatabaseSeeder;
use Spectator\Spectator;

beforeEach(function () {
    Spectator::using('reservation-api.yml');
    $this->seed(DatabaseSeeder::class);

    // A fixed reference point before opening, so that "in the past" is unambiguous.
    $this->travelTo(CarbonImmutable::parse('2026-08-03 07:00', 'Europe/Zurich'));

    $this->member = Role::where('name', 'Mitglied')->firstOrFail();
});

function payload(array $overrides = []): array
{
    return array_merge([
        'workplaceId' => 'holz-1',
        'startTime' => CarbonImmutable::parse('2026-08-03 09:00', 'Europe/Zurich')->utc()->toIso8601ZuluString(),
        'endTime' => CarbonImmutable::parse('2026-08-03 11:00', 'Europe/Zurich')->utc()->toIso8601ZuluString(),
        'name' => 'Testperson',
        'contact' => 'test@example.org',
    ], $overrides);
}

function existingBooking(string $workplaceId = 'holz-1', string $from = '09:00', string $to = '11:00'): Booking
{
    return Booking::create([
        'workplace_id' => $workplaceId,
        'name' => 'Bereits da', 'contact' => 'da@example.org',
        'start_time' => CarbonImmutable::parse("2026-08-03 {$from}", 'Europe/Zurich')->utc(),
        'end_time' => CarbonImmutable::parse("2026-08-03 {$to}", 'Europe/Zurich')->utc(),
        'chargeable_duration_minutes' => 120,
    ]);
}

it('creates a booking', function () {
    $this->actingAs($this->member)
        ->postJson('/api/bookings', payload())
        ->assertValidRequest()
        ->assertValidResponse(201)
        ->assertJsonPath('workplaceId', 'holz-1')
        ->assertJsonPath('chargeableDurationMinutes', 120)
        ->assertJsonPath('creatorRoleId', $this->member->id);

    expect(Booking::count())->toBe(1);
});

it('records the blocking snapshot on creation', function () {
    // kurse-holz blocks holz-1 through holz-5.
    $this->actingAs($this->member)
        ->postJson('/api/bookings', payload(['workplaceId' => 'kurse-holz']))
        ->assertStatus(201);

    expect(Booking::firstOrFail()->blockedWorkplaceIds())
        ->toBe(['holz-1', 'holz-2', 'holz-3', 'holz-4', 'holz-5']);
});

it('a course collides with a booking on a swept-in workplace by default', function () {
    existingBooking('holz-2');

    $this->actingAs($this->member)
        ->postJson('/api/bookings', payload(['workplaceId' => 'kurse-holz']))
        ->assertValidResponse(409);
});

it('leaves the swept-in workplaces free when automatic blocking is switched off', function () {
    // Somebody is already on holz-2 for the window.
    existingBooking('holz-2');

    // A course on kurse-holz would normally take holz-1..5 with it and collide;
    // with the switch on it occupies only kurse-holz itself.
    $this->actingAs($this->member)
        ->postJson('/api/bookings', payload([
            'workplaceId' => 'kurse-holz',
            'skipAutomaticBlocking' => true,
        ]))
        ->assertValidRequest()
        ->assertValidResponse(201)
        ->assertJsonPath('skipAutomaticBlocking', true)
        ->assertJsonPath('blockedWorkplaceIds', []);

    expect(Booking::count())->toBe(2);
});

it('still collides with a booking that blocks this workplace, switch or not', function () {
    // A course on kurse-holz occupies holz-1..5 for the window.
    $this->actingAs($this->member)
        ->postJson('/api/bookings', payload(['workplaceId' => 'kurse-holz']))
        ->assertStatus(201);

    // Booking holz-2 with automatic blocking off must still fail — the switch
    // only drops what this booking would sweep in, not the course that already
    // covers holz-2.
    $this->actingAs($this->member)
        ->postJson('/api/bookings', payload([
            'workplaceId' => 'holz-2',
            'skipAutomaticBlocking' => true,
        ]))
        ->assertValidResponse(409);
});

it('keeps the blocking switch across an update that omits it', function () {
    $this->actingAs($this->member)
        ->postJson('/api/bookings', payload([
            'workplaceId' => 'kurse-holz',
            'skipAutomaticBlocking' => true,
        ]))
        ->assertStatus(201);

    $booking = Booking::firstOrFail();

    // PUT without the field: the switch stays on, the snapshot stays empty.
    $this->actingAs($this->member)
        ->putJson("/api/bookings/{$booking->id}", payload([
            'workplaceId' => 'kurse-holz',
            'name' => 'Geändert',
        ]))
        ->assertValidResponse(200)
        ->assertJsonPath('skipAutomaticBlocking', true)
        ->assertJsonPath('blockedWorkplaceIds', []);

    // PUT with it off: the snapshot fills again from the current rules.
    $this->actingAs($this->member)
        ->putJson("/api/bookings/{$booking->id}", payload([
            'workplaceId' => 'kurse-holz',
            'skipAutomaticBlocking' => false,
        ]))
        ->assertValidResponse(200)
        ->assertJsonPath('skipAutomaticBlocking', false)
        ->assertJsonPath('blockedWorkplaceIds', ['holz-1', 'holz-2', 'holz-3', 'holz-4', 'holz-5']);
});

it('reports a collision with 409 and names the booking', function () {
    $existing = existingBooking();

    $this->actingAs($this->member)
        ->postJson('/api/bookings', payload(['startTime' => CarbonImmutable::parse('2026-08-03 10:00', 'Europe/Zurich')->utc()->toIso8601ZuluString()]))
        ->assertValidResponse(409)
        ->assertJsonPath('conflictingBookingIds', [$existing->id]);

    expect(Booking::count())->toBe(1);
});

it('reports rule violations with 422 and field errors', function () {
    $this->actingAs($this->member)
        ->postJson('/api/bookings', payload([
            'startTime' => CarbonImmutable::parse('2026-08-03 06:00', 'Europe/Zurich')->utc()->toIso8601ZuluString(),
            'endTime' => CarbonImmutable::parse('2026-08-03 07:00', 'Europe/Zurich')->utc()->toIso8601ZuluString(),
        ]))
        ->assertValidResponse(422)
        ->assertJsonValidationErrors(['startTime']);

    expect(Booking::count())->toBe(0);
});

it('requires the usage rules to be acknowledged', function () {
    // shaper-origin has usage rules configured.
    $this->actingAs($this->member)
        ->postJson('/api/bookings', payload(['workplaceId' => 'shaper-origin']))
        ->assertStatus(422)
        ->assertJsonValidationErrors(['usageRulesAcknowledged']);

    $this->actingAs($this->member)
        ->postJson('/api/bookings', payload([
            'workplaceId' => 'shaper-origin',
            'usageRulesAcknowledged' => true,
        ]))
        ->assertStatus(201);
});

it('refuses creation without manageBookings', function () {
    $this->postJson('/api/bookings', payload())->assertValidResponse(403);
});

it('changes a booking', function () {
    $booking = existingBooking();

    $this->actingAs($this->member)
        ->putJson("/api/bookings/{$booking->id}", payload([
            'startTime' => CarbonImmutable::parse('2026-08-03 13:00', 'Europe/Zurich')->utc()->toIso8601ZuluString(),
            'endTime' => CarbonImmutable::parse('2026-08-03 15:00', 'Europe/Zurich')->utc()->toIso8601ZuluString(),
            'name' => 'Geändert',
        ]))
        ->assertValidRequest()
        ->assertValidResponse(200)
        ->assertJsonPath('name', 'Geändert');
});

it('does not let the changed booking collide with itself', function () {
    $booking = existingBooking();

    // Same time range, only a different name — must not count as a collision.
    $this->actingAs($this->member)
        ->putJson("/api/bookings/{$booking->id}", payload(['name' => 'Neuer Name']))
        ->assertStatus(200);
});

it('deletes a booking', function () {
    $booking = existingBooking();

    $this->actingAs($this->member)
        ->deleteJson("/api/bookings/{$booking->id}")
        ->assertStatus(204);

    expect(Booking::count())->toBe(0);
});

it('leaves past bookings alone', function () {
    $booking = existingBooking();
    $this->travelTo(CarbonImmutable::parse('2026-08-04 09:00', 'Europe/Zurich'));

    $this->actingAs($this->member)
        ->putJson("/api/bookings/{$booking->id}", payload())
        ->assertValidResponse(422);

    $this->actingAs($this->member)
        ->deleteJson("/api/bookings/{$booking->id}")
        ->assertStatus(422);

    expect(Booking::count())->toBe(1);
});

it('still allows a running booking to be changed', function () {
    $booking = existingBooking('holz-1', '09:00', '11:00');

    // In the middle of the booking: the start now lies behind us, the end does not.
    $this->travelTo(CarbonImmutable::parse('2026-08-03 10:00', 'Europe/Zurich'));

    $this->actingAs($this->member)
        ->putJson("/api/bookings/{$booking->id}", payload(['name' => 'Verlängert']))
        ->assertValidResponse(200)
        ->assertJsonPath('name', 'Verlängert');
});

it('pre-checks a booking without creating it', function () {
    $this->actingAs($this->member)
        ->postJson('/api/bookings/validate', payload())
        ->assertValidRequest()
        ->assertValidResponse(200)
        ->assertJsonPath('valid', true)
        ->assertJsonPath('chargeableDurationMinutes', 120)
        ->assertJsonPath('violations', []);

    expect(Booking::count())->toBe(0);
});

it('reports collision and violations in the pre-check', function () {
    $existing = existingBooking();

    $this->actingAs($this->member)
        ->postJson('/api/bookings/validate', payload([
            'startTime' => CarbonImmutable::parse('2026-08-03 10:00', 'Europe/Zurich')->utc()->toIso8601ZuluString(),
        ]))
        ->assertValidResponse(200)
        ->assertJsonPath('valid', false)
        ->assertJsonPath('conflictingBookingIds', [$existing->id])
        ->assertJsonPath('violations.0.code', 'COLLISION');
});

it('excludes the booking itself in the pre-check', function () {
    $booking = existingBooking();

    $this->actingAs($this->member)
        ->postJson("/api/bookings/validate?excludeBookingId={$booking->id}", payload())
        ->assertStatus(200)
        ->assertJsonPath('valid', true);
});

it('computes the net duration of an overnight booking', function () {
    // The Fablab area allows overnight bookings.
    $this->actingAs($this->member)
        ->postJson('/api/bookings', payload([
            'workplaceId' => 'prusa-xl',
            'startTime' => CarbonImmutable::parse('2026-08-03 20:00', 'Europe/Zurich')->utc()->toIso8601ZuluString(),
            'endTime' => CarbonImmutable::parse('2026-08-04 09:00', 'Europe/Zurich')->utc()->toIso8601ZuluString(),
        ]))
        ->assertStatus(201)
        // Only the hours within the opening hours count.
        ->assertJsonPath('chargeableDurationMinutes', 120);
});

it('blocks overnight bookings outside such areas', function () {
    $this->actingAs($this->member)
        ->postJson('/api/bookings', payload([
            'startTime' => CarbonImmutable::parse('2026-08-03 20:00', 'Europe/Zurich')->utc()->toIso8601ZuluString(),
            'endTime' => CarbonImmutable::parse('2026-08-04 09:00', 'Europe/Zurich')->utc()->toIso8601ZuluString(),
        ]))
        ->assertStatus(422)
        ->assertJsonValidationErrors(['endTime']);
});

it('refuses broken workplaces', function () {
    $this->actingAs($this->member)
        ->postJson('/api/bookings', payload(['workplaceId' => 'metall-cnc']))
        ->assertStatus(422)
        ->assertJsonValidationErrors(['workplaceId']);
});
