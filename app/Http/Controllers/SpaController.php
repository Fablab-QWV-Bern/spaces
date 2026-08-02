<?php

namespace App\Http\Controllers;

use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Liefert die gebaute Angular-Anwendung aus. Kommt nur zum Zug, wenn der
 * Webserver unter dem Pfad keine Datei gefunden hat — die Router-Pfade der SPA
 * (`/tag`, `/woche`, …) liegen nicht auf der Platte.
 */
class SpaController extends Controller
{
    public function __invoke(): BinaryFileResponse
    {
        $index = public_path('index.html');

        // In der Entwicklung liefert `ng serve` die Oberfläche; unter
        // `artisan serve` gibt es sie schlicht nicht.
        abort_unless(is_file($index), 404, 'Die Oberfläche ist nicht gebaut.');

        return response()->file($index);
    }
}
