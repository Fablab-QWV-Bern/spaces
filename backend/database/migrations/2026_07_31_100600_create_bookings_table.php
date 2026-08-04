<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bookings', function (Blueprint $table) {
            $table->string('id', 26)->primary();

            // Deliberately without a foreign key: if the role is deleted, the
            // reference stays as a historical note.
            $table->string('creator_role_id', 26)->nullable()->index();

            // Cleared after 90 days, visible only with manageRoles.
            $table->string('ip_address', 45)->nullable();

            $table->string('workplace_id', 64);
            $table->foreign('workplace_id')->references('id')->on('workplaces')->restrictOnDelete();

            $table->string('name', 150);
            $table->string('contact', 150);
            $table->boolean('usage_rules_acknowledged')->default(false);

            // UTC. On the 15-minute grid; seconds are always 0.
            $table->dateTime('start_time');
            $table->dateTime('end_time');

            // Derived from start and end: only the time within the opening hours.
            // Stored because every view needs it.
            $table->unsignedInteger('chargeable_duration_minutes');

            $table->string('booking_series_id', 26)->nullable();
            $table->foreign('booking_series_id')->references('id')->on('booking_series')->nullOnDelete();

            $table->timestamps();

            // Carries the collision query: workplace first, then the time range.
            $table->index(['workplace_id', 'start_time', 'end_time']);

            // Carries the calendar query over a time window.
            $table->index(['start_time', 'end_time']);

            $table->index('booking_series_id');
        });

        // The snapshot of blocked workplaces, recorded when the booking is created
        // or changed: the union of blocksWorkplaceIds and the workplaces matched by
        // tag at that moment.
        //
        // Deliberately without a foreign key onto workplaces: the snapshot is
        // history and should survive the deletion of a workplace.
        Schema::create('booking_blocked_workplaces', function (Blueprint $table) {
            $table->string('booking_id', 26);
            $table->string('workplace_id', 64);

            $table->primary(['booking_id', 'workplace_id'], 'bbw_primary');

            // For the reverse direction: which bookings block workplace X?
            $table->index('workplace_id');

            $table->foreign('booking_id')->references('id')->on('bookings')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_blocked_workplaces');
        Schema::dropIfExists('bookings');
    }
};
