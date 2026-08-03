<?php

namespace App\Domain\Booking;

use App\Models\Booking;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Die Takt-Zeitpunkte, an denen eine Serie nichts mehr erzeugen soll.
 *
 * Zwei Handgriffe schreiben hierher, und beide meinen dasselbe: „an dieser
 * Stelle des Rhythmus steht schon eine Entscheidung". Wer eine Instanz löscht,
 * will den Termin weg; wer sie verschiebt, will ihn woanders — in beiden Fällen
 * wäre eine nachgelieferte Instanz am ursprünglichen Zeitpunkt ein Rückschritt.
 *
 * Bewusst eine eigene Tabelle statt eines Soft-Deletes auf `bookings`: ein
 * gestrichener Termin, der als Zeile stehen bliebe, müsste in jeder Abfrage
 * ausgefiltert werden — auch in der Kollisionsprüfung, die als einzige am Modell
 * vorbei über den Query Builder läuft. Eine vergessene Bedingung dort blockierte
 * fremde Arbeitsplätze mit einer Buchung, die niemand sehen kann. So hat die
 * Ausnahme genau einen Leser.
 */
final class SeriesExceptions
{
    /**
     * Die ausgenommenen Zeitpunkte einer Serie, als "Y-m-d H:i:s" in UTC — in der
     * Form, in der sich ein Takt-Zeitpunkt direkt vergleichen lässt.
     *
     * @return list<string>
     */
    public function cancelledAt(string $seriesId): array
    {
        return DB::table('booking_series_exceptions')
            ->where('booking_series_id', $seriesId)
            ->pluck('occurrence_start')
            ->map(fn (string $value): string => CarbonImmutable::parse($value)->toDateTimeString())
            ->all();
    }

    /**
     * Hält fest, dass die Serie am bisherigen Zeitpunkt dieser Instanz nichts
     * mehr erzeugen soll. Tut nichts, wenn die Buchung zu keiner Serie gehört
     * oder die Instanz ohnehin schon abgekoppelt ist — dann steht die Ausnahme
     * seit dem ersten Eingriff.
     */
    public function recordFor(Booking $booking): void
    {
        if ($booking->booking_series_id === null || $booking->series_detached) {
            return;
        }

        $this->record($booking->booking_series_id, $booking->start_time);
    }

    public function record(string $seriesId, CarbonImmutable $occurrenceStart): void
    {
        DB::table('booking_series_exceptions')->insertOrIgnore([
            'booking_series_id' => $seriesId,
            'occurrence_start' => $occurrenceStart->utc()->toDateTimeString(),
        ]);
    }
}
