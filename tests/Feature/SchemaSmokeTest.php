<?php

use App\Models\Area;
use App\Models\Role;
use App\Models\Workplace;
use Database\Seeders\DatabaseSeeder;

it('creates areas, workplaces and roles', function () {
    $this->seed(DatabaseSeeder::class);

    expect(Area::count())->toBe(6)
        ->and(Workplace::count())->toBe(38)
        ->and(Role::where('is_anonymous', true)->count())->toBe(1);
});

it('resolves tags and blocking on the workplace', function () {
    $this->seed(DatabaseSeeder::class);

    $drechselbank = Workplace::findOrFail('drechselbank');

    expect($drechselbank->tags())->toBe(['lärmig', 'werkstatt'])
        ->and($drechselbank->blocksWorkplaces()->pluck('id')->all())->toBe(['holz-6']);

    expect(Workplace::findOrFail('ruhetag')->blocksWorkplacesWithTag())->toBe(['werkstatt']);
});

it('compares tags case-insensitively', function () {
    $area = Area::create([
        'name' => 'Test', 'color' => '#000000',
        'max_booking_duration_minutes' => 60, 'sort_order' => 1,
    ]);

    $workplace = Workplace::create([
        'id' => 'test-1', 'name' => 'Test 1', 'area_id' => $area->id,
    ]);

    // "#Lärmig" and "lärmig" are the same tag: the leading # is dropped and the
    // comparison runs through the collation.
    $workplace->syncTags(['#Lärmig', 'lärmig']);

    expect($workplace->tags())->toHaveCount(1);
});
