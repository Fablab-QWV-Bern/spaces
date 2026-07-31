<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SessionResource;
use App\Support\CurrentRole;

class SessionController extends Controller
{
    public function __construct(private readonly CurrentRole $currentRole) {}

    /**
     * Antwortet nie mit 401: ohne Anmeldung ist die aktuelle Rolle die anonyme.
     * Das Frontend entscheidet daraus, was es überhaupt anzeigt.
     */
    public function show(): SessionResource
    {
        return new SessionResource($this->currentRole->get());
    }
}
