<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Nachts, weil der Lauf bei vielen Serien hunderte Buchungen schreibt.
// `withoutOverlapping` schützt gegen einen zweiten Lauf, solange der erste
// hängt — auf dem Hosting gibt es keine Warteschlange, die das täte.
Schedule::command('booking-series:instantiate')
    ->dailyAt('03:00')
    ->withoutOverlapping();
