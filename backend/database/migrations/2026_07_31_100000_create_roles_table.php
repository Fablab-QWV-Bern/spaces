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

            // Null bei der anonymen Rolle: die hat kein Kennwort.
            $table->string('password')->nullable();
            $table->rememberToken();

            // Genau eine Rolle trägt dieses Flag. MariaDB kennt keine partiellen
            // Unique-Indexe, die Einzigkeit wird deshalb in der Anwendung erzwungen.
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
