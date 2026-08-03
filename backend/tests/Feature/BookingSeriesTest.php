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

    // Fester Bezugspunkt vor der Öffnung, damit "in der Vergangenheit" eindeutig
    // ist. Der 3. August 2026 ist ein Montag.
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

/** Die Instanzen einer Serie als lokale Zeitstempel, in der Reihenfolge der Zeit. */
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

it('legt eine Serie an und erzeugt ihre Instanzen', function () {
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

it('kopiert Name, Kontakt und Blockierungen auf jede Instanz', function () {
    // kurse-holz blockiert holz-1 bis holz-5.
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

it('bleibt ueber die Zeitumstellung bei derselben Uhrzeit', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload(['endDate' => '2026-10-26']))
        ->assertStatus(201);

    // Die Sommerzeit endet am 25. Oktober 2026. Lokal bleibt es 09:00, in UTC
    // wandert der Zeitpunkt von 07:00 auf 08:00.
    $starts = Booking::orderBy('start_time')
        ->get()
        ->mapWithKeys(fn (Booking $booking): array => [
            $booking->start_time->setTimezone('Europe/Zurich')->toDateString() => $booking->start_time->toIso8601ZuluString(),
        ]);

    expect($starts['2026-10-19'])->toBe('2026-10-19T07:00:00Z')
        ->and($starts['2026-10-26'])->toBe('2026-10-26T08:00:00Z');
});

it('ueberspringt bei MONTHLY die Monate ohne diesen Tag', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload([
            'interval' => 'MONTHLY',
            'firstInstanceStart' => '2026-08-31T09:00',
            'firstInstanceEnd' => '2026-08-31T11:00',
            'endDate' => '2027-03-31',
        ]))
        ->assertStatus(201);

    // September, November und Februar haben keinen 31. — sie fallen aus, statt
    // auf den letzten Tag des Monats zu rutschen.
    expect(instances(BookingSeries::firstOrFail()))->toBe([
        '2026-08-31 09:00',
        '2026-10-31 09:00',
        '2026-12-31 09:00',
        '2027-01-31 09:00',
        '2027-03-31 09:00',
    ]);
});

it('rechnet die Intervall-Anzahl mit', function () {
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

it('erzeugt ohne Endtag bis ein Jahr im Voraus', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload([
            'interval' => 'MONTHLY',
            'endDate' => null,
        ]))
        ->assertStatus(201)
        ->assertJsonPath('series.endDate', null)
        ->assertJsonPath('series.instantiatedUntil', '2027-08-03');

    // August 2026 bis Juli 2027; der 3. August 2027 wäre der 13. und liegt genau
    // auf dem Horizont.
    expect(Booking::count())->toBe(13);
});

it('laesst kollidierende Instanzen aus und meldet sie', function () {
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

it('beginnt bei einer laengst angefangenen Serie erst jetzt', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload([
            'firstInstanceStart' => '2026-06-01T09:00',
            'firstInstanceEnd' => '2026-06-01T11:00',
            'endDate' => '2026-08-31',
        ]))
        ->assertValidResponse(201)
        ->assertJsonPath('series.firstInstanceStart', '2026-06-01T09:00');

    // Die Serie beschreibt einen Rhythmus. Erzeugt wird nur, was noch bevorsteht.
    expect(instances(BookingSeries::firstOrFail()))->toBe([
        '2026-08-03 09:00',
        '2026-08-10 09:00',
        '2026-08-17 09:00',
        '2026-08-24 09:00',
        '2026-08-31 09:00',
    ]);
});

it('unterliegt nicht dem maximalen Vorlauf', function () {
    // maxBookingEndOffsetDays ist 90 Tage; eine Serie reicht trotzdem ein Jahr.
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload(['endDate' => null]))
        ->assertStatus(201);

    expect(Booking::max('start_time'))->toBeGreaterThan('2027-07-01');
});

it('weist eine Serie ausserhalb der Oeffnungszeiten zurueck', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload([
            'firstInstanceStart' => '2026-08-03T06:00',
            'firstInstanceEnd' => '2026-08-03T07:00',
        ]))
        ->assertValidResponse(422)
        ->assertJsonPath('errors.firstInstanceStart.0', 'Beginn und Ende müssen innerhalb der Öffnungszeiten liegen.');

    expect(BookingSeries::count())->toBe(0);
});

it('weist eine Serie neben dem Viertelstundenraster zurueck', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload([
            'firstInstanceStart' => '2026-08-03T09:07',
            'firstInstanceEnd' => '2026-08-03T11:00',
        ]))
        ->assertValidResponse(422);
});

it('erzeugt die kuenftigen Instanzen beim Aendern neu', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload())
        ->assertStatus(201);

    $series = BookingSeries::firstOrFail();

    // Erst nach der ersten Instanz: sie ist dann vergangen und bleibt.
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
        // Vergangen, darum unangetastet auf der alten Uhrzeit.
        '2026-08-03 09:00',
        '2026-08-10 14:00',
        '2026-08-17 14:00',
        '2026-08-24 14:00',
        '2026-08-31 14:00',
    ]);
});

