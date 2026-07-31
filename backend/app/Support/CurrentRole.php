<?php

namespace App\Support;

use App\Models\Role;

/**
 * Die Rolle, als die der aktuelle Aufruf handelt. Ohne Anmeldung ist das die
 * Rolle mit `is_anonymous` — es gibt keinen Zustand "kein Benutzer".
 */
final class CurrentRole
{
    private ?Role $resolved = null;

    public function get(): Role
    {
        return $this->resolved ??= auth()->user() ?? Role::anonymous();
    }

    public function can(string $permission): bool
    {
        return $this->get()->can($permission);
    }
}
