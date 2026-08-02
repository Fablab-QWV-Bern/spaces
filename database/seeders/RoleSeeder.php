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
        $this->role('Anonym', ['viewBookings'], [
            'is_anonymous' => true,
            'password' => null,
        ]);

        $this->role('Mitglied', [
            'viewBookings',
            'viewBookingsDetails',
            'manageBookings',
        ], ['password' => 'mitglied-kennwort']);

        $this->role('Admin', array_keys(Role::PERMISSIONS), [
            'password' => 'admin-kennwort',
        ]);
    }

    /**
     * Legt eine Rolle an oder richtet eine bestehende neu aus.
     *
     * Nicht genannte Berechtigungen werden ausdrücklich entzogen: `updateOrCreate`
     * lässt weggelassene Spalten stehen, und die Spalten-Defaults greifen nur beim
     * ersten Anlegen. Ein Seeder-Lauf auf eine bestehende Datenbank soll aber den
     * hier beschriebenen Zustand herstellen, nicht bloss ergänzen.
     *
     * @param  list<string>  $permissions  Namen aus Role::PERMISSIONS
     * @param  array<string, mixed>  $attributes
     */
    private function role(string $name, array $permissions, array $attributes = []): void
    {
        $granted = [];

        foreach (Role::PERMISSIONS as $key => $column) {
            $granted[$column] = in_array($key, $permissions, true);
        }

        Role::updateOrCreate(['name' => $name], [...$granted, ...$attributes]);
    }
}
