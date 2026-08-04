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
    /** Login attempts per IP and minute before throttling kicks in. */
    private const MAX_ATTEMPTS = 5;

    public function __construct(private readonly CurrentRole $currentRole) {}

    /**
     * Never answers with 401: without a login the current role is the anonymous
     * one. The frontend decides from that what it shows at all.
     */
    public function show(): SessionResource
    {
        return new SessionResource($this->currentRole->get());
    }

    /**
     * Public: the login shows one button per role rather than a free-text field.
     * Names only, no permissions — the anonymous role is absent, it has no
     * password and cannot log in.
     */
    public function roles(): JsonResponse
    {
        return response()->json(
            Role::where('is_anonymous', false)->orderBy('created_at')->pluck('name'),
        );
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

        // The anonymous role has no password and must not log in — otherwise one
        // could get in through an empty hash comparison.
        $role = Role::where('name', $credentials['roleName'])
            ->where('is_anonymous', false)
            ->first();

        if ($role === null || ! Auth::attempt(['id' => $role->id, 'password' => $credentials['password']])) {
            RateLimiter::hit($throttleKey);

            return response()->json(['message' => 'Rolle oder Kennwort stimmt nicht.'], 401);
        }

        RateLimiter::clear($throttleKey);

        // Against session fixation: a new session ID after logging in.
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
