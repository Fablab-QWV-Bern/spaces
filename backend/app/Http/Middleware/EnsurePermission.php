<?php

namespace App\Http\Middleware;

use App\Support\CurrentRole;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Enforces the `x-permissions` of the API spec. Usage: `permission:viewBookings`.
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
