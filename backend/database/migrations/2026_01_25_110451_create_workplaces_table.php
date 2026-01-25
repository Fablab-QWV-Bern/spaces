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
        Schema::create('workplaces', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->text('description')->nullable();
            $table->enum('status', ['OK', 'DEFECT', 'DISABLED'])->default('OK');
            $table->string('location');
            $table->foreignUuid('area_id')->constrained('areas')->cascadeOnDelete();
            $table->string('wiki_url')->nullable();
            $table->integer('max_booking_duration_minutes')->nullable();
            $table->json('blocks_workplace_ids')->nullable();
            $table->json('blocks_workplaces_with_tag')->nullable();
            $table->json('tags')->nullable();
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('workplaces');
    }
};
