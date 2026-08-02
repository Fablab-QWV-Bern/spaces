<?php

use App\Domain\Booking\BlockedWorkplaceResolver;
use App\Models\Booking;
use App\Models\Role;
use App\Models\Workplace;
use Carbon\CarbonImmutable;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Spectator\Spectator;

beforeEach(function () {
    // Jede Anfrage in dieser Datei wird gegen spec/reservation-api.yml geprueft:
    // Pfad, Parameter, Statuscode und Antwortschema.
    Spectator::using('reservation-api.yml');

    $this->seed(DatabaseSeeder::class);

    $this->anonymous = Role::where('is_anonymous', true)->firstOrFail();
    $this->member = Role::where('name', 'Mitglied')->firstOrFail();
    $this->admin = Role::where('name', 'Admin')->firstOrFail();

    $this->booking = Booking::create([
        'workplace_id' => 'holz-1',
        'creator_role_id' => $this->member->id,
        'ip_address' => '192.0.2.42',
        'name' => 'Hans Cramer',
        'contact' => 'hans@example.org',
        'start_time' => CarbonImmutable::parse('2026-08-03 09:00', 'Europe/Zurich')->utc(),
        'end_time' => CarbonImmutable::parse('2026-08-03 11:00', 'Europe/Zurich')->utc(),
        'chargeable_duration_minutes' => 120,
    ]);
});

function window(array $extra = []): string
{
    return '/api/bookings?'.http_build_query(array_merge([
        'from' => '2026-08-03T00:00:00Z',
        'to' => '2026-08-04T00:00:00Z',
    ], $extra));
}

it('liefert die Konfiguration an alle aus', function () {
    $this->getJson('/api/config')
        ->assertOk()
        ->assertJsonPath('opensAt', '08:00')
        ->assertJsonPath('closesAt', '21:00')
        ->assertJsonPath('timezone', 'Europe/Zurich');
});

it('liefert ohne Anmeldung die anonyme Rolle', function () {
    $this->getJson('/api/session')
        ->assertOk()
        ->assertJsonPath('isAnonymous', true)
        ->assertJsonPath('permissions.viewBookings', true)
        ->assertJsonPath('permissions.manageBookings', false);
});

it('liefert nach Anmeldung die Rechte der Rolle', function () {
    $this->actingAs($this->admin)
        ->getJson('/api/session')
        ->assertOk()
        ->assertJsonPath('isAnonymous', false)
        ->assertJsonPath('permissions.manageRoles', true);
});

it('liefert Bereiche in ihrer Reihenfolge', function () {
    $response = $this->getJson('/api/areas')->assertOk();

    expect(array_column($response->json(), 'name'))
        ->toBe(['Spezial', 'Kurse', 'Holz', 'Metall', 'Fablab', 'Diverses']);
});

it('gruppiert Arbeitsplaetze nach Bereich und Reihenfolge', function () {
    $data = $this->getJson('/api/workplaces')->assertOk()->json();

    // Erst der Bereich Spezial, dann Kurse — wie in der Kalenderansicht.
    expect(array_slice(array_column($data, 'id'), 0, 5))
        ->toBe(['spezial', 'werkstattpflege', 'ruhetag', 'betreuung-offene-ws', 'kurse-holz']);
});

it('loest Tags und Blockierungen im Arbeitsplatz auf', function () {
    $data = collect($this->getJson('/api/workplaces')->json())
        ->keyBy('id');

    expect($data['drechselbank']['tags'])->toBe(['lärmig', 'werkstatt'])
        ->and($data['drechselbank']['blocksWorkplaceIds'])->toBe(['holz-6'])
        ->and($data['ruhetag']['blocksWorkplacesWithTag'])->toBe(['werkstatt']);
});

// Achtung: pro Test nur ein Anmeldezustand. Ein actingAs nach einer bereits
// abgesetzten Anfrage greift nicht mehr — deshalb sind das zwei Tests.

it('ignoriert includeDisabled ohne manageWorkplaces', function () {
    // loeten-2 ist DISABLED.
    expect(array_column($this->getJson('/api/workplaces?includeDisabled=1')->json(), 'id'))
        ->not->toContain('loeten-2');
});

