<?php

namespace Database\Seeders;

use App\Models\Area;
use App\Models\Workplace;
use Illuminate\Database\Seeder;

/**
 * Bereiche und Arbeitsplätze, nachgebaut nach den Screenshots des bestehenden
 * Systems. Die Zuordnung zu Bereichen ist eine plausible Rekonstruktion — in den
 * Screenshots sind die Gruppenüberschriften nicht sichtbar.
 */
class WorkshopSeeder extends Seeder
{
    public function run(): void
    {
        $areaIds = $this->seedAreas();
        $this->seedWorkplaces($areaIds);
        $this->applyTags();
        $this->applyBlocking();
    }

    /** @return array<string, string> */
    private function seedAreas(): array
    {
        $areas = [
            'spezial' => [
                'name' => 'Spezial',
                'color' => 'oklch(0.8 0.1 130)',
                'max_booking_duration_minutes' => 1440,
                'sort_order' => 10,
            ],
            'kurse' => [
                'name' => 'Kurse',
                'color' => 'oklch(0.8 0.1 70)',
                'max_booking_duration_minutes' => 720,
                // Kurse werden lange im Voraus geplant.
                'max_booking_end_offset_days' => 365,
                'sort_order' => 20,
            ],
            'holz' => [
                'name' => 'Holz',
                'color' => 'oklch(0.8 0.1 450)',
                'max_booking_duration_minutes' => 480,
                'sort_order' => 30,
            ],
            'metall' => [
                'name' => 'Metall',
                'color' => 'oklch(0.8 0.1 230)',
                'max_booking_duration_minutes' => 480,
                'sort_order' => 40,
            ],
            'fablab' => [
                'name' => 'Fablab',
                'color' => 'oklch(0.8 0.1 350)',
                // Ein Druck läuft auch mal über Nacht.
                'max_booking_duration_minutes' => 1440,
                'allow_nightly_activities' => true,
                'sort_order' => 50,
            ],
            'diverses' => [
                'name' => 'Diverses',
                'color' => 'oklch(0.8 0 0)',
                'max_booking_duration_minutes' => 2880,
                // Ein Fahrzeug darf über Nacht stehen bleiben.
                'allow_nightly_activities' => true,
                'sort_order' => 60,
            ],
        ];

        $ids = [];

        foreach ($areas as $key => $attributes) {
            $ids[$key] = Area::updateOrCreate(['name' => $attributes['name']], $attributes)->id;
        }

        return $ids;
    }

    /** @param  array<string, string>  $areaIds */
    private function seedWorkplaces(array $areaIds): void
    {
        $wiki = fn (string $slug): array => ['wiki_url' => "https://wiki.example.org/{$slug}"];
        $ug = ['location' => 'Untergeschoss'];

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
            ['holz-6', 'Holz 6 UG', 'holz', 60, $ug],
            ['holz-7', 'Holz 7 UG', 'holz', 70, $ug],
            ['drechselbank', 'Drechselbank', 'holz', 80],
            ['shaper-origin', 'Shaper Origin (UG)', 'holz', 90, $ug + $wiki('shaper-origin') + [
                'usage_rules' => "Nur mit Einführung benutzen.\n\nStaubsauger anschliessen.",
            ]],
            ['cnc-holz', 'CNC Holz (UG)', 'holz', 100, $ug + $wiki('cnc-holz') + [
                'usage_rules' => 'Nur mit Einführung benutzen.',
            ]],

            ['metall-vorne', 'Metall vorne', 'metall', 10],
            ['drehbank-emco', 'Drehbank Emco', 'metall', 20, $wiki('drehbank-emco') + [
                'usage_rules' => 'Nur mit Einführung benutzen. Schutzbrille tragen.',
            ]],
            ['fraese-deckel', 'Fräse Deckel', 'metall', 30],
            ['metall-hinten', 'Metall hinten', 'metall', 40, $wiki('metall-hinten')],
            ['metall-cnc', 'MetallCNC', 'metall', 50, [
                'status' => Workplace::STATUS_DEFECT,
                'description' => 'Steuerung defekt, Ersatzteil bestellt.',
            ]],
            ['gravurlaser', 'Gravurlaser (Metall)', 'metall', 60, $wiki('gravurlaser')],

            ['lasercutter-akj', 'Lasercutter AKJ', 'fablab', 10, $wiki('lasercutter-akj') + [
                'usage_rules' => "Nur mit Einführung benutzen.\n\nAbluft einschalten, Gerät nie unbeaufsichtigt laufen lassen.",
            ]],
            ['resin-drucker', 'Resin-Drucker', 'fablab', 20, $wiki('resin-drucker') + [
                'usage_rules' => 'Handschuhe tragen, Harzreste fachgerecht entsorgen.',
            ]],
            ['pc-3d-druck', 'PC 3D-Druck', 'fablab', 30],
            ['prusa-mini-links', 'Prusa MINI links (UG)', 'fablab', 40, $ug + $wiki('prusa-mini')],
            ['prusa-mini-mitte', 'Prusa MINI Mitte (UG)', 'fablab', 50, $ug],
            ['prusa-mk3s', 'Prusa MK3S (UG)', 'fablab', 60, $ug + $wiki('prusa-mk3s')],
            ['prusa-xl', 'Prusa XL (UG)', 'fablab', 70, $ug],
            ['loeten-1', 'Löten 1 (UG)', 'fablab', 80, $ug],
            ['loeten-2', 'Löten 2 (UG)', 'fablab', 90, $ug + [
                'status' => Workplace::STATUS_DISABLED,
                'description' => 'Noch nicht freigegeben.',
            ]],
            ['folienschneider', 'Folienschneider (UG)', 'fablab', 100, $ug + $wiki('folienschneider')],
            ['naeharbeitsplatz', 'Näharbeitsplatz', 'fablab', 110],

            ['velo', 'Velo', 'diverses', 10],
            ['parkplatz-1', 'Parkplatz 1', 'diverses', 20],
            ['parkplatz-2', 'Parkplatz 2', 'diverses', 30],
            ['spritzkabine', 'Spritzkabine', 'diverses', 40, $wiki('spritzkabine') + [
                'usage_rules' => 'Atemschutz tragen, Absaugung einschalten.',
            ]],
        ];

