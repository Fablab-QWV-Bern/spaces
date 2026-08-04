<?php

use App\Http\Controllers\SpaController;
use Illuminate\Http\Request;

// The catch-all in routes/web.php is registered before the API routes. Without
// the exception in `where` it would answer them with the interface, and do so
// silently: the call would come back with 200 and HTML.

function handlerFor(string $path): string
{
    return app('router')->getRoutes()
        ->match(Request::create($path))
        ->getActionName();
}

it('leaves the API alone', function (): void {
    $this->getJson('/api/gibtesnicht')
        ->assertNotFound()
        ->assertHeader('content-type', 'application/json');
});

it('leaves /storage alone', function (): void {
    // In development that is where the `local` disk's route lives, and in
    // production the symlink to `storage/app/public`. Both are better than an
    // HTML page in place of a missing photo.
    expect(handlerFor('/storage/kein-foto.jpg'))->not->toBe(SpaController::class);
});

it('takes effect for Angular router paths', function (): void {
    expect(handlerFor('/'))->toBe(SpaController::class)
        ->and(handlerFor('/woche'))->toBe(SpaController::class)
        ->and(handlerFor('/arbeitsplatz'))->toBe(SpaController::class);

    // Without a built interface it stays at 404.
    $this->get('/woche')->assertNotFound();
});
