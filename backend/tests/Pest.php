<?php

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// Jeder Test startet mit einem migrierten, leeren Schema in einer Transaktion,
// die danach zurueckgerollt wird.
pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature', 'Unit');
