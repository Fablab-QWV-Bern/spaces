<?php

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Seeder;

class RoleSeeder extends Seeder
{
    public function run(): void
    {
        // Anonym: darf den Kalender sehen, aber keine Namen und keine Kontakte,
        // und darf nichts anlegen. Wer vor Ort bucht, meldet sich als Mitglied an.
        Role::updateOrCreate(
            ['name' => 'Anonym'],
            [
                'is_anonymous' => true,
                'password' => null,
                'view_bookings' => true,
            ],
        );

        Role::updateOrCreate(
            ['name' => 'Mitglied'],
            [
                'password' => 'mitglied-kennwort',
                'view_bookings' => true,
                'view_bookings_details' => true,
                'manage_bookings' => true,
            ],
        );

        Role::updateOrCreate(
            ['name' => 'Admin'],
            [
                'password' => 'admin-kennwort',
                'view_bookings' => true,
                'view_bookings_details' => true,
                'manage_bookings' => true,
                'no_time_restrictions' => true,
                'manage_booking_series' => true,
                'manage_workplaces' => true,
                'manage_areas' => true,
                'manage_roles' => true,
            ],
        );
    }
}
