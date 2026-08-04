<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The workplace's list-valued fields as tables of their own rather than JSON
     * columns: indexable and independent of the MariaDB version.
     *
     * Tags are stored without a leading "#". Thanks to the utf8mb4_unicode_ci
     * collation the comparison is case-insensitive — so "Lärmig" and "lärmig" are
     * the same tag in the primary key as well.
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

        // "Blocks workplaces" — explicit IDs.
        Schema::create('workplace_blocks_workplaces', function (Blueprint $table) {
            $table->string('workplace_id', 64);
            $table->string('blocked_workplace_id', 64);

            $table->primary(['workplace_id', 'blocked_workplace_id'], 'wbw_primary');
            $table->index('blocked_workplace_id');

            $table->foreign('workplace_id')->references('id')->on('workplaces')->cascadeOnDelete();

            // When a workplace is deleted it also disappears from the others'
            // blocking lists.
            $table->foreign('blocked_workplace_id')->references('id')->on('workplaces')->cascadeOnDelete();
        });

        // "Blocks workplaces by tag" — a rule, not a resolved list.
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
