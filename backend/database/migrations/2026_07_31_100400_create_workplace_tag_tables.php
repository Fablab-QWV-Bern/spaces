<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Listenwertige Felder des Arbeitsplatzes als eigene Tabellen statt als
     * JSON-Spalten: indexierbar und unabhängig von der MariaDB-Version.
     *
     * Tags werden ohne führendes "#" gespeichert. Der Vergleich ist dank der
     * Kollation utf8mb4_unicode_ci case-insensitiv — "Lärmig" und "lärmig" sind
     * damit auch im Primärschlüssel derselbe Tag.
     */
    public function up(): void
    {
        Schema::create('workplace_tags', function (Blueprint $table) {
            $table->string('workplace_id', 64);
            $table->string('tag', 64);

            $table->primary(['workplace_id', 'tag']);
            $table->index('tag');

            $table->foreign('workplace_id')->references('id')->on('workplaces')->cascadeOnDelete();
        });

        // "Blockiert Arbeitsplätze" — explizite IDs.
        Schema::create('workplace_blocks_workplaces', function (Blueprint $table) {
            $table->string('workplace_id', 64);
            $table->string('blocked_workplace_id', 64);

            $table->primary(['workplace_id', 'blocked_workplace_id'], 'wbw_primary');
            $table->index('blocked_workplace_id');

            $table->foreign('workplace_id')->references('id')->on('workplaces')->cascadeOnDelete();

            // Beim Löschen eines Arbeitsplatzes verschwindet er auch aus den
            // Blockierlisten der anderen.
            $table->foreign('blocked_workplace_id')->references('id')->on('workplaces')->cascadeOnDelete();
        });

        // "Blockiert Arbeitsplätze via Tag" — Regel, nicht aufgelöste Liste.
        Schema::create('workplace_blocks_tags', function (Blueprint $table) {
            $table->string('workplace_id', 64);
            $table->string('tag', 64);

            $table->primary(['workplace_id', 'tag'], 'wbt_primary');
            $table->index('tag');

            $table->foreign('workplace_id')->references('id')->on('workplaces')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workplace_blocks_tags');
        Schema::dropIfExists('workplace_blocks_workplaces');
        Schema::dropIfExists('workplace_tags');
    }
};
