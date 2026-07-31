<?php

namespace Database\Seeders;

use App\Models\GlobalSetting;
use Illuminate\Database\Seeder;

class GlobalSettingSeeder extends Seeder
{
    public function run(): void
    {
        GlobalSetting::updateOrCreate(
            ['id' => GlobalSetting::SINGLETON_ID],
            [
                'opens_at' => '08:00:00',
                'closes_at' => '21:00:00',
                'max_booking_end_offset_days' => 90,
                'timezone' => 'Europe/Zurich',
            ],
        );
    }
}
