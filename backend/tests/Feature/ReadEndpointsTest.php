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
    // Every request in this file is checked against spec/reservation-api.yml:
    // path, parameters, status code and response schema.
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

it('serves the configuration to everyone', function () {
    $this->getJson('/api/config')
        ->assertOk()
        ->assertJsonPath('opensAt', '08:00')
        ->assertJsonPath('closesAt', '21:00')
        ->assertJsonPath('timezone', 'Europe/Zurich');
});

it('returns the anonymous role when not logged in', function () {
    $this->getJson('/api/session')
        ->assertOk()
        ->assertJsonPath('isAnonymous', true)
        ->assertJsonPath('permissions.viewBookings', true)
        ->assertJsonPath('permissions.manageBookings', false);
});

it('returns the role permissions after logging in', function () {
    $this->actingAs($this->admin)
        ->getJson('/api/session')
        ->assertOk()
        ->assertJsonPath('isAnonymous', false)
        ->assertJsonPath('permissions.manageRoles', true);
});

it('returns areas in their configured order', function () {
    $response = $this->getJson('/api/areas')->assertOk();

    expect(array_column($response->json(), 'name'))
        ->toBe(['Spezial', 'Kurse', 'Holz', 'Metall', 'Fablab', 'Diverses']);
});

it('groups workplaces by area and order', function () {
    $data = $this->getJson('/api/workplaces')->assertOk()->json();

    // The Spezial area first, then Kurse — as in the calendar view.
    expect(array_slice(array_column($data, 'id'), 0, 5))
        ->toBe(['spezial', 'werkstattpflege', 'ruhetag', 'betreuung-offene-ws', 'kurse-holz']);
});

it('resolves tags and blocking on the workplace', function () {
    $data = collect($this->getJson('/api/workplaces')->json())
        ->keyBy('id');

    expect($data['drechselbank']['tags'])->toBe(['lärmig', 'werkstatt'])
        ->and($data['drechselbank']['blocksWorkplaceIds'])->toBe(['holz-6'])
        ->and($data['ruhetag']['blocksWorkplacesWithTag'])->toBe(['werkstatt']);
});

// Careful: only one authentication state per test. An actingAs after a request
// has already been issued no longer takes effect — hence these are two tests.

it('ignores includeDisabled without manageWorkplaces', function () {
    // loeten-2 is DISABLED.
    expect(array_column($this->getJson('/api/workplaces?includeDisabled=1')->json(), 'id'))
        ->not->toContain('loeten-2');
});

it('shows disabled workplaces with manageWorkplaces', function () {
    expect(array_column(
        $this->actingAs($this->admin)->getJson('/api/workplaces?includeDisabled=1')->json(),
        'id',
    ))->toContain('loeten-2');
});

it('loads the workplace lists without N+1', function () {
    DB::enableQueryLog();
    $this->getJson('/api/workplaces')->assertOk();
    $queries = count(DB::getQueryLog());
    DB::disableQueryLog();

    // workplaces, areas, blocksWorkplaces, workplace_tags, workplace_blocks_tags.
    expect($queries)->toBeLessThanOrEqual(6);
});

it('requires a time window for the booking list', function () {
    $this->getJson('/api/bookings')
        ->assertStatus(422)
        ->assertJsonValidationErrors(['from', 'to']);
});

it('returns bookings within the time window', function () {
    $this->getJson(window())
        ->assertOk()
        ->assertJsonCount(1)
        ->assertJsonPath('0.workplaceId', 'holz-1')
        ->assertJsonPath('0.startTime', '2026-08-03T07:00:00Z')
        ->assertJsonPath('0.chargeableDurationMinutes', 120);
});

it('leaves out bookings outside the window', function () {
    $this->getJson(window(['from' => '2026-08-04T00:00:00Z', 'to' => '2026-08-05T00:00:00Z']))
        ->assertOk()
        ->assertJsonCount(0);
});

it('shows the name already with viewBookings but hides the contact', function () {
    $this->getJson(window())
        ->assertOk()
        ->assertJsonPath('0.name', 'Hans Cramer')
        ->assertJsonPath('0.contact', null)
        ->assertJsonPath('0.ipAddress', null);
});

it('additionally shows the contact with viewBookingsDetails', function () {
    $this->actingAs($this->member)
        ->getJson(window())
        ->assertOk()
        ->assertJsonPath('0.name', 'Hans Cramer')
        ->assertJsonPath('0.contact', 'hans@example.org')
        // The IP address nevertheless stays hidden.
        ->assertJsonPath('0.ipAddress', null);
});

it('shows the IP address only with manageRoles', function () {
    $this->actingAs($this->admin)
        ->getJson(window())
        ->assertOk()
        ->assertJsonPath('0.ipAddress', '192.0.2.42');
});

it('refuses the booking list without viewBookings', function () {
    $this->anonymous->update(['view_bookings' => false]);

    $this->getJson(window())->assertStatus(403);
});

it('filters bookings by area', function () {
    $holzArea = Workplace::findOrFail('holz-1')->area_id;

    $this->getJson(window(['areaId' => $holzArea]))->assertOk()->assertJsonCount(1);
    $this->getJson(window(['areaId' => 'gibtsnicht']))->assertOk()->assertJsonCount(0);
});

it('returns the booking blocking snapshot', function () {
    $ruhetag = Booking::create([
        'workplace_id' => 'ruhetag',
        'name' => 'Team', 'contact' => 'team@example.org',
        'start_time' => CarbonImmutable::parse('2026-08-03 08:00', 'Europe/Zurich')->utc(),
        'end_time' => CarbonImmutable::parse('2026-08-03 21:00', 'Europe/Zurich')->utc(),
        'chargeable_duration_minutes' => 780,
    ]);
    $ruhetag->setBlockedWorkplaceIds(app(BlockedWorkplaceResolver::class)->resolve('ruhetag'));

    $data = collect($this->getJson(window())->json())->firstWhere('id', $ruhetag->id);

    // The closure day blocks all workplaces carrying the "werkstatt" tag.
    expect($data['blockedWorkplaceIds'])->toHaveCount(27)
        ->and($data['blockedWorkplaceIds'])->toContain('holz-1');
});
