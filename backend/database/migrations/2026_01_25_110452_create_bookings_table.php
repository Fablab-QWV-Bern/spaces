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
        Schema::create('bookings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            // Creator role reference. Assuming name or id. Since roles table has UUID, let's use that.
            // But spec says "Benutzerrolle des Erstellers" (User Role of the creator).
            // If the user is logged in, they have a role.
            $table->foreignUuid('creator_role_id')->nullable()->constrained('roles')->nullOnDelete();
            $table->string('ip_address')->nullable();
            $table->foreignUuid('workplace_id')->constrained('workplaces')->cascadeOnDelete();
            $table->json('blocks_workplace_ids')->nullable();
            $table->string('name');
            $table->string('contact');
            $table->dateTime('start_time');
            $table->dateTime('end_time');
            $table->foreignUuid('booking_series_id')->nullable()->constrained('booking_series')->nullOnDelete();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('bookings');
    }
};
