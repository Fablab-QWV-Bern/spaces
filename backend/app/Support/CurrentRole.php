<?php

namespace App\Support;

use App\Models\Role;

/**
 * The role the current call acts as. Without a login that is the role with
 * `is_anonymous` — there is no "no user" state.
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
