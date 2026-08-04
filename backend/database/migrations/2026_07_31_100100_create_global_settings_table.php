<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Singleton table: contains exactly one row with id = 1.
     */
    public function up(): void
    {
        Schema::create('global_settings', function (Blueprint $table) {
            $table->unsignedTinyInteger('id')->primary();

            // Opening hours as local time of day, valid on all weekdays.
            $table->time('opens_at');
            $table->time('closes_at');

            $table->unsignedSmallInteger('max_booking_end_offset_days');
            $table->string('timezone', 64);

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('global_settings');
    }
};
