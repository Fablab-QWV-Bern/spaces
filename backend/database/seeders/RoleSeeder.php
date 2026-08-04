<?php

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Seeder;

class RoleSeeder extends Seeder
{
    public function run(): void
    {
        // Anonymous: may see the calendar, but no names and no contacts, and may
        // create nothing. Whoever books on site logs in as a member.
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
     * Creates a role or realigns an existing one.
     *
     * Permissions not listed are explicitly revoked: `updateOrCreate` leaves
     * omitted columns standing, and the column defaults only apply on first
     * creation. A seeder run against an existing database should, however,
     * establish the state described here rather than merely add to it.
     *
     * @param  list<string>  $permissions  Names from Role::PERMISSIONS
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
