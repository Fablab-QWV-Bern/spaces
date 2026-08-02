<?php

use App\Http\Controllers\SpaController;
use Illuminate\Http\Request;

// Der Auffangpfad in routes/web.php wird vor den API-Routen registriert. Ohne
// die Ausnahme im `where` beantwortete er sie mit der Oberfläche, und zwar
// stillschweigend: der Aufruf käme mit 200 und HTML zurück.

function zustaendigFuer(string $pfad): string
{
    return app('router')->getRoutes()
        ->match(Request::create($pfad))
        ->getActionName();
}

it('lässt die API in Ruhe', function (): void {
    $this->getJson('/api/gibtesnicht')
        ->assertNotFound()
        ->assertHeader('content-type', 'application/json');
});

it('lässt /storage in Ruhe', function (): void {
    // Dort liegt in der Entwicklung die Route der `local`-Platte und in der
    // Produktion der Symlink auf `storage/app/public`. Beide sind besser als
    // eine HTML-Seite anstelle eines fehlenden Fotos.
    expect(zustaendigFuer('/storage/kein-foto.jpg'))->not->toBe(SpaController::class);
});

it('greift für Pfade des Angular-Routers', function (): void {
    expect(zustaendigFuer('/'))->toBe(SpaController::class)
        ->and(zustaendigFuer('/woche'))->toBe(SpaController::class)
        ->and(zustaendigFuer('/arbeitsplatz'))->toBe(SpaController::class);

    // Ohne gebaute Oberfläche bleibt es beim 404.
    $this->get('/woche')->assertNotFound();
});
