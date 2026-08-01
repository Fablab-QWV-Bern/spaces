<?php

use App\Models\Area;
use App\Models\Booking;
use App\Models\Role;
use Carbon\CarbonImmutable;
use Database\Seeders\DatabaseSeeder;

beforeEach(function () {
    $this->seed(DatabaseSeeder::class);

    $this->anonymous = Role::where('is_anonymous', true)->firstOrFail();
    $this->admin = Role::where('name', 'Admin')->firstOrFail();

    // Relativ zu jetzt, weil der Feed ein gleitendes Fenster um den Abruf legt.
    $this->start = CarbonImmutable::now()->utc()->addWeek()->startOfHour();

    $this->booking = Booking::create([
        'workplace_id' => 'holz-1',
        'name' => 'Hans Cramer',
        'contact' => 'hans@example.org',
        'start_time' => $this->start,
        'end_time' => $this->start->addHours(2),
        'chargeable_duration_minutes' => 120,
    ]);
});

function feed(array $query = []): string
{
    return '/api/calendar.ics'.($query === [] ? '' : '?'.http_build_query($query));
}

it('liefert ein iCalendar-Dokument aus', function () {
    $response = $this->get(feed())->assertOk();

    $response->assertHeader('Content-Type', 'text/calendar; charset=utf-8');

    $body = $response->getContent();

    expect($body)->toStartWith("BEGIN:VCALENDAR\r\n")
        ->and($body)->toEndWith("END:VCALENDAR\r\n")
        ->and($body)->toContain('VERSION:2.0')
        ->and(substr_count($body, 'BEGIN:VEVENT'))->toBe(1);
});

it('nennt Arbeitsplatz und Buchenden in der Zusammenfassung', function () {
    expect($this->get(feed())->getContent())
        ->toContain('SUMMARY:Holz 1: Hans Cramer');
});

it('schreibt die Zeiten in UTC', function () {
    $body = $this->get(feed())->getContent();

    expect($body)
        ->toContain('DTSTART:'.$this->start->format('Ymd\THis\Z'))
        ->toContain('DTEND:'.$this->start->addHours(2)->format('Ymd\THis\Z'));
});

it('vergibt eine UID, die die Buchung eindeutig bezeichnet', function () {
    expect($this->get(feed())->getContent())
        ->toContain("UID:{$this->booking->id}@localhost");
});

it('nennt den Ort des Arbeitsplatzes, sonst Name und Bereich', function () {
    Booking::create([
        'workplace_id' => 'holz-6', // trägt "Untergeschoss" als Ort
        'name' => 'Ida Roth',
        'contact' => 'ida@example.org',
        'start_time' => $this->start,
        'end_time' => $this->start->addHour(),
        'chargeable_duration_minutes' => 60,
    ]);

    expect($this->get(feed())->getContent())
        ->toContain('LOCATION:Holz 1 (Holz)')
        ->toContain('LOCATION:Untergeschoss');
});

it('verschweigt den Kontakt, solange die anonyme Rolle ihn nicht sehen darf', function () {
    expect($this->get(feed())->getContent())->not->toContain('hans@example.org');

    $this->anonymous->update(['view_bookings_details' => true]);

    expect($this->get(feed())->getContent())->toContain('DESCRIPTION:hans@example.org');
});

it('zeigt einer angemeldeten Rolle nichts anderes als dem Kalenderclient', function () {
    $anonymously = $this->get(feed())->getContent();

    // Der Admin darf Kontakte sehen — im Feed trotzdem nicht, sonst zeigte die
    // Vorschau im Browser mehr als das Abo danach liefert.
    $asAdmin = $this->actingAs($this->admin)->get(feed())->getContent();

    expect($asAdmin)->not->toContain('hans@example.org');

    // Bis auf den Zeitstempel des Abrufs ist es dasselbe Dokument.
    $withoutStamp = fn (string $body): string => preg_replace('/^DTSTAMP:.*$/m', '', $body);

    expect($withoutStamp($asAdmin))->toBe($withoutStamp($anonymously));
});

it('verweigert den Feed, wenn die anonyme Rolle keine Buchungen sehen darf', function () {
    $this->anonymous->update(['view_bookings' => false]);

    $this->get(feed())->assertForbidden();
});

it('filtert nach Arbeitsplatz und Bereich', function () {
    Booking::create([
        'workplace_id' => 'metall-vorne',
        'name' => 'Ida Roth',
        'contact' => 'ida@example.org',
        'start_time' => $this->start,
        'end_time' => $this->start->addHour(),
        'chargeable_duration_minutes' => 60,
    ]);

    expect($this->get(feed(['workplaceId' => 'holz-1']))->getContent())
        ->toContain('Hans Cramer')
        ->not->toContain('Ida Roth');

    $metall = Area::where('name', 'Metall')->firstOrFail();

    expect($this->get(feed(['areaId' => $metall->id]))->getContent())
        ->toContain('Ida Roth')
        ->not->toContain('Hans Cramer');
});

it('beantwortet einen unbekannten Filter mit 404 statt mit einem leeren Kalender', function () {
    $this->get(feed(['workplaceId' => 'gibt-es-nicht']))->assertNotFound();
    $this->get(feed(['areaId' => 'gibt-es-nicht']))->assertNotFound();
});

it('deckt drei Monate in beide Richtungen ab', function () {
    $outside = fn (CarbonImmutable $start) => Booking::create([
        'workplace_id' => 'holz-2',
        'name' => 'Weit weg',
        'contact' => 'weit@example.org',
        'start_time' => $start,
        'end_time' => $start->addHour(),
        'chargeable_duration_minutes' => 60,
    ]);

    $outside(CarbonImmutable::now()->utc()->addMonths(4));
    $outside(CarbonImmutable::now()->utc()->subMonths(4));

    $inside = CarbonImmutable::now()->utc()->subMonths(2);
    $outside($inside);

    $body = $this->get(feed())->getContent();

    expect(substr_count($body, 'BEGIN:VEVENT'))->toBe(2)
        ->and($body)->toContain('DTSTART:'.$inside->format('Ymd\THis\Z'));
});

it('maskiert Sonderzeichen und faltet lange Zeilen', function () {
    $this->booking->update(['name' => 'Meier, Hans; Werkstatt für Möbel und andere grössere Holzarbeiten']);

    $body = $this->get(feed())->getContent();

    // Komma und Semikolon maskiert, nichts davon als Trennzeichen missverstanden.
    expect($body)->toContain('SUMMARY:Holz 1: Meier\, Hans\; Werkstatt für Möbel und ');

    foreach (explode("\r\n", $body) as $line) {
        expect(strlen($line))->toBeLessThanOrEqual(75);
    }

    // Die Faltung darf kein Zeichen zerlegen: das Dokument bleibt gültiges UTF-8.
    expect(mb_check_encoding($body, 'UTF-8'))->toBeTrue();
});