        foreach ($workplaces as $row) {
            [$id, $name, $areaKey, $sortOrder] = $row;

            Workplace::updateOrCreate(['id' => $id], array_merge([
                'name' => $name,
                'area_id' => $areaIds[$areaKey],
                'sort_order' => $sortOrder,
                'status' => Workplace::STATUS_OK,
            ], $row[4] ?? []));
        }
    }

    /**
     * Tags sind die Grundlage der tag-basierten Blockierung. "werkstatt" tragen
     * alle Plätze, die von einem Ruhetag betroffen sind.
     */
    private function applyTags(): void
    {
        $werkstatt = [
            'holz-1', 'holz-2', 'holz-3', 'holz-4', 'holz-5', 'holz-6', 'holz-7',
            'drechselbank', 'shaper-origin', 'cnc-holz',
            'metall-vorne', 'drehbank-emco', 'fraese-deckel', 'metall-hinten',
            'metall-cnc', 'gravurlaser',
            'lasercutter-akj', 'resin-drucker', 'prusa-mini-links', 'prusa-mini-mitte',
            'prusa-mk3s', 'prusa-xl', 'loeten-1', 'loeten-2', 'folienschneider',
            'naeharbeitsplatz', 'spritzkabine',
        ];

        $laermig = ['drechselbank', 'shaper-origin', 'cnc-holz', 'drehbank-emco', 'fraese-deckel', 'metall-cnc'];

        foreach ($werkstatt as $id) {
            Workplace::findOrFail($id)->syncTags(
                in_array($id, $laermig, strict: true) ? ['werkstatt', 'lärmig'] : ['werkstatt'],
            );
        }
    }

    private function applyBlocking(): void
    {
        // Ein Ruhetag legt die ganze Werkstatt still — über einen Tag, damit neue
        // Arbeitsplätze automatisch dazugehören, sobald sie den Tag tragen.
        Workplace::findOrFail('ruhetag')->syncBlocksWorkplacesWithTag(['werkstatt']);
        Workplace::findOrFail('werkstattpflege')->syncBlocksWorkplacesWithTag(['werkstatt']);

        // Ein Kurs belegt die Arbeitsplätze seines Bereichs, aber nichts sonst.
        Workplace::findOrFail('kurse-holz')->blocksWorkplaces()->sync([
            'holz-1', 'holz-2', 'holz-3', 'holz-4', 'holz-5',
        ]);

        Workplace::findOrFail('kurse-metall')->blocksWorkplaces()->sync([
            'metall-vorne', 'drehbank-emco', 'metall-hinten',
        ]);

        Workplace::findOrFail('kurse-fablab')->blocksWorkplaces()->sync([
            'lasercutter-akj', 'prusa-mini-links', 'prusa-mini-mitte', 'prusa-mk3s', 'prusa-xl',
        ]);

        // Die Drechselbank steht neben Holz 6 und macht dort das Arbeiten
        // unmöglich — eine gerichtete Blockierung, die nur in diese Richtung gilt.
        Workplace::findOrFail('drechselbank')->blocksWorkplaces()->sync(['holz-6']);

        // Die Spritzkabine verträgt sich nicht mit Schleifarbeiten nebenan.
        Workplace::findOrFail('spritzkabine')->blocksWorkplaces()->sync(['metall-hinten']);
    }
}
