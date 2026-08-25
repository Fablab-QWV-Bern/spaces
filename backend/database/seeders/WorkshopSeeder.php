<?php

namespace Database\Seeders;

use App\Models\Area;
use App\Models\Workplace;
use Illuminate\Database\Seeder;

/**
 * Areas and workplaces, reconstructed from the screenshots of the existing
 * system. The assignment to areas is a plausible reconstruction — the group
 * headings are not visible in the screenshots.
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
        // The colours are the ones the workshop has set, written back here so that
        // a reset does not undo them. They come in two notations, and that is not
        // an oversight.
        //
        // Holz and Metall carry the `rgb(…)` the floor plan draws their benches in
        // (`frontend/public/karte.svg`), verbatim rather than converted, so that
        // drawing and configuration can be held against each other by eye. The map
        // paints the area's colour over the shape, so where the two agree the
        // overwrite is invisible and where they differ it shows.
        //
        // The rest are set on the sliders in the area form and are written in
        // oklch. Diverses is the one to be careful with: its bicycle and parking
        // spaces are bookable, so its colour has to stay clear of the grey the map
        // gives the fixed obstacles — a neutral one would make a parking space
        // read like the saw, as something nobody can book. Hence a little chroma
        // in it rather than none.
        $areas = [
            'spezial' => [
                'name' => 'Spezial',
                'color' => 'oklch(0.8 0.1 20)',
                'max_booking_duration_minutes' => 1440,
                'sort_order' => 10,
            ],
            'kurse' => [
                'name' => 'Kurse',
                'color' => 'oklch(0.8 0.1 130)',
                'max_booking_duration_minutes' => 720,
                // Courses are planned far in advance.
                'max_booking_end_offset_days' => 365,
                'sort_order' => 20,
            ],
            'holz' => [
                'name' => 'Holz',
                'color' => 'rgb(255,219,73)',
                'max_booking_duration_minutes' => 480,
                'sort_order' => 30,
            ],
            'metall' => [
                'name' => 'Metall',
                'color' => 'rgb(135,206,244)',
                'max_booking_duration_minutes' => 480,
                'sort_order' => 40,
            ],
            'fablab' => [
                'name' => 'Fablab',
                'color' => 'oklch(0.8 0.1 350)',
                // A print run sometimes goes on overnight.
                'max_booking_duration_minutes' => 1440,
                'allow_nightly_activities' => true,
                'sort_order' => 50,
            ],
            'diverses' => [
                'name' => 'Diverses',
                'color' => 'oklch(0.84 0.04 70)',
                'max_booking_duration_minutes' => 2880,
                // A vehicle may be left standing overnight.
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

        // [id, name, area, sort order, further attributes]
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
     * Tags are the basis of tag-based blocking. All workplaces affected by a
     * closure day carry "werkstatt".
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
        // A closure day shuts down the whole workshop — via a tag, so that new
        // workplaces automatically join in as soon as they carry the tag.
        Workplace::findOrFail('ruhetag')->syncBlocksWorkplacesWithTag(['werkstatt']);
        Workplace::findOrFail('werkstattpflege')->syncBlocksWorkplacesWithTag(['werkstatt']);

        // A course occupies the workplaces of its area, but nothing else.
        Workplace::findOrFail('kurse-holz')->blocksWorkplaces()->sync([
            'holz-1', 'holz-2', 'holz-3', 'holz-4', 'holz-5',
        ]);

        Workplace::findOrFail('kurse-metall')->blocksWorkplaces()->sync([
            'metall-vorne', 'drehbank-emco', 'metall-hinten',
        ]);

        Workplace::findOrFail('kurse-fablab')->blocksWorkplaces()->sync([
            'lasercutter-akj', 'prusa-mini-links', 'prusa-mini-mitte', 'prusa-mk3s', 'prusa-xl',
        ]);

        // The lathe stands next to Holz 6 and makes working there impossible — a
        // directed block that applies in this direction only.
        Workplace::findOrFail('drechselbank')->blocksWorkplaces()->sync(['holz-6']);

        // The spray booth does not get along with sanding work next door.
        Workplace::findOrFail('spritzkabine')->blocksWorkplaces()->sync(['metall-hinten']);
    }
}
