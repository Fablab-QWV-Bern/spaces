<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('booking_series', function (Blueprint $table) {
            $table->string('id', 26)->primary();

            $table->string('workplace_id', 64);
            $table->foreign('workplace_id')->references('id')->on('workplaces')->restrictOnDelete();

            // Werden auf jede Instanz kopiert.
            $table->string('name', 150);
            $table->string('contact', 150);

            $table->enum('interval', ['DAILY', 'WEEKLY', 'MONTHLY']);
            $table->unsignedSmallInteger('interval_count')->default(1);

            // ACHTUNG: lokale Wanduhrzeit, NICHT UTC. Eine wöchentliche Serie um
            // 09:00 bleibt über die Zeitumstellung hinweg bei 09:00 Ortszeit.
            // Diese beiden Spalten dürfen nirgends als UTC interpretiert werden.
            $table->dateTime('first_instance_start');
            $table->dateTime('first_instance_end');

            // Null: die Serie läuft unbegrenzt weiter.
            $table->date('end_date')->nullable();

            $table->date('instantiated_until');

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_series');
    }
};
