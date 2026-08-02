<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bookings', function (Blueprint $table) {
            $table->string('id', 26)->primary();

            // Bewusst ohne Fremdschlüssel: wird die Rolle gelöscht, bleibt die
            // Referenz als historischer Vermerk stehen.
            $table->string('creator_role_id', 26)->nullable()->index();

            // Wird nach 90 Tagen geleert, sichtbar nur mit manageRoles.
            $table->string('ip_address', 45)->nullable();

            $table->string('workplace_id', 64);
            $table->foreign('workplace_id')->references('id')->on('workplaces')->restrictOnDelete();

            $table->string('name', 150);
            $table->string('contact', 150);
            $table->boolean('usage_rules_acknowledged')->default(false);

            // UTC. Auf dem 15-Minuten-Raster, Sekunden sind immer 0.
            $table->dateTime('start_time');
            $table->dateTime('end_time');

            // Abgeleitet aus Start und Ende: nur die Zeit innerhalb der
            // Öffnungszeiten. Gespeichert, weil jede Anzeige sie braucht.
            $table->unsignedInteger('chargeable_duration_minutes');

            $table->string('booking_series_id', 26)->nullable();
            $table->foreign('booking_series_id')->references('id')->on('booking_series')->nullOnDelete();

            $table->timestamps();

            // Trägt die Kollisionsabfrage: erst der Arbeitsplatz, dann der Zeitraum.
            $table->index(['workplace_id', 'start_time', 'end_time']);

            // Trägt die Kalenderabfrage über ein Zeitfenster.
            $table->index(['start_time', 'end_time']);

            $table->index('booking_series_id');
        });

        // Der Snapshot der blockierten Arbeitsplätze, festgehalten beim Erstellen
        // bzw. Ändern der Buchung: Vereinigung aus blocksWorkplaceIds und den zu
        // diesem Zeitpunkt per Tag getroffenen Arbeitsplätzen.
        //
        // Bewusst ohne Fremdschlüssel auf workplaces: der Snapshot ist Historie und
        // soll das Löschen eines Arbeitsplatzes überleben.
        Schema::create('booking_blocked_workplaces', function (Blueprint $table) {
            $table->string('booking_id', 26);
            $table->string('workplace_id', 64);

            $table->primary(['booking_id', 'workplace_id'], 'bbw_primary');

            // Für die Gegenrichtung: welche Buchungen blockieren Arbeitsplatz X?
            $table->index('workplace_id');

            $table->foreign('booking_id')->references('id')->on('bookings')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_blocked_workplaces');
        Schema::dropIfExists('bookings');
    }
};
