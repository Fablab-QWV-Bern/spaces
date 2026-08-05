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

    // A fixed reference point: Monday, 3 August 2026, 07:00 Swiss time — that is,
    // before opening. This makes "in the past" and the horizon determinable.
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

function check(
    string $start,
    string $end,
    ?Role $role = null,
    bool $acknowledged = false,
    ?string $excludeBookingId = null,
): ValidationResult {
    return test()->validator->validate(
        new BookingCandidate(
            'holz-1',
            CarbonImmutable::parse($start, 'Europe/Zurich')->utc(),
            CarbonImmutable::parse($end, 'Europe/Zurich')->utc(),
            $acknowledged,
            $excludeBookingId,
        ),
        $role ?? test()->member,
    );
}

it('accepts an ordinary booking', function () {
    $result = check('2026-08-03 09:00', '2026-08-03 11:00');

    expect($result->isValid())->toBeTrue()
        ->and($result->chargeableDurationMinutes)->toBe(120);
});

it('accepts the whole day from opening to closing', function () {
    // 08:00 as a start and 21:00 as an end both still lie within the open window.
    $this->area->update(['max_booking_duration_minutes' => 780]);

    $result = check('2026-08-03 08:00', '2026-08-03 21:00');

    expect($result->isValid())->toBeTrue()
        ->and($result->chargeableDurationMinutes)->toBe(780);
});

it('insists on the 15-minute grid', function () {
    expect(check('2026-08-03 09:10', '2026-08-03 11:00')->has(ViolationCode::NotOnGrid))->toBeTrue();
});

it('rejects an end before the start', function () {
    expect(check('2026-08-03 11:00', '2026-08-03 09:00')->has(ViolationCode::NotOnGrid))->toBeTrue();
});

it('rejects times outside the opening hours', function () {
    expect(check('2026-08-03 07:00', '2026-08-03 09:00')->has(ViolationCode::OutsideOpeningHours))->toBeTrue()
        ->and(check('2026-08-03 20:00', '2026-08-03 22:00')->has(ViolationCode::OutsideOpeningHours))->toBeTrue();
});

it('forbids overnight bookings without allowNightlyActivities', function () {
    expect(check('2026-08-03 20:00', '2026-08-04 09:00')->has(ViolationCode::SpansNightNotAllowed))
        ->toBeTrue();
});

it('allows overnight bookings with allowNightlyActivities and charges net', function () {
    $this->area->update(['allow_nightly_activities' => true]);

    $result = check('2026-08-03 20:00', '2026-08-04 09:00');

    expect($result->isValid())->toBeTrue()
        // Only the two hours within the opening hours count.
        ->and($result->chargeableDurationMinutes)->toBe(120);
});

it('limits the chargeable duration', function () {
    $this->area->update(['max_booking_duration_minutes' => 60]);

    expect(check('2026-08-03 09:00', '2026-08-03 11:00')->has(ViolationCode::ExceedsMaxDuration))
        ->toBeTrue();
});

it('lets the workplace override the area duration', function () {
    $this->area->update(['max_booking_duration_minutes' => 60]);
    $this->workplace->update(['max_booking_duration_minutes' => 240]);

    expect(check('2026-08-03 09:00', '2026-08-03 11:00')->isValid())->toBeTrue();
});

it('lifts the maximum duration with noTimeRestrictions', function () {
    $this->area->update(['max_booking_duration_minutes' => 60]);

    expect(check('2026-08-03 09:00', '2026-08-03 11:00', $this->admin)->isValid())->toBeTrue();
});

it('limits how far into the future one may book', function () {
    // 90 days are configured globally.
    expect(check('2026-12-01 09:00', '2026-12-01 11:00')->has(ViolationCode::ExceedsMaxEndOffset))
        ->toBeTrue();
});

it('lets the area override the global horizon', function () {
    $this->area->update(['max_booking_end_offset_days' => 365]);

    expect(check('2026-12-01 09:00', '2026-12-01 11:00')->isValid())->toBeTrue();
});

it('lifts the horizon with noTimeRestrictions', function () {
    expect(check('2026-12-01 09:00', '2026-12-01 11:00', $this->admin)->isValid())->toBeTrue();
});

it('forbids new bookings that are already over, even with noTimeRestrictions', function () {
    expect(check('2026-08-02 09:00', '2026-08-02 11:00', $this->admin)->has(ViolationCode::EndsInPast))
        ->toBeTrue();
});

it('permits a start in the past as long as the end lies ahead', function () {
    // Someone who sat down first and books afterwards enters the time they
    // actually began.
    $this->travelTo(CarbonImmutable::parse('2026-08-03 10:00', 'Europe/Zurich'));

    expect(check('2026-08-03 09:00', '2026-08-03 11:00')->isValid())->toBeTrue();
});

it('permits a booking that is over when changing', function () {
    // A running booking should still be adjustable, and shortening it can move
    // its end behind us. Whether the booking is over as a whole is decided by the
    // HTTP layer, not here.
    expect(check('2026-08-02 09:00', '2026-08-02 11:00', excludeBookingId: 'irgendeine-id')
        ->has(ViolationCode::EndsInPast))->toBeFalse();
});

it('refuses broken and disabled workplaces', function () {
    $this->workplace->update(['status' => Workplace::STATUS_DEFECT]);
    expect(check('2026-08-03 09:00', '2026-08-03 11:00')->has(ViolationCode::WorkplaceNotBookable))->toBeTrue();

    $this->workplace->update(['status' => Workplace::STATUS_DISABLED]);
    expect(check('2026-08-03 09:00', '2026-08-03 11:00')->has(ViolationCode::WorkplaceNotBookable))->toBeTrue();
});

it('requires the usage rules to be acknowledged when there are any', function () {
    $this->workplace->update(['usage_rules' => 'Schutzbrille tragen.']);

    expect(check('2026-08-03 09:00', '2026-08-03 11:00')->has(ViolationCode::UsageRulesNotAcknowledged))->toBeTrue()
        ->and(check('2026-08-03 09:00', '2026-08-03 11:00', acknowledged: true)->isValid())->toBeTrue();
});

it('reports collisions along with the affected booking', function () {
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

it('returns the snapshot that gets stored for a valid booking', function () {
    Workplace::create(['id' => 'holz-2', 'name' => 'Holz 2', 'area_id' => $this->area->id]);
    $this->workplace->blocksWorkplaces()->sync(['holz-2']);

    expect(check('2026-08-03 09:00', '2026-08-03 11:00')->blockedWorkplaceIds)->toBe(['holz-2']);
});
