<?php

use App\Http\Controllers\AgendaWidgetController;
use App\Http\Controllers\BookingListWidgetController;
use App\Http\Controllers\SpaController;
use Illuminate\Support\Facades\Route;

// The embeddable widgets. Before the catch-all, which would otherwise hand these
// paths to the Angular router.
Route::get('/liste', BookingListWidgetController::class);
Route::get('/agenda', AgendaWidgetController::class);

// Everything that is not a file is answered by the Angular router. The API
// routes are only registered in the `then` callback of bootstrap/app.php, that is
// after this one — without the exception in `where`, the catch-all would swallow
// them. `/api/unbekannt` should be a JSON 404 and `/storage/fehlt.jpg` an image
// 404, not both the interface.
Route::get('/{pfad?}', SpaController::class)
    ->where('pfad', '^(?!api(/|$)|storage(/|$)).*$');
