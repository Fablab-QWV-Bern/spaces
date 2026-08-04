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

            // Copied onto every instance.
            $table->string('name', 150);
            $table->string('contact', 150);

            $table->enum('interval', ['WEEKLY', 'MONTHLY']);
            $table->unsignedSmallInteger('interval_count')->default(1);

            // CAREFUL: local wall-clock time, NOT UTC. A weekly series at 09:00
            // stays at 09:00 local time across a DST change. These two columns
            // must never be interpreted as UTC anywhere.
            $table->dateTime('first_instance_start');
            $table->dateTime('first_instance_end');

            // Null: the series runs on indefinitely.
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