it('zeigt deaktivierte Arbeitsplaetze mit manageWorkplaces', function () {
    expect(array_column(
        $this->actingAs($this->admin)->getJson('/api/workplaces?includeDisabled=1')->json(),
        'id',
    ))->toContain('loeten-2');
});

it('laedt die Listen der Arbeitsplaetze ohne N+1', function () {
    DB::enableQueryLog();
    $this->getJson('/api/workplaces')->assertOk();
    $queries = count(DB::getQueryLog());
    DB::disableQueryLog();

    // Arbeitsplätze, Bereiche, blocksWorkplaces, workplace_tags, workplace_blocks_tags.
    expect($queries)->toBeLessThanOrEqual(6);
});

it('verlangt ein Zeitfenster fuer die Buchungsliste', function () {
    $this->getJson('/api/bookings')
        ->assertStatus(422)
        ->assertJsonValidationErrors(['from', 'to']);
});

it('liefert Buchungen im Zeitfenster', function () {
    $this->getJson(window())
        ->assertOk()
        ->assertJsonCount(1)
        ->assertJsonPath('0.workplaceId', 'holz-1')
        ->assertJsonPath('0.startTime', '2026-08-03T07:00:00Z')
        ->assertJsonPath('0.chargeableDurationMinutes', 120);
});

it('laesst Buchungen ausserhalb des Fensters weg', function () {
    $this->getJson(window(['from' => '2026-08-04T00:00:00Z', 'to' => '2026-08-05T00:00:00Z']))
        ->assertOk()
        ->assertJsonCount(0);
});

it('zeigt den Namen bereits mit viewBookings, verbirgt aber den Kontakt', function () {
    $this->getJson(window())
        ->assertOk()
        ->assertJsonPath('0.name', 'Hans Cramer')
        ->assertJsonPath('0.contact', null)
        ->assertJsonPath('0.ipAddress', null);
});

it('zeigt zusaetzlich den Kontakt mit viewBookingsDetails', function () {
    $this->actingAs($this->member)
        ->getJson(window())
        ->assertOk()
        ->assertJsonPath('0.name', 'Hans Cramer')
        ->assertJsonPath('0.contact', 'hans@example.org')
        // Die IP-Adresse bleibt trotzdem verborgen.
        ->assertJsonPath('0.ipAddress', null);
});

it('zeigt die IP-Adresse nur mit manageRoles', function () {
    $this->actingAs($this->admin)
        ->getJson(window())
        ->assertOk()
        ->assertJsonPath('0.ipAddress', '192.0.2.42');
});

it('verweigert die Buchungsliste ohne viewBookings', function () {
    $this->anonymous->update(['view_bookings' => false]);

    $this->getJson(window())->assertStatus(403);
});

it('filtert Buchungen nach Bereich', function () {
    $holzArea = Workplace::findOrFail('holz-1')->area_id;

    $this->getJson(window(['areaId' => $holzArea]))->assertOk()->assertJsonCount(1);
    $this->getJson(window(['areaId' => 'gibtsnicht']))->assertOk()->assertJsonCount(0);
});

it('liefert den Blockierungs-Snapshot der Buchung mit', function () {
    $ruhetag = Booking::create([
        'workplace_id' => 'ruhetag',
        'name' => 'Team', 'contact' => 'team@example.org',
        'start_time' => CarbonImmutable::parse('2026-08-03 08:00', 'Europe/Zurich')->utc(),
        'end_time' => CarbonImmutable::parse('2026-08-03 21:00', 'Europe/Zurich')->utc(),
        'chargeable_duration_minutes' => 780,
    ]);
    $ruhetag->setBlockedWorkplaceIds(app(BlockedWorkplaceResolver::class)->resolve('ruhetag'));

    $data = collect($this->getJson(window())->json())->firstWhere('id', $ruhetag->id);

    // Der Ruhetag blockiert alle Plätze mit dem Tag "werkstatt".
    expect($data['blockedWorkplaceIds'])->toHaveCount(27)
        ->and($data['blockedWorkplaceIds'])->toContain('holz-1');
});
