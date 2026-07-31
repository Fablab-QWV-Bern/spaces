<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Singleton-Tabelle: enthält genau eine Zeile mit id = 1.
     */
    public function up(): void
    {
        Schema::create('global_settings', function (Blueprint $table) {
            $table->unsignedTinyInteger('id')->primary();

            // Öffnungszeiten als lokale Tageszeit, gültig an allen Wochentagen.
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
