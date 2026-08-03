<?php

namespace Database\Seeders;

use App\Domain\Booking\BlockedWorkplaceResolver;
use App\Domain\Booking\CollisionChecker;
use App\Domain\Booking\OpeningHours;
use App\Models\Booking;
use App\Models\BookingSeries;
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
        $collisions = app(CollisionChecker::class);

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
            ['parkplatz-1', 'Regine Meier', 'regine@example.org', '17:00', '21:00', false],
            ['parkplatz-2', 'Urs Stocker', 'urs@example.org', '08:00', '12:00', false],
            ['parkplatz-2', 'Michael Schöll', 'michael@example.org', '13:00', '17:00', false],

            ['spritzkabine', 'Urs Buetler PROact_CA', 'buetler@example.org', '09:00', '13:00', false],
            ['spritzkabine', 'Urs Buetler PROact_CA', 'buetler@example.org', '13:00', '17:00', false],
            ['spritzkabine', 'Urs Buetler PROact_CA', 'buetler@example.org', '17:00', '21:00', false],

            ['prusa-xl', 'Daniel Allemann', 'allemann@example.org', '09:00', '13:00', false],
            ['prusa-xl', 'Daniel Allemann', 'allemann@example.org', '13:00', '17:00', false],
            ['prusa-xl', 'Annina', 'annina@example.org', '20:00', '21:00', false],

            ['fraese-deckel', 'Daniel Gerber', 'daniel@example.org', '08:00', '09:30', false],

            // Ein Kurs, der die Metall-Plätze mitblockiert — macht die grauen
            // Blöcke in der Ansicht sichtbar. Das Fenster ist bewusst so gewählt,
            // dass es mit keiner der obigen Buchungen kollidiert.
            ['kurse-metall', 'Maschinenkurs Metall', 'kurse@example.org', '09:00', '12:00', false],
        ];

        foreach ($rows as [$workplaceId, $name, $contact, $from, $to, $isSeries]) {
            $start = CarbonImmutable::parse("{$today} {$from}", $settings->timezone)->utc();
            $end = CarbonImmutable::parse("{$today} {$to}", $settings->timezone)->utc();

            // Der Seeder geht an der Validierung vorbei, damit auch vergangene
            // Zeiten entstehen — die Kollisionsfreiheit prüfen wir trotzdem,
            // sonst enthielten die Testdaten Zustände, die es nie geben kann.
            $conflicts = $collisions->conflictingBookingIds($workplaceId, $start, $end);

            if ($conflicts !== []) {
                $this->command?->warn("Übersprungen (Kollision): {$workplaceId} {$from}–{$to} — {$name}");

                continue;
            }

            // Die Serie wird angelegt, aber nicht instanziert: der Seeder baut den
            // heutigen Tag nach, und ein Jahr Instanzen im Voraus kollidierte
            // reihenweise mit den übrigen Zeilen. `instantiated_until` steht
            // deshalb auf heute — den Rest holt der Tageslauf nach.
            $series = $isSeries ? BookingSeries::create([
                'workplace_id' => $workplaceId,
                'name' => $name,
                'contact' => $contact,
                'interval' => BookingSeries::INTERVAL_WEEKLY,
                'interval_count' => 1,
                'first_instance_start' => "{$today} {$from}:00",
                'first_instance_end' => "{$today} {$to}:00",
                'end_date' => null,
                'instantiated_until' => $today,
            ]) : null;

            $booking = Booking::create([
                'workplace_id' => $workplaceId,
                // Serieninstanzen haben keinen Ersteller — sie entstehen aus der Serie.
                'creator_role_id' => $isSeries ? null : $creatorRoleId,
                'ip_address' => '192.0.2.'.random_int(2, 250),
                'name' => $name,
                'contact' => $contact,
                'usage_rules_acknowledged' => true,
                'start_time' => $start,
                'end_time' => $end,
                'chargeable_duration_minutes' => $hours->chargeableMinutes($start, $end),
                'booking_series_id' => $series?->id,
            ]);

            $booking->setBlockedWorkplaceIds($resolver->resolve($workplaceId));
        }
    }
}
