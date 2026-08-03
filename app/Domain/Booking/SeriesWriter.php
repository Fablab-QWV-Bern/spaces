<?php

namespace App\Domain\Booking;

use App\Models\Booking;
use App\Models\BookingSeries;
use App\Models\GlobalSetting;
use App\Models\Role;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Legt Buchungsserien an, ändert sie und erzeugt ihre Instanzen.
 *
 * Die Regeln werden einmal an der ersten Instanz geprüft, nicht an jeder: was
 * eine Serie ausmacht — Arbeitsplatz, Wanduhrzeit, Dauer — ist für alle Instanzen
 * dasselbe, und was sich unterscheidet (die Belegung) prüft ohnehin jede Instanz
 * für sich. Kollidiert eine, fällt sie aus; die Serie entsteht trotzdem.
 */
final class SeriesWriter
{
    /** Wie weit im Voraus Instanzen erzeugt werden. */
    public const HORIZON_YEARS = 1;

    public function __construct(
        private readonly BookingValidator $validator,
        private readonly CollisionChecker $collisions,
        private readonly BlockedWorkplaceResolver $resolver,
        private readonly SeriesExceptions $exceptions,
    ) {}

    /**
     * @param  array<string, mixed>  $data  Bereits geprüfte Felder aus BookingSeriesWrite
     * @return array{0: BookingSeries, 1: list<SkippedInstance>}
     *
     * @throws BookingRuleException
     */
    public function create(array $data, Role $role): array
    {
        return DB::transaction(function () use ($data, $role): array {
            $this->checkShape($data, $role);

            $series = BookingSeries::create([
                'workplace_id' => $data['workplaceId'],
                'name' => $data['name'],
                'contact' => $data['contact'],
                'interval' => $data['interval'],
                'interval_count' => $data['intervalCount'],
                'first_instance_start' => $this->wallClock($data['firstInstanceStart']),
                'first_instance_end' => $this->wallClock($data['firstInstanceEnd']),
                'end_date' => $data['endDate'] ?? null,
                'instantiated_until' => $this->horizon(),
            ]);

            return [$series, $this->reconcile($series, $this->today())];
        });
    }

    /**
     * Ändert die Serie und gleicht ihre künftigen Instanzen ab. Vergangene und
     * laufende bleiben, wie sie sind — sie haben stattgefunden —, und ebenso die
     * abgekoppelten, die jemand von Hand angepasst hat.
     *
     * @param  array<string, mixed>  $data
     * @return array{0: BookingSeries, 1: list<SkippedInstance>}
     *
     * @throws BookingRuleException
     */
    public function update(BookingSeries $series, array $data, Role $role): array
    {
        return DB::transaction(function () use ($series, $data, $role): array {
            $this->checkShape($data, $role);

            $series->update([
                'workplace_id' => $data['workplaceId'],
                'name' => $data['name'],
                'contact' => $data['contact'],
                'interval' => $data['interval'],
                'interval_count' => $data['intervalCount'],
                'first_instance_start' => $this->wallClock($data['firstInstanceStart']),
                'first_instance_end' => $this->wallClock($data['firstInstanceEnd']),
                'end_date' => $data['endDate'] ?? null,
                'instantiated_until' => $this->horizon(),
            ]);

            return [$series->refresh(), $this->reconcile($series, $this->today())];
        });
    }

    /**
     * Löscht die Serie. Ihre künftigen Instanzen verschwinden mit ihr, die
     * vergangenen bleiben als eigenständige Buchungen stehen — der Fremdschlüssel
     * leert dort nur `booking_series_id`.
     */
    public function delete(BookingSeries $series): void
    {
        DB::transaction(function () use ($series): void {
            $this->deleteFutureInstances($series);
            $series->delete();
        });
    }

