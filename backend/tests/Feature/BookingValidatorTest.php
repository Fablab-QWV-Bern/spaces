<?php

use App\Domain\Booking\BookingCandidate;
use App\Domain\Booking\BookingValidator;
use App\Domain\Booking\ValidationResult;
use App\Domain\Booking\ViolationCode;
use App\Models\Area;
use App\Models\Booking;
use App\Models\Role;
use App\Models\Workplace;
use Carbon\CarbonImmutable;
use Database\Seeders\GlobalSettingSeeder;

beforeEach(function () {
    $this->seed(GlobalSettingSeeder::class);

    // Fester Bezugspunkt: Montag, 3. August 2026, 07:00 Schweizer Zeit — also vor
    // der Oeffnung. Damit sind "in der Vergangenheit" und der Vorlauf bestimmbar.
    $this->travelTo(CarbonImmutable::parse('2026-08-03 07:00', 'Europe/Zurich'));

    $this->area = Area::create([
        'name' => 'Holz', 'color' => '#84cc16',
        'max_booking_duration_minutes' => 480,
        'allow_nightly_activities' => false,
        'sort_order' => 1,
    ]);

    $this->workplace = Workplace::create([
        'id' => 'holz-1', 'name' => 'Holz 1', 'area_id' => $this->area->id,
    ]);

    $this->member = Role::create(['name' => 'Mitglied', 'manage_bookings' => true]);
    $this->admin = Role::create(['name' => 'Admin', 'manage_bookings' => true, 'no_time_restrictions' => true]);

    $this->validator = app(BookingValidator::class);
});

function check(string $start, string $end, ?Role $role = null, bool $acknowledged = false): ValidationResult
{
    return test()->validator->validate(
        new BookingCandidate(
            'holz-1',
            CarbonImmutable::parse($start, 'Europe/Zurich')->utc(),
            CarbonImmutable::parse($end, 'Europe/Zurich')->utc(),
            $acknowledged,
        ),
        $role ?? test()->member,
    );
}

it('akzeptiert eine gewoehnliche Buchung', function () {
    $result = check('2026-08-03 09:00', '2026-08-03 11:00');

    expect($result->isValid())->toBeTrue()
        ->and($result->chargeableDurationMinutes)->toBe(120);
});

it('akzeptiert den ganzen Tag von Oeffnung bis Schliessung', function () {
    // 08:00 als Beginn und 21:00 als Ende liegen beide noch im offenen Bereich.
    $this->area->update(['max_booking_duration_minutes' => 780]);

    $result = check('2026-08-03 08:00', '2026-08-03 21:00');

    expect($result->isValid())->toBeTrue()
        ->and($result->chargeableDurationMinutes)->toBe(780);
});

it('besteht auf dem 15-Minuten-Raster', function () {
    expect(check('2026-08-03 09:10', '2026-08-03 11:00')->has(ViolationCode::NotOnGrid))->toBeTrue();
});

it('weist ein Ende vor dem Start zurueck', function () {
    expect(check('2026-08-03 11:00', '2026-08-03 09:00')->has(ViolationCode::NotOnGrid))->toBeTrue();
});

it('weist Zeiten ausserhalb der Oeffnungszeiten zurueck', function () {
    expect(check('2026-08-03 07:00', '2026-08-03 09:00')->has(ViolationCode::OutsideOpeningHours))->toBeTrue()
        ->and(check('2026-08-03 20:00', '2026-08-03 22:00')->has(ViolationCode::OutsideOpeningHours))->toBeTrue();
});

it('verbietet Buchungen ueber Nacht ohne allowNightlyActivities', function () {
    expect(check('2026-08-03 20:00', '2026-08-04 09:00')->has(ViolationCode::SpansNightNotAllowed))
        ->toBeTrue();
});

it('erlaubt Buchungen ueber Nacht mit allowNightlyActivities und rechnet netto', function () {
    $this->area->update(['allow_nightly_activities' => true]);

    $result = check('2026-08-03 20:00', '2026-08-04 09:00');

    expect($result->isValid())->toBeTrue()
        // Nur die zwei Stunden innerhalb der Oeffnungszeiten zaehlen.
        ->and($result->chargeableDurationMinutes)->toBe(120);
});