it('behaelt die IDs der Termine, die es weiterhin gibt', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload())
        ->assertStatus(201);

    $series = BookingSeries::firstOrFail();
    $before = $series->bookings()->orderBy('start_time')->pluck('id')->all();

    // Nur der Kontakt ändert sich — am Takt bewegt sich nichts.
    $this->actingAs($this->admin)
        ->putJson("/api/booking-series/{$series->id}", seriesPayload([
            'contact' => 'neu@example.org',
        ]))
        ->assertValidResponse(200);

    // Die IDs sind die UIDs im iCal-Feed: würden sie wechseln, verschwänden in
    // jedem Abo alle künftigen Termine und kämen als neue zurück.
    expect($series->bookings()->orderBy('start_time')->pluck('id')->all())->toBe($before)
        ->and($series->bookings()->pluck('contact')->unique()->all())->toBe(['neu@example.org']);
});

it('laesst eine von Hand geaenderte Instanz beim Aendern der Serie stehen', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload())
        ->assertStatus(201);

    $series = BookingSeries::firstOrFail();
    $moved = $series->bookings()->orderBy('start_time')->skip(2)->firstOrFail();

    // Der Termin vom 17. wandert auf 14:00.
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

    // Der verschobene Termin bleibt, wo er ist — und der freigewordene Takt-
    // Zeitpunkt wird nicht mit einem Duplikat nachbesetzt.
    expect(instances($series))->toBe([
        '2026-08-03 09:00',
        '2026-08-10 09:00',
        '2026-08-17 14:00',
        '2026-08-24 09:00',
        '2026-08-31 09:00',
    ]);

    expect($moved->refresh()->contact)->toBe('reparatur@example.org');
});

it('laesst einen gestrichenen Termin gestrichen', function () {
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

it('nagelt eine Instanz nicht fest, die ungeaendert gespeichert wird', function () {
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

    // Kein Eingriff, keine Ausnahme: die Serie darf den Termin weiter pflegen.
    $this->actingAs($this->admin)
        ->putJson("/api/booking-series/{$series->id}", seriesPayload([
            'contact' => 'neu@example.org',
        ]))
        ->assertValidResponse(200);

    expect($untouched->refresh()->contact)->toBe('neu@example.org');
});

it('raeumt weggefallene Termine weg, wenn der Takt sich aendert', function () {
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

it('laesst beim Loeschen die vergangenen Instanzen stehen', function () {
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

it('holt im Tageslauf nach und bleibt dabei wiederholbar', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload(['endDate' => null, 'interval' => 'MONTHLY']))
        ->assertStatus(201);

    $before = Booking::count();

    // Ein halbes Jahr später ist der Horizont ein halbes Jahr weitergerückt.
    $this->travelTo(CarbonImmutable::parse('2027-02-03 03:00', 'Europe/Zurich'));

    $this->artisan('booking-series:instantiate')->assertSuccessful();

    expect(BookingSeries::firstOrFail()->instantiated_until->toDateString())->toBe('2028-02-03')
        ->and(Booking::count())->toBe($before + 6);

    // Ein zweiter Lauf am selben Tag erzeugt nichts mehr.
    $this->artisan('booking-series:instantiate')->assertSuccessful();

    expect(Booking::count())->toBe($before + 6);
});

it('gibt den Serienzeilen der Testdaten eine echte Serie', function () {
    // Sonst zeigte der Kalender in der Entwicklung nirgends ein Wiederholungs-Icon.
    $this->seed(BookingSeeder::class);

    expect(BookingSeries::count())->toBe(3)
        ->and(Booking::whereNotNull('booking_series_id')->count())->toBe(3);

    // Nur die heutige Instanz — der Rest käme aus dem Tageslauf.
    expect(BookingSeries::firstOrFail()->instantiated_until->toDateString())
        ->toBe('2026-08-03');
});

it('verlangt manageBookingSeries zum Schreiben', function () {
    $this->actingAs($this->member)
        ->postJson('/api/booking-series', seriesPayload())
        ->assertValidResponse(403);

    expect(BookingSeries::count())->toBe(0);
});

it('haelt den Vertrag fuer das Lesen der Serien', function () {
    $this->actingAs($this->admin)
        ->postJson('/api/booking-series', seriesPayload())
        ->assertStatus(201);

    $id = BookingSeries::value('id');

    $this->getJson('/api/booking-series')->assertValidRequest()->assertValidResponse(200);
    $this->getJson("/api/booking-series/{$id}")->assertValidRequest()->assertValidResponse(200);
    $this->getJson('/api/booking-series/gibtsnicht')->assertValidResponse(404);
});
