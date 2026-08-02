<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workplaces', function (Blueprint $table) {
            // Vom Client vergeben, stabil, URL- und SVG-tauglich (z.B. "holz-3").
            // Die Übersichtskarte gleicht die id-Attribute im SVG hiergegen ab.
            $table->string('id', 64)->primary();

            $table->string('name', 150);
            $table->text('description')->nullable();
            $table->text('usage_rules')->nullable();

            $table->string('photo_path')->nullable();
            $table->string('photo_thumbnail_path')->nullable();

            $table->enum('status', ['OK', 'DEFECT', 'DISABLED'])->default('OK');
            $table->string('location', 150)->nullable();

            $table->string('area_id', 26);
            $table->foreign('area_id')->references('id')->on('areas')->restrictOnDelete();

            $table->string('wiki_url', 500)->nullable();

            // Null: es gilt der Wert des Bereichs.
            $table->unsignedInteger('max_booking_duration_minutes')->nullable();

            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->index(['area_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workplaces');
    }
};
