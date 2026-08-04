<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * There are no users, only user roles — hence no `users` and no
     * `password_reset_tokens` table. The sessions stay because logging in as a
     * role goes through the session guard.
     */
    public function up(): void
    {
        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();

            // Laravel's DatabaseSessionHandler always writes to the `user_id`
            // column. We store the ID of the logged-in role there.
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
