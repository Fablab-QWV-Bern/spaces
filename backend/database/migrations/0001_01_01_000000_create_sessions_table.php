<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Es gibt keine Benutzer, nur Benutzerrollen — deshalb kein `users`- und kein
     * `password_reset_tokens`-Table. Die Sessions bleiben, weil die Anmeldung als
     * Rolle über den Session-Guard läuft.
     */
    public function up(): void
    {
        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();

            // Laravels DatabaseSessionHandler schreibt fix in die Spalte `user_id`.
            // Wir legen dort die ID der angemeldeten Rolle ab.
            $table->string('user_id', 26)->nullable()->index();

            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sessions');
    }
};
