<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// At night, because with many series the run writes hundreds of bookings.
// `withoutOverlapping` guards against a second run while the first is stuck — on
// the hosting there is no queue that would do that.
Schedule::command('booking-series:instantiate')
    ->dailyAt('03:00')
    ->withoutOverlapping();
