<?php

use App\Models\Area;
use App\Models\Role;
use App\Models\Workplace;
use Database\Seeders\DatabaseSeeder;

it('legt Bereiche, Arbeitsplaetze und Rollen an', function () {
    $this->seed(DatabaseSeeder::class);

    expect(Area::count())->toBe(5)
        ->and(Workplace::count())->toBe(23)
        ->and(Role::where('is_anonymous', true)->count())->toBe(1);
});

it('loest Tags und Blockierungen am Arbeitsplatz auf', function () {
    $this->seed(DatabaseSeeder::class);

    $drechselbank = Workplace::findOrFail('drechselbank');

    expect($drechselbank->tags())->toBe(['lärmig', 'werkstatt'])
        ->and($drechselbank->blocksWorkplaces()->pluck('id')->all())->toBe(['holz-6']);

    expect(Workplace::findOrFail('ruhetag')->blocksWorkplacesWithTag())->toBe(['werkstatt']);
});

it('vergleicht Tags ohne Ruecksicht auf Gross- und Kleinschreibung', function () {
    $area = Area::create([
        'name' => 'Test', 'color' => '#000000',
        'max_booking_duration_minutes' => 60, 'sort_order' => 1,
    ]);

    $workplace = Workplace::create([
        'id' => 'test-1', 'name' => 'Test 1', 'area_id' => $area->id,
    ]);

    // "#Lärmig" und "lärmig" sind derselbe Tag: fuehrendes # faellt weg, der
    // Vergleich laeuft ueber die Kollation.
    $workplace->syncTags(['#Lärmig', 'lärmig']);

    expect($workplace->tags())->toHaveCount(1);
});
