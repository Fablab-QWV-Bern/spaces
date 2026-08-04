<?php

use App\Models\Booking;
use App\Models\BookingSeries;
use App\Models\Role;
use Carbon\CarbonImmutable;
use Database\Seeders\BookingSeeder;
use Database\Seeders\DatabaseSeeder;
use Spectator\Spectator;

beforeEach(function () {
    Spectator::using('reservation-api.yml');
    $this->seed(DatabaseSeeder::class);

    // A fixed reference point before opening time, so that "in the past" is
    // unambiguous. 3 August 2026 is a Monday.
    $this->travelTo(CarbonImmutable::parse('2026-08-03 07:00', 'Europe/Zurich'));

    $this->admin = Role::where('name', 'Admin')->firstOrFail();
    $this->member = Role::where('name', 'Mitglied')->firstOrFail();
});

function seriesPayload(array $overrides = []): array
{
    return array_merge([
        'workplaceId' => 'holz-1',
        'name' => 'Reparaturcafé',
        'contact' => 'reparatur@example.org',
        'interval' => 'WEEKLY',
        'intervalCount' => 1,
        'firstInstanceStart' => '2026-08-03T09:00',
        'firstInstanceEnd' => '2026-08-03T11:00',
        'endDate' => '2026-08-31',
    ], $overrides);
}

/** A series' instances as local timestamps, in chronological order. */
function instances(BookingSeries $series): array
{
    return $series->bookings()
        ->orderBy('start_time')
        ->get()
        ->map(fn (Booking $booking): string => $booking->start_time
            ->setTimezone('Europe/Zurich')
            ->format('Y-m-d H:i'))
        ->all();
}

it('creates a series and generates its instances', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload())
        ->assertValidRequest()
        ->assertValidResponse(201)
        ->assertHeader('Location')
        ->assertJsonPath('series.firstInstanceStart', '2026-08-03T09:00')
        ->assertJsonPath('series.instantiatedUntil', '2027-08-03')
        ->assertJsonPath('skippedInstances', []);

    expect(instances(BookingSeries::firstOrFail()))->toBe([
        '2026-08-03 09:00',
        '2026-08-10 09:00',
        '2026-08-17 09:00',
        '2026-08-24 09:00',
        '2026-08-31 09:00',
    ]);
});

it('copies name, contact and blocking onto every instance', function () {
    // kurse-holz blocks holz-1 through holz-5.
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload([
            'workplaceId' => 'kurse-holz',
            'endDate' => '2026-08-10',
        ]))
        ->assertStatus(201);

    $booking = Booking::orderBy('start_time')->firstOrFail();

    expect($booking->name)->toBe('Reparaturcafé')
        ->and($booking->contact)->toBe('reparatur@example.org')
        ->and($booking->creator_role_id)->toBeNull()
        ->and($booking->usage_rules_acknowledged)->toBeTrue()
        ->and($booking->chargeable_duration_minutes)->toBe(120)
        ->and($booking->blockedWorkplaceIds())
        ->toBe(['holz-1', 'holz-2', 'holz-3', 'holz-4', 'holz-5']);
});

it('stays at the same time of day across a DST change', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload(['endDate' => '2026-10-26']))
        ->assertStatus(201);

    // Summer time ends on 25 October 2026. Locally it stays 09:00; in UTC the
    // instant moves from 07:00 to 08:00.
    $starts = Booking::orderBy('start_time')
        ->get()
        ->mapWithKeys(fn (Booking $booking): array => [
            $booking->start_time->setTimezone('Europe/Zurich')->toDateString() => $booking->start_time->toIso8601ZuluString(),
        ]);

    expect($starts['2026-10-19'])->toBe('2026-10-19T07:00:00Z')
        ->and($starts['2026-10-26'])->toBe('2026-10-26T08:00:00Z');
});

