<?php

namespace Database\Seeders;

use App\Models\Area;
use App\Models\Workplace;
use Illuminate\Database\Seeder;

/**
 * Bereiche und Arbeitsplätze, nachgebaut nach den Screenshots des bestehenden
 * Systems. Die Zuordnung zu Bereichen ist eine plausible Rekonstruktion — im
 * Screenshot sind die Gruppenüberschriften nicht sichtbar.
 */
class WorkshopSeeder extends Seeder
{
    public function run(): void
    {
        $areas = [
            'spezial' => [
                'name' => 'Spezial',
                'color' => '#8b5cf6',
                'max_booking_duration_minutes' => 1440,
                'sort_order' => 10,
            ],
            'kurse' => [
                'name' => 'Kurse',
                'color' => '#f59e0b',
                'max_booking_duration_minutes' => 720,
                // Kurse werden lange im Voraus geplant.
                'max_booking_end_offset_days' => 365,
                'sort_order' => 20,
            ],
            'holz' => [
                'name' => 'Holz',
                'color' => '#84cc16',
                'max_booking_duration_minutes' => 480,
                'sort_order' => 30,
            ],
            'metall' => [
                'name' => 'Metall',
                'color' => '#0ea5e9',
                'max_booking_duration_minutes' => 480,
                'sort_order' => 40,
            ],
            'diverses' => [
                'name' => 'Diverses',
                'color' => '#64748b',
                'max_booking_duration_minutes' => 2880,
                // Ein Fahrzeug darf über Nacht stehen bleiben.
                'allow_nightly_activities' => true,
                'sort_order' => 50,
            ],
        ];

        $areaIds = [];

        foreach ($areas as $key => $attributes) {
            $areaIds[$key] = Area::updateOrCreate(['name' => $attributes['name']], $attributes)->id;
        }

        // [id, Name, Bereich, Reihenfolge, weitere Attribute]
        $workplaces = [
            ['spezial', 'spezial', 'spezial', 10],
            ['werkstattpflege', 'Werkstattpflege', 'spezial', 20],
            ['ruhetag', 'Ruhetag', 'spezial', 30],
            ['betreuung-offene-ws', 'Betreuung offene WS', 'spezial', 40],

            ['kurse-holz', 'Kurse Holz', 'kurse', 10],
            ['kurse-metall', 'Kurse Metall', 'kurse', 20],
            ['kurse-fablab', 'Kurse Fablab', 'kurse', 30],

            ['holz-1', 'Holz 1', 'holz', 10],
            ['holz-2', 'Holz 2', 'holz', 20],
            ['holz-3', 'Holz 3', 'holz', 30],
            ['holz-4', 'Holz 4', 'holz', 40],
            ['holz-5', 'Holz 5', 'holz', 50],
            ['holz-6', 'Holz 6 UG', 'holz', 60, ['location' => 'Untergeschoss']],
            ['holz-7', 'Holz 7 UG', 'holz', 70, ['location' => 'Untergeschoss']],
            ['drechselbank', 'Drechselbank', 'holz', 80],
            ['shaper-origin', 'Shaper Origin (UG)', 'holz', 90, [
                'location' => 'Untergeschoss',
                'wiki_url' => 'https://wiki.example.org/shaper-origin',
                'usage_rules' => "Nur mit Einführung benutzen.\n\nStaubsauger anschliessen.",
            ]],

            ['metall-vorne', 'Metall vorne', 'metall', 10],
            ['drehbank-emco', 'Drehbank Emco', 'metall', 20, [
                'wiki_url' => 'https://wiki.example.org/drehbank-emco',
                'usage_rules' => 'Nur mit Einführung benutzen. Schutzbrille tragen.',
            ]],
            ['fraese-deckel', 'Fräse Deckel', 'metall', 30, [
                'status' => Workplace::STATUS_DEFECT,
                'description' => 'Spindel defekt, Ersatzteil bestellt.',
            ]],
            ['metall-hinten', 'Metall hinten', 'metall', 40, [
                'wiki_url' => 'https://wiki.example.org/metall-hinten',
            ]],

            ['velo', 'Velo', 'diverses', 10],
            ['parkplatz-1', 'Parkplatz 1', 'diverses', 20],
            ['parkplatz-2', 'Parkplatz 2', 'diverses', 30, [
                'status' => Workplace::STATUS_DISABLED,
                'description' => 'Noch nicht freigegeben.',
            ]],
        ];

        foreach ($workplaces as $row) {
            [$id, $name, $areaKey, $sortOrder] = $row;
            $extra = $row[4] ?? [];

            Workplace::updateOrCreate(['id' => $id], array_merge([
                'name' => $name,
                'area_id' => $areaIds[$areaKey],
                'sort_order' => $sortOrder,
                'status' => Workplace::STATUS_OK,
            ], $extra));
        }

        $this->applyTags();
        $this->applyBlocking();
    }

    /**
     * Tags sind die Grundlage der tag-basierten Blockierung. "werkstatt" tragen
     * alle Plätze, die von einem Ruhetag betroffen sind.
     */
    private function applyTags(): void
    {
        $tags = [
            'holz-1' => ['werkstatt'],
            'holz-2' => ['werkstatt'],
            'holz-3' => ['werkstatt'],
            'holz-4' => ['werkstatt'],
            'holz-5' => ['werkstatt'],
            'holz-6' => ['werkstatt'],
            'holz-7' => ['werkstatt'],
            'drechselbank' => ['werkstatt', 'lärmig'],
            'shaper-origin' => ['werkstatt', 'lärmig'],
            'metall-vorne' => ['werkstatt'],
            'drehbank-emco' => ['werkstatt', 'lärmig'],
            'fraese-deckel' => ['werkstatt', 'lärmig'],
            'metall-hinten' => ['werkstatt'],
        ];

        foreach ($tags as $workplaceId => $list) {
            Workplace::findOrFail($workplaceId)->syncTags($list);
        }
    }

    private function applyBlocking(): void
    {
        // Ein Ruhetag legt die ganze Werkstatt still — über einen Tag, damit neue
        // Arbeitsplätze automatisch dazugehören, sobald sie den Tag tragen.
        Workplace::findOrFail('ruhetag')->syncBlocksWorkplacesWithTag(['werkstatt']);

        // Werkstattpflege ebenso.
        Workplace::findOrFail('werkstattpflege')->syncBlocksWorkplacesWithTag(['werkstatt']);

        // Ein Holzkurs belegt die Holz-Arbeitsplätze, aber nichts sonst.
        Workplace::findOrFail('kurse-holz')->blocksWorkplaces()->sync([
            'holz-1', 'holz-2', 'holz-3', 'holz-4', 'holz-5',
        ]);

        Workplace::findOrFail('kurse-metall')->blocksWorkplaces()->sync([
            'metall-vorne', 'drehbank-emco', 'metall-hinten',
        ]);

        // Die Drechselbank steht neben Holz 6 und macht dort das Arbeiten
        // unmöglich — eine gerichtete Blockierung, die nur in diese Richtung gilt.
        Workplace::findOrFail('drechselbank')->blocksWorkplaces()->sync(['holz-6']);
    }
}
