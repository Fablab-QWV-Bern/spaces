<?php

namespace App\Http\Middleware;

use App\Support\CurrentRole;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Setzt die `x-permissions` der API-Spec durch. Verwendung: `permission:viewBookings`.
 */
class EnsurePermission
{
    public function __construct(private readonly CurrentRole $currentRole) {}

    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        foreach ($permissions as $permission) {
            if (! $this->currentRole->can($permission)) {
                abort(403, "Die aktuelle Rolle darf das nicht ({$permission}).");
            }
        }

        return $next($request);
    }
}
