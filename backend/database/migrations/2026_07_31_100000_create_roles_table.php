<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->string('id', 26)->primary();
            $table->string('name', 100)->unique();

            // Null for the anonymous role: it has no password.
            $table->string('password')->nullable();
            $table->rememberToken();

            // Exactly one role carries this flag. MariaDB has no partial unique
            // indexes, so uniqueness is enforced in the application.
            $table->boolean('is_anonymous')->default(false)->index();

            $table->boolean('view_bookings')->default(false);
            $table->boolean('view_bookings_details')->default(false);
            $table->boolean('manage_bookings')->default(false);
            $table->boolean('no_time_restrictions')->default(false);
            $table->boolean('manage_booking_series')->default(false);
            $table->boolean('manage_workplaces')->default(false);
            $table->boolean('manage_areas')->default(false);
            $table->boolean('manage_roles')->default(false);

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('roles');
    }
};