it('begrenzt die anrechenbare Dauer', function () {
    $this->area->update(['max_booking_duration_minutes' => 60]);

    expect(check('2026-08-03 09:00', '2026-08-03 11:00')->has(ViolationCode::ExceedsMaxDuration))
        ->toBeTrue();
});

it('laesst den Arbeitsplatz die Dauer des Bereichs ueberschreiben', function () {
    $this->area->update(['max_booking_duration_minutes' => 60]);
    $this->workplace->update(['max_booking_duration_minutes' => 240]);

    expect(check('2026-08-03 09:00', '2026-08-03 11:00')->isValid())->toBeTrue();
});

it('hebt mit noTimeRestrictions die maximale Dauer auf', function () {
    $this->area->update(['max_booking_duration_minutes' => 60]);

    expect(check('2026-08-03 09:00', '2026-08-03 11:00', $this->admin)->isValid())->toBeTrue();
});

it('begrenzt den Vorlauf in die Zukunft', function () {
    // Global sind 90 Tage konfiguriert.
    expect(check('2026-12-01 09:00', '2026-12-01 11:00')->has(ViolationCode::ExceedsMaxEndOffset))
        ->toBeTrue();
});

it('laesst den Bereich den globalen Vorlauf ueberschreiben', function () {
    $this->area->update(['max_booking_end_offset_days' => 365]);

    expect(check('2026-12-01 09:00', '2026-12-01 11:00')->isValid())->toBeTrue();
});

it('hebt mit noTimeRestrictions den Vorlauf auf', function () {
    expect(check('2026-12-01 09:00', '2026-12-01 11:00', $this->admin)->isValid())->toBeTrue();
});

it('verbietet Buchungen in der Vergangenheit auch mit noTimeRestrictions', function () {
    expect(check('2026-08-02 09:00', '2026-08-02 11:00', $this->admin)->has(ViolationCode::StartsInPast))
        ->toBeTrue();
});

it('verweigert defekte und deaktivierte Arbeitsplaetze', function () {
    $this->workplace->update(['status' => Workplace::STATUS_DEFECT]);
    expect(check('2026-08-03 09:00', '2026-08-03 11:00')->has(ViolationCode::WorkplaceNotBookable))->toBeTrue();

    $this->workplace->update(['status' => Workplace::STATUS_DISABLED]);
    expect(check('2026-08-03 09:00', '2026-08-03 11:00')->has(ViolationCode::WorkplaceNotBookable))->toBeTrue();
});

it('verlangt die Bestaetigung der Nutzungsregeln, wenn welche hinterlegt sind', function () {
    $this->workplace->update(['usage_rules' => 'Schutzbrille tragen.']);

    expect(check('2026-08-03 09:00', '2026-08-03 11:00')->has(ViolationCode::UsageRulesNotAcknowledged))->toBeTrue()
        ->and(check('2026-08-03 09:00', '2026-08-03 11:00', acknowledged: true)->isValid())->toBeTrue();
});

it('meldet Kollisionen mitsamt der betroffenen Buchung', function () {
    $existing = Booking::create([
        'workplace_id' => 'holz-1',
        'name' => 'Testperson', 'contact' => 'test@example.org',
        'start_time' => CarbonImmutable::parse('2026-08-03 09:00', 'Europe/Zurich')->utc(),
        'end_time' => CarbonImmutable::parse('2026-08-03 11:00', 'Europe/Zurich')->utc(),
        'chargeable_duration_minutes' => 120,
    ]);

    $result = check('2026-08-03 10:00', '2026-08-03 12:00');

    expect($result->has(ViolationCode::Collision))->toBeTrue()
        ->and($result->conflictingBookingIds)->toBe([$existing->id]);
});

it('liefert den Snapshot mit, der bei einer gueltigen Buchung gespeichert wird', function () {
    Workplace::create(['id' => 'holz-2', 'name' => 'Holz 2', 'area_id' => $this->area->id]);
    $this->workplace->blocksWorkplaces()->sync(['holz-2']);

    expect(check('2026-08-03 09:00', '2026-08-03 11:00')->blockedWorkplaceIds)->toBe(['holz-2']);
});
