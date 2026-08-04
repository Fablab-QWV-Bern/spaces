<?php

namespace App\Http\Controllers;

use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Serves the built Angular application. Only comes into play when the web server
 * found no file at the path — the SPA's router paths (`/tag`, `/woche`, …) do not
 * exist on disk.
 */
class SpaController extends Controller
{
    public function __invoke(): BinaryFileResponse
    {
        $index = public_path('index.html');

        // In development `ng serve` serves the interface; under `artisan serve`
        // it simply does not exist.
        abort_unless(is_file($index), 404, 'Die Oberfläche ist nicht gebaut.');

        return response()->file($index);
    }
}
