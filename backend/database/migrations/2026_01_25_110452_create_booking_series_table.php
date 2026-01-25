<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('booking_series', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->enum('interval', ['DAILY', 'WEEKLY', 'MONTHLY']);
            $table->integer('interval_count');
            $table->dateTime('start_time'); // Startzeit + Datum der ersten Instanz
            $table->dateTime('end_time');   // Endzeit + Datum der ersten Instanz
            $table->date('recurrence_end_date')->nullable(); // Endtag (Date), optional
            $table->date('instantiated_until');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('booking_series');
    }
};
