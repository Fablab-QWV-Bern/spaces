<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SessionResource;
use App\Models\Role;
use App\Support\CurrentRole;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;

class SessionController extends Controller
{
    /** Anmeldeversuche pro IP und Minute, bevor gebremst wird. */
    private const MAX_ATTEMPTS = 5;

    public function __construct(private readonly CurrentRole $currentRole) {}

    /**
     * Antwortet nie mit 401: ohne Anmeldung ist die aktuelle Rolle die anonyme.
     * Das Frontend entscheidet daraus, was es überhaupt anzeigt.
     */
    public function show(): SessionResource
    {
        return new SessionResource($this->currentRole->get());
    }

    public function login(Request $request): SessionResource|JsonResponse
    {
        $credentials = $request->validate([
            'roleName' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $throttleKey = 'login:'.$request->ip();

        if (RateLimiter::tooManyAttempts($throttleKey, self::MAX_ATTEMPTS)) {
            return response()->json([
                'message' => 'Zu viele Anmeldeversuche. Bitte in '
                    .RateLimiter::availableIn($throttleKey).' Sekunden erneut versuchen.',
            ], 429);
        }

        // Die anonyme Rolle hat kein Kennwort und darf sich nicht anmelden —
        // sonst käme man über einen leeren Hash-Vergleich hinein.
        $role = Role::where('name', $credentials['roleName'])
            ->where('is_anonymous', false)
            ->first();

        if ($role === null || ! Auth::attempt(['id' => $role->id, 'password' => $credentials['password']])) {
            RateLimiter::hit($throttleKey);

            return response()->json(['message' => 'Rolle oder Kennwort stimmt nicht.'], 401);
        }

        RateLimiter::clear($throttleKey);

        // Gegen Session Fixation: nach der Anmeldung eine neue Session-ID.
        $request->session()->regenerate();

        return new SessionResource($role);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(status: 204);
    }
}
