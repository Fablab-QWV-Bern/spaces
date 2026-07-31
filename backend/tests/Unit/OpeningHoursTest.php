<?php

use App\Domain\Booking\OpeningHours;
use Carbon\CarbonImmutable;

/** Öffnungszeiten 08:00–21:00, Anzeige in Schweizer Zeit. */
function hours(): OpeningHours
{
    return new OpeningHours('08:00', '21:00', 'Europe/Zurich');
}

/** Erzeugt einen UTC-Zeitpunkt aus lokaler Schweizer Wanduhrzeit. */
function local(string $wallClock): CarbonImmutable
{
    return CarbonImmutable::parse($wallClock, 'Europe/Zurich')->utc();
}

it('rechnet eine Buchung innerhalb eines Tages voll an', function () {
    expect(hours()->chargeableMinutes(local('2026-08-03 09:00'), local('2026-08-03 11:00')))
        ->toBe(120);
});

it('laesst die Nachtstunden aussen vor', function () {
    // Freitag 20:00 bis Samstag 09:00: eine Stunde am Abend, eine am Morgen.
    expect(hours()->chargeableMinutes(local('2026-08-07 20:00'), local('2026-08-08 09:00')))
        ->toBe(120);
});

it('summiert ueber mehrere Tage nur die Zeit innerhalb der Oeffnungszeiten', function () {
    // Fr 20:00 -> So 09:00: 60 + (Sa 08–21 = 780) + 60
    expect(hours()->chargeableMinutes(local('2026-08-07 20:00'), local('2026-08-09 09:00')))
        ->toBe(900);
});

it('bleibt ueber die Zeitumstellung hinweg bei der Wanduhr', function () {
    // In der Nacht auf den 29.03.2026 wird die Uhr in der Schweiz vorgestellt.
    // Real verstreichen zwischen 20:00 und 09:00 nur 12 Stunden, angerechnet
    // werden trotzdem die zwei Stunden innerhalb der Oeffnungszeiten.
    $start = local('2026-03-28 20:00');
    $end = local('2026-03-29 09:00');

    expect($start->diffInHours($end))->toBe(12.0)
        ->and(hours()->chargeableMinutes($start, $end))->toBe(120);
});

it('rechnet nichts an, wenn alles ausserhalb der Oeffnungszeiten liegt', function () {
    expect(hours()->chargeableMinutes(local('2026-08-03 22:00'), local('2026-08-03 23:00')))
        ->toBe(0);
});

it('akzeptiert Start und Ende genau an den Raendern', function () {
    expect(hours()->isValidStart(local('2026-08-03 08:00')))->toBeTrue()
        ->and(hours()->isValidEnd(local('2026-08-03 21:00')))->toBeTrue()
        // 21:00 ist kein gueltiger Beginn, 08:00 kein gueltiges Ende.
        ->and(hours()->isValidStart(local('2026-08-03 21:00')))->toBeFalse()
        ->and(hours()->isValidEnd(local('2026-08-03 08:00')))->toBeFalse();
});

it('weist Zeiten ausserhalb der Oeffnungszeiten zurueck', function () {
    expect(hours()->isValidStart(local('2026-08-03 07:45')))->toBeFalse()
        ->and(hours()->isValidEnd(local('2026-08-03 21:15')))->toBeFalse();
});

it('erkennt eine Buchung ueber Nacht am Kalendertag', function () {
    expect(hours()->spansNight(local('2026-08-03 09:00'), local('2026-08-03 21:00')))->toBeFalse()
        ->and(hours()->spansNight(local('2026-08-03 20:00'), local('2026-08-04 09:00')))->toBeTrue();
});
