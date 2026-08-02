<?php

use App\Http\Controllers\SpaController;
use Illuminate\Support\Facades\Route;

// Alles, was keine Datei ist, beantwortet der Angular-Router. Die API-Routen
// werden erst im `then`-Rückruf von bootstrap/app.php registriert, also nach
// dieser hier — ohne die Ausnahme im `where` verschluckte der Auffangpfad sie.
// `/api/unbekannt` soll ein JSON-404 sein und `/storage/fehlt.jpg` ein
// Bild-404, nicht beides die Oberfläche.
Route::get('/{pfad?}', SpaController::class)
    ->where('pfad', '^(?!api(/|$)|storage(/|$)).*$');
