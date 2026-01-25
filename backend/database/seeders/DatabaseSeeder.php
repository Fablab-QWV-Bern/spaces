<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use App\Models\Role;
use App\Models\Area;
use App\Models\Workplace;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // 1. Create Roles
        $adminRole = Role::create([
            'name' => 'Admin',
            'password_hash' => Hash::make('password'),
            'permissions' => [
                'viewBookings' => true,
                'viewBookingsDetails' => true,
                'createBookings' => true,
                'noTimeRestrictions' => true,
                'manageBookings' => true,
                'manageWorkplaces' => true,
                'manageAreas' => true,
                'manageRoles' => true,
            ],
        ]);

        $memberRole = Role::create([
            'name' => 'Member',
            'password_hash' => Hash::make('member'),
            'permissions' => [
                'viewBookings' => true,
                'viewBookingsDetails' => false,
                'createBookings' => true,
                'noTimeRestrictions' => false,
                'manageBookings' => false,
                'manageWorkplaces' => false,
                'manageAreas' => false,
                'manageRoles' => false,
            ],
        ]);

        // 2. Create Areas
        $areaCoworking = Area::create([
            'name' => 'Coworking Space',
            'color' => '#3498db', // Blue
            'max_booking_duration_minutes' => 480, // 8 hours
            'max_booking_end_offset_days' => 30,
            'sort_order' => 1,
        ]);

        $areaMeeting = Area::create([
            'name' => 'Meeting Rooms',
            'color' => '#e74c3c', // Red
            'max_booking_duration_minutes' => 120, // 2 hours
            'max_booking_end_offset_days' => 60,
            'sort_order' => 2,
        ]);

        // 3. Create Workplaces
        // Coworking Desks
        for ($i = 1; $i <= 5; $i++) {
            Workplace::create([
                'name' => "Desk $i",
                'description' => "Standard flexible desk $i",
                'status' => 'OK',
                'location' => 'Main Hall',
                'area_id' => $areaCoworking->id,
                'max_booking_duration_minutes' => null, // inherits
                'sort_order' => $i,
            ]);
        }

        // Meeting Rooms
        Workplace::create([
            'name' => "Meeting Room A",
            'description' => "Small meeting room for 4 people",
            'status' => 'OK',
            'location' => 'Side Room 1',
            'area_id' => $areaMeeting->id,
            'max_booking_duration_minutes' => null,
            'sort_order' => 1,
            'tags' => ['#quiet', '#screen'],
        ]);

        Workplace::create([
            'name' => "Meeting Room B",
            'description' => "Large meeting room for 10 people",
            'status' => 'OK',
            'location' => 'Side Room 2',
            'area_id' => $areaMeeting->id,
            'max_booking_duration_minutes' => null,
            'sort_order' => 2,
            'tags' => ['#projector'],
        ]);

        // 4. Create Bookings
        $desk1 = Workplace::where('name', 'Desk 1')->first();
        $meetingRoomA = Workplace::where('name', 'Meeting Room A')->first();

        \App\Models\Booking::create([
            'creator_role_id' => $memberRole->id,
            'workplace_id' => $desk1->id,
            'name' => 'Alice',
            'contact' => 'alice@example.com',
            'start_time' => now()->setHour(9)->setMinute(0)->setSecond(0),
            'end_time' => now()->setHour(12)->setMinute(0)->setSecond(0),
            'ip_address' => '127.0.0.1',
        ]);

        \App\Models\Booking::create([
            'creator_role_id' => $memberRole->id,
            'workplace_id' => $desk1->id,
            'name' => 'Bob',
            'contact' => 'bob@example.com',
            'start_time' => now()->setHour(13)->setMinute(0)->setSecond(0),
            'end_time' => now()->setHour(17)->setMinute(0)->setSecond(0),
            'ip_address' => '127.0.0.1',
        ]);

        \App\Models\Booking::create([
            'creator_role_id' => $memberRole->id,
            'workplace_id' => $meetingRoomA->id,
            'name' => 'Charlie & Team',
            'contact' => 'charlie@example.com',
            'start_time' => now()->setHour(14)->setMinute(0)->setSecond(0),
            'end_time' => now()->setHour(15)->setMinute(30)->setSecond(0),
            'ip_address' => '127.0.0.1',
        ]);

        // Future booking
        \App\Models\Booking::create([
            'creator_role_id' => $memberRole->id,
            'workplace_id' => $desk1->id,
            'name' => 'Alice',
            'contact' => 'alice@example.com',
            'start_time' => now()->addDay()->setHour(10)->setMinute(0)->setSecond(0),
            'end_time' => now()->addDay()->setHour(11)->setMinute(0)->setSecond(0),
            'ip_address' => '127.0.0.1',
        ]);

        $this->command->info("Seeding completed successfully!");
    }
}
