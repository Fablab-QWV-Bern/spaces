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
        // Ohne "data"-Umhüllung: spec/reservation-api.yml beschreibt nackte Arrays
        // und Objekte. Die Spec ist der Vertrag, die Antwort richtet sich danach.
        JsonResource::withoutWrapping();
    }
}
