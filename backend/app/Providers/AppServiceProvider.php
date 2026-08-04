<?php

namespace App\Providers;

use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // Without the "data" wrapper: spec/reservation-api.yml describes bare
        // arrays and objects. The spec is the contract; the response follows it.
        JsonResource::withoutWrapping();
    }
}
