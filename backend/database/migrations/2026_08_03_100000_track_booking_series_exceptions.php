<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Two markers that together ensure changing a series no longer clears away
 * individual adjustments. They deliberately do two different things: the flag
 * says "do not touch this row", the table says "produce nothing at this beat".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            // Set as soon as somebody changes a series instance by hand.
            $table->boolean('series_detached')->default(false)->after('booking_series_id');
        });

        Schema::create('booking_series_exceptions', function (Blueprint $table) {
            $table->string('booking_series_id', 26);

            // The beat at which the series should no longer produce anything —
            // UTC, like all instants. A row appears when an instance is deleted,
            // and when an instance is first moved away from its time; otherwise a
            // duplicate would follow at that spot.
            $table->dateTime('occurrence_start');

            $table->primary(['booking_series_id', 'occurrence_start'], 'bse_primary');

            $table->foreign('booking_series_id')
                ->references('id')->on('booking_series')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_series_exceptions');

        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn('series_detached');
        });
    }
};
