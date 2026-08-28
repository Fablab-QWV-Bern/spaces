<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            // Set when the booking was saved with automatic blocking switched off.
            // A separate flag rather than an empty booking_blocked_workplaces:
            // that snapshot is also empty for a booking made before the workplace
            // had any blocking rules, so it cannot tell the two apart.
            $table->boolean('skip_automatic_blocking')
                ->default(false)
                ->after('usage_rules_acknowledged');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn('skip_automatic_blocking');
        });
    }
};