it('skips the months without that day for MONTHLY', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload([
            'interval' => 'MONTHLY',
            'firstInstanceStart' => '2026-08-31T09:00',
            'firstInstanceEnd' => '2026-08-31T11:00',
            'endDate' => '2027-03-31',
        ]))
        ->assertStatus(201);

    // September, November and February have no 31st — they drop out rather than
    // sliding onto the last day of the month.
    expect(instances(BookingSeries::firstOrFail()))->toBe([
        '2026-08-31 09:00',
        '2026-10-31 09:00',
        '2026-12-31 09:00',
        '2027-01-31 09:00',
        '2027-03-31 09:00',
    ]);
});

it('takes the interval count into account', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload([
            'intervalCount' => 2,
            'endDate' => '2026-09-30',
        ]))
        ->assertStatus(201);

    expect(instances(BookingSeries::firstOrFail()))->toBe([
        '2026-08-03 09:00',
        '2026-08-17 09:00',
        '2026-08-31 09:00',
        '2026-09-14 09:00',
        '2026-09-28 09:00',
    ]);
});

it('generates up to a year ahead when there is no end date', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload([
            'interval' => 'MONTHLY',
            'endDate' => null,
        ]))
        ->assertStatus(201)
        ->assertJsonPath('series.endDate', null)
        ->assertJsonPath('series.instantiatedUntil', '2027-08-03');

    // August 2026 to July 2027; 3 August 2027 would be the 13th and sits exactly
    // on the horizon.
    expect(Booking::count())->toBe(13);
});

it('leaves out colliding instances and reports them', function () {
    $collision = Booking::create([
        'workplace_id' => 'holz-1',
        'name' => 'Bereits da', 'contact' => 'da@example.org',
        'start_time' => CarbonImmutable::parse('2026-08-17 10:00', 'Europe/Zurich')->utc(),
        'end_time' => CarbonImmutable::parse('2026-08-17 12:00', 'Europe/Zurich')->utc(),
        'chargeable_duration_minutes' => 120,
    ]);

    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload())
        ->assertValidResponse(201)
        ->assertJsonCount(1, 'skippedInstances')
        ->assertJsonPath('skippedInstances.0.startTime', '2026-08-17T07:00:00Z')
        ->assertJsonPath('skippedInstances.0.conflictingBookingIds', [$collision->id]);

    expect(instances(BookingSeries::firstOrFail()))->toBe([
        '2026-08-03 09:00',
        '2026-08-10 09:00',
        '2026-08-24 09:00',
        '2026-08-31 09:00',
    ]);
});

it('starts only from now for a series that began long ago', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload([
            'firstInstanceStart' => '2026-06-01T09:00',
            'firstInstanceEnd' => '2026-06-01T11:00',
            'endDate' => '2026-08-31',
        ]))
        ->assertValidResponse(201)
        ->assertJsonPath('series.firstInstanceStart', '2026-06-01T09:00');

    // The series describes a rhythm. Only what is still ahead gets generated.
    expect(instances(BookingSeries::firstOrFail()))->toBe([
        '2026-08-03 09:00',
        '2026-08-10 09:00',
        '2026-08-17 09:00',
        '2026-08-24 09:00',
        '2026-08-31 09:00',
    ]);
});

it('is not subject to the maximum booking horizon', function () {
    // maxBookingEndOffsetDays is 90 days; a series still reaches a year.
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload(['endDate' => null]))
        ->assertStatus(201);

    expect(Booking::max('start_time'))->toBeGreaterThan('2027-07-01');
});

it('rejects a series outside the opening hours', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload([
            'firstInstanceStart' => '2026-08-03T06:00',
            'firstInstanceEnd' => '2026-08-03T07:00',
        ]))
        ->assertValidResponse(422)
        ->assertJsonPath('errors.firstInstanceStart.0', 'Beginn und Ende müssen innerhalb der Öffnungszeiten liegen.');

    expect(BookingSeries::count())->toBe(0);
});

it('rejects a series off the quarter-hour grid', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload([
            'firstInstanceStart' => '2026-08-03T09:07',
            'firstInstanceEnd' => '2026-08-03T11:00',
        ]))
        ->assertValidResponse(422);
});

