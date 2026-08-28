<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Both of these run daily. On the hosting each is wired as its own Plesk
// "Scheduled Task" that calls the command directly, so that Plesk's "notify on
// error" actually watches it: Laravel's scheduler catches a command's failure
// per event and still exits 0, so a single every-minute `schedule:run` behind
// that notification would report a green run while the backup produced nothing.
// The cadence stays here nonetheless — `schedule:work` uses it locally, and it
// belongs in the repository rather than only in a Plesk form.

// 02:00, before the series top-up, so two multi-second jobs never overlap in
// the hosting's 180 s window.
Schedule::command('backup:db')
    ->dailyAt('02:00')
    ->withoutOverlapping();

// At night, because with many series the run writes hundreds of bookings.
// `withoutOverlapping` guards against a second run while the first is stuck — on
// the hosting there is no queue that would do that.
Schedule::command('booking-series:instantiate')
    ->dailyAt('03:00')
    ->withoutOverlapping();
