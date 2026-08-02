<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('areas', function (Blueprint $table) {
            $table->string('id', 26)->primary();
            $table->string('name', 100);
            $table->char('color', 30);

            $table->unsignedInteger('max_booking_duration_minutes');

            // Null: es gilt der globale Wert.
            $table->unsignedSmallInteger('max_booking_end_offset_days')->nullable();

            // Buchungen dürfen die Nacht überspannen. Start und Ende liegen
            // trotzdem innerhalb der Öffnungszeiten.
            $table->boolean('allow_nightly_activities')->default(false);

            $table->integer('sort_order')->default(0)->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('areas');
    }
};