it('regenerates the future instances when changed', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload())
        ->assertStatus(201);

    $series = BookingSeries::firstOrFail();

    // Only after the first instance: by then it is past and stays.
    $this->travelTo(CarbonImmutable::parse('2026-08-04 07:00', 'Europe/Zurich'));

    $this->actingAs($this->admin)
        ->putJson("/api/booking-series/{$series->id}", seriesPayload([
            'firstInstanceStart' => '2026-08-03T14:00',
            'firstInstanceEnd' => '2026-08-03T16:00',
        ]))
        ->assertValidRequest()
        ->assertValidResponse(200)
        ->assertJsonPath('series.firstInstanceStart', '2026-08-03T14:00');

    expect(instances($series))->toBe([
        // Past, therefore untouched at the old time.
        '2026-08-03 09:00',
        '2026-08-10 14:00',
        '2026-08-17 14:00',
        '2026-08-24 14:00',
        '2026-08-31 14:00',
    ]);
});

it('keeps the IDs of the occurrences that still exist', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload())
        ->assertStatus(201);

    $series = BookingSeries::firstOrFail();
    $before = $series->bookings()->orderBy('start_time')->pluck('id')->all();

    // Only the contact changes — nothing moves in the rhythm.
    $this->actingAs($this->admin)
        ->putJson("/api/booking-series/{$series->id}", seriesPayload([
            'contact' => 'neu@example.org',
        ]))
        ->assertValidResponse(200);

    // The IDs are the UIDs in the iCal feed: if they changed, all future
    // occurrences would vanish from every subscription and come back as new ones.
    expect($series->bookings()->orderBy('start_time')->pluck('id')->all())->toBe($before)
        ->and($series->bookings()->pluck('contact')->unique()->all())->toBe(['neu@example.org']);
});

it('leaves a hand-edited instance alone when the series changes', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload())
        ->assertStatus(201);

    $series = BookingSeries::firstOrFail();
    $moved = $series->bookings()->orderBy('start_time')->skip(2)->firstOrFail();

    // The occurrence on the 17th moves to 14:00.
    $this->actingAs($this->admin)
        ->putJson("/api/bookings/{$moved->id}", [
            'workplaceId' => 'holz-1',
            'startTime' => CarbonImmutable::parse('2026-08-17 14:00', 'Europe/Zurich')->utc()->toIso8601ZuluString(),
            'endTime' => CarbonImmutable::parse('2026-08-17 16:00', 'Europe/Zurich')->utc()->toIso8601ZuluString(),
            'name' => 'Reparaturcafé',
            'contact' => 'reparatur@example.org',
        ])
        ->assertValidResponse(200)
        ->assertJsonPath('seriesDetached', true);

    $this->actingAs($this->admin)
        ->putJson("/api/booking-series/{$series->id}", seriesPayload([
            'contact' => 'neu@example.org',
        ]))
        ->assertValidResponse(200);

    // The moved occurrence stays where it is — and the vacated beat is not
    // refilled with a duplicate.
    expect(instances($series))->toBe([
        '2026-08-03 09:00',
        '2026-08-10 09:00',
        '2026-08-17 14:00',
        '2026-08-24 09:00',
        '2026-08-31 09:00',
    ]);

    expect($moved->refresh()->contact)->toBe('reparatur@example.org');
});

it('leaves a cancelled occurrence cancelled', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload())
        ->assertStatus(201);

    $series = BookingSeries::firstOrFail();
    $cancelled = $series->bookings()->orderBy('start_time')->skip(1)->firstOrFail();

    $this->actingAs($this->admin)
        ->deleteJson("/api/bookings/{$cancelled->id}")
        ->assertValidResponse(204);

    $this->actingAs($this->admin)
        ->putJson("/api/booking-series/{$series->id}", seriesPayload([
            'contact' => 'neu@example.org',
        ]))
        ->assertValidResponse(200);

    expect(instances($series))->toBe([
        '2026-08-03 09:00',
        '2026-08-17 09:00',
        '2026-08-24 09:00',
        '2026-08-31 09:00',
    ]);
});

