<?php

namespace Database\Seeders;

use App\Domain\Booking\BlockedWorkplaceResolver;
use App\Domain\Booking\OpeningHours;
use App\Models\Booking;
use App\Models\GlobalSetting;
use App\Models\Role;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;

/**
 * Buchungen für den heutigen Tag, nachgebaut nach dem Screenshot des bestehenden
 * Systems. Nur für die Entwicklung — läuft bewusst an der Validierung vorbei,
 * damit auch vergangene Zeiten des laufenden Tages entstehen.
 */
class BookingSeeder extends Seeder
{
    public function run(): void
    {
        $settings = GlobalSetting::current();
        $hours = OpeningHours::fromSettings($settings);
        $resolver = app(BlockedWorkplaceResolver::class);

        $today = CarbonImmutable::now($settings->timezone)->toDateString();
        $creatorRoleId = Role::where('name', 'Mitglied')->value('id');

        // [Arbeitsplatz, Name, Kontakt, von, bis, Teil einer Serie?]
        $rows = [
            ['betreuung-offene-ws', 'Christoph Bettler', 'christoph@example.org', '14:00', '17:00', true],

            ['holz-1', 'Hans Adrian', 'hans.adrian@example.org', '10:00', '11:00', false],
            ['holz-1', 'Larina Schenk', 'larina@example.org', '13:00', '17:00', false],
            ['holz-1', 'Larina Schenk', 'larina@example.org', '17:00', '21:00', false],

            ['holz-2', 'Urs Stocker', 'urs@example.org', '08:00', '12:00', false],
            ['holz-2', 'Urs Stocker', 'urs@example.org', '12:00', '13:00', false],
            ['holz-2', 'Roman Meier', 'roman@example.org', '16:00', '19:30', false],

            ['holz-3', 'Hans Cramer', 'cramer@example.org', '09:00', '13:00', false],
            ['holz-3', 'Offene Werkstatt/Einführung', 'werkstatt@example.org', '14:00', '17:00', true],
            ['holz-3', 'Marcel', 'marcel@example.org', '17:00', '21:00', false],

            ['holz-4', 'Regine Meier', 'regine@example.org', '09:00', '13:00', false],
            ['holz-4', 'Regine Meier', 'regine@example.org', '13:00', '14:00', false],
            ['holz-4', 'Offene Werkstatt/Einführung', 'werkstatt@example.org', '14:00', '17:00', true],
            ['holz-4', 'Regine Meier', 'regine@example.org', '17:00', '21:00', false],

            ['holz-5', 'Marco Migliavacca', 'marco@example.org', '09:00', '12:00', false],
            ['holz-5', 'Marco Migliavacca', 'marco@example.org', '13:00', '17:00', false],

            ['holz-6', 'Daniel Gerber', 'daniel@example.org', '08:00', '11:00', false],
            ['holz-6', 'Roman Meier', 'roman@example.org', '13:00', '16:00', false],

            ['metall-vorne', 'Michael Schöll', 'michael@example.org', '13:00', '17:00', false],
            ['metall-vorne', 'Michael Schöll', 'michael@example.org', '17:00', '21:00', false],
            ['metall-hinten', 'Christoph Bettler', 'christoph@example.org', '17:00', '21:00', false],

            ['parkplatz-1', 'Regine Meier', 'regine@example.org', '14:00', '17:00', false],

            // Ein Kurs, der die Holz-Plätze mitblockiert — macht die grauen
            // Blöcke in der Ansicht sichtbar.
            ['kurse-holz', 'Maschinenkurs Holz', 'kurse@example.org', '18:00', '21:00', false],
        ];

        foreach ($rows as [$workplaceId, $name, $contact, $from, $to, $isSeries]) {
            $start = CarbonImmutable::parse("{$today} {$from}", $settings->timezone)->utc();
            $end = CarbonImmutable::parse("{$today} {$to}", $settings->timezone)->utc();

            $booking = Booking::create([
                'workplace_id' => $workplaceId,
                'creator_role_id' => $isSeries ? null : $creatorRoleId,
                'ip_address' => '192.0.2.'.random_int(2, 250),
                'name' => $name,
                'contact' => $contact,
                'usage_rules_acknowledged' => true,
                'start_time' => $start,
                'end_time' => $end,
                'chargeable_duration_minutes' => $hours->chargeableMinutes($start, $end),
            ]);

            $booking->setBlockedWorkplaceIds($resolver->resolve($workplaceId));
        }
    }
}
