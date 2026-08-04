<?php

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// Every test starts with a migrated, empty schema inside a transaction that is
// rolled back afterwards.
pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature', 'Unit');
