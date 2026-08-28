<?php

use App\Models\Booking;
use App\Models\Role;
use Carbon\CarbonImmutable;
use Database\Seeders\DatabaseSeeder;

beforeEach(function () {
    $this->seed(DatabaseSeeder::class);

    $this->anonymous = Role::where('is_anonymous', true)->firstOrFail();
    $this->admin = Role::where('name', 'Admin')->firstOrFail();

    // Relative to now, because the feed puts a sliding window around the request.
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

it('serves an iCalendar document', function () {
    $response = $this->get(feed())->assertOk();

    $response->assertHeader('Content-Type', 'text/calendar; charset=utf-8');

    $body = $response->getContent();

    expect($body)->toStartWith("BEGIN:VCALENDAR\r\n")
        ->and($body)->toEndWith("END:VCALENDAR\r\n")
        ->and($body)->toContain('VERSION:2.0')
        ->and(substr_count($body, 'BEGIN:VEVENT'))->toBe(1);
});

it('names workplace and booker in the summary', function () {
    expect($this->get(feed())->getContent())
        ->toContain('SUMMARY:Holz 1: Hans Cramer');
});

it('writes the times in UTC', function () {
    $body = $this->get(feed())->getContent();

    expect($body)
        ->toContain('DTSTART:'.$this->start->format('Ymd\THis\Z'))
        ->toContain('DTEND:'.$this->start->addHours(2)->format('Ymd\THis\Z'));
});

it('assigns a UID that identifies the booking uniquely', function () {
    expect($this->get(feed())->getContent())
        ->toContain("UID:{$this->booking->id}@localhost");
});

it('names the workplace location, otherwise name and area', function () {
    Booking::create([
        'workplace_id' => 'holz-6', // carries "Untergeschoss" as its location
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

it('withholds the contact while the anonymous role may not see it', function () {
    expect($this->get(feed())->getContent())->not->toContain('hans@example.org');

    $this->anonymous->update(['view_bookings_details' => true]);

    expect($this->get(feed())->getContent())->toContain('DESCRIPTION:hans@example.org');
});

it('shows a logged-in role nothing other than the calendar client sees', function () {
    $anonymously = $this->get(feed())->getContent();

    // The admin may see contacts — but not in the feed, otherwise the preview in
    // the browser would show more than the subscription delivers afterwards.
    $asAdmin = $this->actingAs($this->admin)->get(feed())->getContent();

    expect($asAdmin)->not->toContain('hans@example.org');

    // Apart from the request timestamp it is the same document.
    $withoutStamp = fn (string $body): string => preg_replace('/^DTSTAMP:.*$/m', '', $body);

    expect($withoutStamp($asAdmin))->toBe($withoutStamp($anonymously));
});

it('refuses the feed when the anonymous role may not see bookings', function () {
    $this->anonymous->update(['view_bookings' => false]);

    $this->get(feed())->assertForbidden();
});

it('filters by workplace', function () {
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

    expect($this->get(feed(['workplaceId' => 'metall-vorne']))->getContent())
        ->toContain('Ida Roth')
        ->not->toContain('Hans Cramer');
});

it('answers an unknown filter with 404 rather than an empty calendar', function () {
    $this->get(feed(['workplaceId' => 'gibt-es-nicht']))->assertNotFound();
});

it('covers three months in both directions', function () {
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

it('escapes special characters and folds long lines', function () {
    $this->booking->update(['name' => 'Meier, Hans; Werkstatt für Möbel und andere grössere Holzarbeiten']);

    $body = $this->get(feed())->getContent();

    // Comma and semicolon escaped, neither misread as a separator.
    expect($body)->toContain('SUMMARY:Holz 1: Meier\, Hans\; Werkstatt für Möbel und ');

    foreach (explode("\r\n", $body) as $line) {
        expect(strlen($line))->toBeLessThanOrEqual(75);
    }

    // The folding must not split a character: the document stays valid UTF-8.
    expect(mb_check_encoding($body, 'UTF-8'))->toBeTrue();
});