it('does not pin down an instance that is saved unchanged', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload())
        ->assertStatus(201);

    $series = BookingSeries::firstOrFail();
    $untouched = $series->bookings()->orderBy('start_time')->skip(1)->firstOrFail();

    $this->actingAs($this->admin)
        ->putJson("/api/bookings/{$untouched->id}", [
            'workplaceId' => 'holz-1',
            'startTime' => $untouched->start_time->toIso8601ZuluString(),
            'endTime' => $untouched->end_time->toIso8601ZuluString(),
            'name' => 'Reparaturcafé',
            'contact' => 'reparatur@example.org',
        ])
        ->assertValidResponse(200)
        ->assertJsonPath('seriesDetached', false);

    // No intervention, no exception: the series may keep maintaining the
    // occurrence.
    $this->actingAs($this->admin)
        ->putJson("/api/booking-series/{$series->id}", seriesPayload([
            'contact' => 'neu@example.org',
        ]))
        ->assertValidResponse(200);

    expect($untouched->refresh()->contact)->toBe('neu@example.org');
});

it('clears away dropped occurrences when the rhythm changes', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload())
        ->assertStatus(201);

    $series = BookingSeries::firstOrFail();

    $this->actingAs($this->admin)
        ->putJson("/api/booking-series/{$series->id}", seriesPayload([
            'intervalCount' => 2,
        ]))
        ->assertValidResponse(200);

    expect(instances($series))->toBe([
        '2026-08-03 09:00',
        '2026-08-17 09:00',
        '2026-08-31 09:00',
    ]);
});

it('leaves the past instances standing when deleted', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload())
        ->assertStatus(201);

    $series = BookingSeries::firstOrFail();

    $this->travelTo(CarbonImmutable::parse('2026-08-04 07:00', 'Europe/Zurich'));

    $this->actingAs($this->admin)
        ->deleteJson("/api/booking-series/{$series->id}")
        ->assertValidRequest()
        ->assertValidResponse(204);

    expect(BookingSeries::count())->toBe(0)
        ->and(Booking::count())->toBe(1);

    $survivor = Booking::firstOrFail();

    expect($survivor->booking_series_id)->toBeNull()
        ->and($survivor->name)->toBe('Reparaturcafé');
});

it('catches up in the daily run and stays repeatable', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload(['endDate' => null, 'interval' => 'MONTHLY']))
        ->assertStatus(201);

    $before = Booking::count();

    // Half a year later the horizon has moved on by half a year.
    $this->travelTo(CarbonImmutable::parse('2027-02-03 03:00', 'Europe/Zurich'));

    $this->artisan('booking-series:instantiate')->assertSuccessful();

    expect(BookingSeries::firstOrFail()->instantiated_until->toDateString())->toBe('2028-02-03')
        ->and(Booking::count())->toBe($before + 6);

    // A second run on the same day generates nothing more.
    $this->artisan('booking-series:instantiate')->assertSuccessful();

    expect(Booking::count())->toBe($before + 6);
});

it('gives the test data series rows a real series', function () {
    // Otherwise the calendar would show a repeat icon nowhere in development.
    $this->seed(BookingSeeder::class);

    expect(BookingSeries::count())->toBe(3)
        ->and(Booking::whereNotNull('booking_series_id')->count())->toBe(3);

    // Only today's instance — the rest would come from the daily run.
    expect(BookingSeries::firstOrFail()->instantiated_until->toDateString())
        ->toBe('2026-08-03');
});

it('requires manageBookingSeries for writing', function () {
    $this->actingAs($this->member)
        ->postJson('/api/booking-series', seriesPayload())
        ->assertValidResponse(403);

    expect(BookingSeries::count())->toBe(0);
});

it('holds the contract for reading the series', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload())
        ->assertStatus(201);

    $id = BookingSeries::value('id');

    $this->getJson('/api/booking-series')->assertValidRequest()->assertValidResponse(200);
    $this->getJson("/api/booking-series/{$id}")->assertValidRequest()->assertValidResponse(200);
    $this->getJson('/api/booking-series/gibtsnicht')->assertValidResponse(404);
});