    /**
     * Holt nach, was seit dem letzten Lauf dazugekommen ist, und schiebt den
     * Horizont wieder auf ein Jahr. Erzeugt wird nur, was nach `instantiated_until`
     * liegt — der Lauf kann deshalb beliebig oft stattfinden.
     *
     * @return list<SkippedInstance>
     */
    public function extend(BookingSeries $series): array
    {
        return DB::transaction(function () use ($series): array {
            $horizon = $this->horizon();

            $firstDay = CarbonImmutable::parse(
                $series->instantiated_until->addDay()->toDateString(),
                $this->timezone(),
            );

            if ($firstDay > $horizon) {
                return [];
            }

            $skipped = $this->reconcile($series, $firstDay);

            $series->update(['instantiated_until' => $horizon]);

            return $skipped;
        });
    }

    /**
     * Bringt die Instanzen zwischen `$firstDay` und dem Horizont mit der Serie in
     * Übereinstimmung. Läuft innerhalb der Transaktion des Aufrufers, damit die
     * Sperren der Kollisionsprüfung bis zum Schreiben halten.
     *
     * Abgeglichen statt gelöscht und neu angelegt: ein Termin, den es weiterhin
     * gibt, behält seine Zeile und damit seine ID. Das ist nicht bloss sparsamer
     * — die ID ist die UID im iCal-Feed, und ein Löschen liesse in jedem Abo
     * sämtliche künftigen Termine verschwinden und als neue wiederauftauchen.
     *
     * Zwei Dinge bleiben dabei aussen vor: abgekoppelte Instanzen (jemand hat sie
     * von Hand angepasst) und Zeitpunkte mit einer Ausnahme (jemand hat den
     * Termin gestrichen oder verschoben).
     *
     * @return list<SkippedInstance>
     */
    private function reconcile(BookingSeries $series, CarbonImmutable $firstDay): array
    {
        $settings = GlobalSetting::current();
        $hours = OpeningHours::fromSettings($settings);

        $schedule = SeriesSchedule::forSeries($series, $settings->timezone);
        $blocked = $this->resolver->resolve($series->workplace_id);
        $now = CarbonImmutable::now('UTC');

        $cancelled = $this->exceptions->cancelledAt($series->id);

        $occurrences = array_values(array_filter(
            $schedule->occurrencesBetween($firstDay, $this->horizon(), $now),
            fn (SeriesOccurrence $occurrence): bool => ! in_array(
                $occurrence->startTime->toDateTimeString(), $cancelled, strict: true,
            ),
        ));

        // Die noch nicht begonnenen Instanzen im abgeglichenen Fenster, greifbar
        // über ihren Zeitpunkt. Die Fenstergrenzen sind nicht Zierde: der
        // Tageslauf gleicht nur das neue Jahresende ab und dürfte nicht abräumen,
        // was davor längst richtig steht.
        //
        // Abgekoppelte fehlen hier bewusst: sie werden weder angepasst noch
        // aufgeräumt, und als Belegung stehen sie ohnehin in der Kollisionsprüfung.
        $existing = $series->bookings()
            ->where('start_time', '>', $now)
            ->where('start_time', '>=', $firstDay->utc())
            ->where('start_time', '<=', $this->horizon()->endOfDay()->utc())
            ->where('series_detached', false)
            ->get()
            ->keyBy(fn (Booking $booking): string => $booking->start_time->toDateTimeString());

        $wanted = array_map(
            fn (SeriesOccurrence $occurrence): string => $occurrence->startTime->toDateTimeString(),
            $occurrences,
        );

        // Erst wegräumen, dann schreiben: eine Instanz, die es nicht mehr gibt,
        // könnte sonst mit dem Termin kollidieren, der an ihre Stelle tritt.
        foreach ($existing->keys()->diff($wanted) as $key) {
            $existing->pull($key)->delete();
        }

        $skipped = [];

        foreach ($occurrences as $occurrence) {
            $booking = $existing->get($occurrence->startTime->toDateTimeString());

            $conflicts = $this->collisions->conflictingBookingIdsForUpdate(
                $series->workplace_id,
                $occurrence->startTime,
                $occurrence->endTime,
                $booking?->getKey(),
                $blocked,
            );

            if ($conflicts !== []) {
                // Auch eine bestehende Instanz kann im Weg stehen — etwa wenn die
                // Serie auf einen belegten Arbeitsplatz umzieht.
                $booking?->delete();

                $skipped[] = new SkippedInstance(
                    $occurrence->startTime,
                    $occurrence->endTime,
                    $conflicts,
                );

                continue;
            }

            $attributes = [
                'workplace_id' => $series->workplace_id,
                'name' => $series->name,
                'contact' => $series->contact,
                // Wer eine Serie anlegen darf, bestätigt die Nutzungsregeln mit ihr;
                // BookingSeriesWrite hat kein eigenes Feld dafür.
                'usage_rules_acknowledged' => true,
                'start_time' => $occurrence->startTime,
                'end_time' => $occurrence->endTime,
                'chargeable_duration_minutes' => $hours->chargeableMinutes(
                    $occurrence->startTime,
                    $occurrence->endTime,
                ),
            ];

            if ($booking !== null) {
                $booking->update($attributes);
            } else {
                $booking = Booking::create([
                    // Instanzen haben keinen Ersteller: sie entstehen aus der Serie,
                    // und der spätere Nachschub aus einem Cron-Lauf ohne Sitzung.
                    'creator_role_id' => null,
                    'booking_series_id' => $series->id,
                    ...$attributes,
                ]);
            }

            $booking->setBlockedWorkplaceIds($blocked);
        }

        return $skipped;
    }

