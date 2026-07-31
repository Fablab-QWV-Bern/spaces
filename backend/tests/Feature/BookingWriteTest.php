<?php

use App\Models\Booking;
use App\Models\Role;
use Carbon\CarbonImmutable;
use Database\Seeders\DatabaseSeeder;
use Spectator\Spectator;

beforeEach(function () {
    Spectator::using('reservation-api.yml');
    $this->seed(DatabaseSeeder::class);

    // Fester Bezugspunkt vor der Öffnung, damit "in der Vergangenheit" eindeutig ist.
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

it('legt eine Buchung an', function () {
    $this->actingAs($this->member)
        ->postJson('/api/bookings', payload())
        ->assertValidRequest()
        ->assertValidResponse(201)
        ->assertJsonPath('workplaceId', 'holz-1')
        ->assertJsonPath('chargeableDurationMinutes', 120)
        ->assertJsonPath('creatorRoleId', $this->member->id);

    expect(Booking::count())->toBe(1);
});

it('haelt den Blockierungs-Snapshot beim Anlegen fest', function () {
    // kurse-holz blockiert holz-1 bis holz-5.
    $this->actingAs($this->member)
        ->postJson('/api/bookings', payload(['workplaceId' => 'kurse-holz']))
        ->assertStatus(201);

    expect(Booking::firstOrFail()->blockedWorkplaceIds())
        ->toBe(['holz-1', 'holz-2', 'holz-3', 'holz-4', 'holz-5']);
});

it('meldet eine Kollision mit 409 und nennt die Buchung', function () {
    $existing = existingBooking();

    $this->actingAs($this->member)
        ->postJson('/api/bookings', payload(['startTime' => CarbonImmutable::parse('2026-08-03 10:00', 'Europe/Zurich')->utc()->toIso8601ZuluString()]))
        ->assertValidResponse(409)
        ->assertJsonPath('conflictingBookingIds', [$existing->id]);

    expect(Booking::count())->toBe(1);
});

it('meldet Regelverstoesse mit 422 und Feldfehlern', function () {
    $this->actingAs($this->member)
        ->postJson('/api/bookings', payload([
            'startTime' => CarbonImmutable::parse('2026-08-03 06:00', 'Europe/Zurich')->utc()->toIso8601ZuluString(),
            'endTime' => CarbonImmutable::parse('2026-08-03 07:00', 'Europe/Zurich')->utc()->toIso8601ZuluString(),
        ]))
        ->assertValidResponse(422)
        ->assertJsonValidationErrors(['startTime']);

    expect(Booking::count())->toBe(0);
});

it('verlangt die Bestaetigung der Nutzungsregeln', function () {
    // shaper-origin hat Nutzungsregeln hinterlegt.
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

it('verweigert das Anlegen ohne manageBookings', function () {
    $this->postJson('/api/bookings', payload())->assertValidResponse(403);
});

it('aendert eine Buchung', function () {
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

it('laesst die geaenderte Buchung nicht mit sich selbst kollidieren', function () {
    $booking = existingBooking();

    // Gleicher Zeitraum, nur ein anderer Name — darf nicht als Kollision gelten.
    $this->actingAs($this->member)
        ->putJson("/api/bookings/{$booking->id}", payload(['name' => 'Neuer Name']))
        ->assertStatus(200);
});

it('loescht eine Buchung', function () {
    $booking = existingBooking();

    $this->actingAs($this->member)
        ->deleteJson("/api/bookings/{$booking->id}")
        ->assertStatus(204);

    expect(Booking::count())->toBe(0);
});

it('laesst vergangene Buchungen in Ruhe', function () {
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

it('prueft eine Buchung vorab, ohne sie anzulegen', function () {
    $this->actingAs($this->member)
        ->postJson('/api/bookings/validate', payload())
        ->assertValidRequest()
        ->assertValidResponse(200)
        ->assertJsonPath('valid', true)
        ->assertJsonPath('chargeableDurationMinutes', 120)
        ->assertJsonPath('violations', []);

    expect(Booking::count())->toBe(0);
});

it('meldet in der Vorabpruefung Kollision und Verstoesse', function () {
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

it('nimmt in der Vorabpruefung die eigene Buchung aus', function () {
    $booking = existingBooking();

    $this->actingAs($this->member)
        ->postJson("/api/bookings/validate?excludeBookingId={$booking->id}", payload())
        ->assertStatus(200)
        ->assertJsonPath('valid', true);
});

it('rechnet die Nettodauer einer Buchung ueber Nacht', function () {
    // Der Bereich Fablab erlaubt Buchungen über Nacht.
    $this->actingAs($this->member)
        ->postJson('/api/bookings', payload([
            'workplaceId' => 'prusa-xl',
            'startTime' => CarbonImmutable::parse('2026-08-03 20:00', 'Europe/Zurich')->utc()->toIso8601ZuluString(),
            'endTime' => CarbonImmutable::parse('2026-08-04 09:00', 'Europe/Zurich')->utc()->toIso8601ZuluString(),
        ]))
        ->assertStatus(201)
        // Nur die Stunden innerhalb der Öffnungszeiten zählen.
        ->assertJsonPath('chargeableDurationMinutes', 120);
});

it('sperrt Buchungen ueber Nacht ausserhalb solcher Bereiche', function () {
    $this->actingAs($this->member)
        ->postJson('/api/bookings', payload([
            'startTime' => CarbonImmutable::parse('2026-08-03 20:00', 'Europe/Zurich')->utc()->toIso8601ZuluString(),
            'endTime' => CarbonImmutable::parse('2026-08-04 09:00', 'Europe/Zurich')->utc()->toIso8601ZuluString(),
        ]))
        ->assertStatus(422)
        ->assertJsonValidationErrors(['endTime']);
});

it('verweigert defekte Arbeitsplaetze', function () {
    $this->actingAs($this->member)
        ->postJson('/api/bookings', payload(['workplaceId' => 'metall-cnc']))
        ->assertStatus(422)
        ->assertJsonValidationErrors(['workplaceId']);
});
