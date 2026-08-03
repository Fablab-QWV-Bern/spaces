<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Zwei Merkmale, die zusammen dafür sorgen, dass das Ändern einer Serie
 * individuelle Anpassungen nicht mehr abräumt. Sie tun bewusst zweierlei:
 * das Flag sagt „diese Zeile nicht anfassen", die Tabelle sagt „zu diesem
 * Zeitpunkt nichts erzeugen".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            // Gesetzt, sobald jemand eine Serieninstanz von Hand ändert.
            $table->boolean('series_detached')->default(false)->after('booking_series_id');
        });

        Schema::create('booking_series_exceptions', function (Blueprint $table) {
            $table->string('booking_series_id', 26);

            // Der Takt-Zeitpunkt, an dem die Serie nichts mehr erzeugen soll —
            // UTC, wie alle Zeitpunkte. Es entsteht eine Zeile, wenn eine Instanz
            // gelöscht wird, und eine, wenn eine Instanz erstmals von ihrem
            // Zeitpunkt wegbewegt wird; sonst käme dort ein Duplikat nach.
            $table->dateTime('occurrence_start');

            $table->primary(['booking_series_id', 'occurrence_start'], 'bse_primary');

            $table->foreign('booking_series_id')
                ->references('id')->on('booking_series')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_series_exceptions');

        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn('series_detached');
        });
    }
};