    /**
     * Prüft die Form der Serie an ihrer ersten Instanz.
     *
     * Drei Verstösse bleiben dabei aussen vor: eine Kollision lässt die einzelne
     * Instanz ausfallen statt die Serie scheitern, der Vorlauf gilt für Serien
     * nicht (sonst liesse sich kein Jahr im Voraus erzeugen), und ein Beginn in
     * der Vergangenheit ist bei einer Serie normal — sie beschreibt einen
     * Rhythmus, nicht einen Termin.
     *
     * @param  array<string, mixed>  $data
     *
     * @throws BookingRuleException
     */
    private function checkShape(array $data, Role $role): void
    {
        $timezone = $this->timezone();

        $schedule = new SeriesSchedule(
            $data['interval'],
            (int) $data['intervalCount'],
            CarbonImmutable::parse($data['firstInstanceStart'], $timezone),
            CarbonImmutable::parse($data['firstInstanceEnd'], $timezone),
            null,
            $timezone,
        );

        $first = $schedule->firstOccurrence();

        $result = $this->validator->validate(
            new BookingCandidate(
                $data['workplaceId'],
                $first->startTime,
                $first->endTime,
                usageRulesAcknowledged: true,
            ),
            $role,
        );

        $relevant = array_values(array_filter(
            $result->violations,
            fn (ViolationCode $code): bool => ! in_array($code, [
                ViolationCode::Collision,
                ViolationCode::ExceedsMaxEndOffset,
                ViolationCode::StartsInPast,
            ], strict: true),
        ));

        if ($relevant !== []) {
            throw new BookingRuleException(new ValidationResult(
                $relevant,
                [],
                $result->chargeableDurationMinutes,
                $result->blockedWorkplaceIds,
            ));
        }
    }

    private function deleteFutureInstances(BookingSeries $series): void
    {
        $series->bookings()
            ->where('start_time', '>', CarbonImmutable::now('UTC'))
            ->delete();
    }

    /** "2026-08-03T09:00" wird zu "2026-08-03 09:00:00" — ohne Zeitzone, wie die Spalte. */
    private function wallClock(string $value): string
    {
        return str_replace('T', ' ', $value).':00';
    }

    private function timezone(): string
    {
        return GlobalSetting::current()->timezone;
    }

    private function today(): CarbonImmutable
    {
        return CarbonImmutable::now($this->timezone())->startOfDay();
    }

    /** Der letzte Tag, bis zu dem Instanzen erzeugt werden — lokal, nicht UTC. */
    private function horizon(): CarbonImmutable
    {
        return $this->today()->addYears(self::HORIZON_YEARS);
    }
}
