<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\RoleResource;
use App\Models\Role;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class RoleController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        // As in the login list: by age, so that the ordering stays stable when a
        // role is renamed.
        return RoleResource::collection(Role::orderBy('created_at')->get());
    }

    public function show(Role $role): RoleResource
    {
        return new RoleResource($role);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatePayload($request, null);

        $role = Role::create([
            'name' => $data['name'],
            'password' => $data['password'],
            // `isAnonymous` cannot be set through the API: the anonymous role
            // exists exactly once, and it is seeded, not created.
            'is_anonymous' => false,
            ...$this->permissionColumns($data['permissions']),
        ]);

        return (new RoleResource($role))
            ->response()
            ->setStatusCode(201)
            ->header('Location', "/api/roles/{$role->id}");
    }

    public function update(Request $request, Role $role): RoleResource|JsonResponse
    {
        $data = $this->validatePayload($request, $role);
        $permissions = $data['permissions'];

        if ($role->is_anonymous && ($data['password'] ?? null) !== null) {
            return $this->refuse('Die anonyme Rolle hat kein Kennwort.');
        }

        // Otherwise any call without a login could make itself an administrator.
        // The spec does not explicitly require this, but an anonymous role with
        // that permission is not a sensible state.
        if ($role->is_anonymous && $permissions['manageRoles']) {
            return $this->refuse('Die anonyme Rolle darf Rollen und Konfiguration nicht verwalten.');
        }

        if (! $permissions['manageRoles'] && $this->isLastAdmin($role)) {
            return $this->refuse(
                'Mindestens eine Rolle muss Rollen und Konfiguration verwalten dürfen.',
            );
        }

        $attributes = [
            'name' => $data['name'],
            ...$this->permissionColumns($permissions),
        ];

        // An omitted password leaves the existing one in place — otherwise it
        // would have to be set again on every rename.
        if (($data['password'] ?? null) !== null) {
            $attributes['password'] = $data['password'];
        }

        $role->update($attributes);

        return new RoleResource($role);
    }

    public function destroy(Role $role): JsonResponse
    {
        if ($role->is_anonymous) {
            return $this->refuse('Die anonyme Rolle lässt sich nicht löschen.');
        }

        if ($this->isLastAdmin($role)) {
            return $this->refuse(
                'Mindestens eine Rolle muss Rollen und Konfiguration verwalten dürfen.',
            );
        }

        // Bookings made by this role keep their `creator_role_id` as a dangling
        // record: they are a historical trace, not a reference anyone still needs
        // to follow.
        $role->delete();

        return response()->json(status: 204);
    }

    /** Whether this role is the only one carrying `manageRoles`. */
    private function isLastAdmin(Role $role): bool
    {
        return $role->manage_roles
            && ! Role::where('manage_roles', true)->whereKeyNot($role->getKey())->exists();
    }

    private function refuse(string $message): JsonResponse
    {
        return response()->json(['message' => $message], 422);
    }

    /**
     * @return array<string, mixed>
     */
    private function validatePayload(Request $request, ?Role $role): array
    {
        $rules = [
            'name' => [
                'required', 'string', 'min:1', 'max:100',
                Rule::unique('roles', 'name')->ignore($role?->getKey()),
            ],
            // Required when creating: a role without a password would appear in
            // the login list without being usable to log in.
            'password' => [$role === null ? 'required' : 'sometimes', 'nullable', 'string', 'min:8'],
            'permissions' => ['required', 'array'],
        ];

        foreach (array_keys(Role::PERMISSIONS) as $permission) {
            $rules["permissions.{$permission}"] = ['required', 'boolean'];
        }

        return $request->validate($rules);
    }

    /**
     * Translates the permissions from the API shape into the column names.
     *
     * @param  array<string, bool>  $permissions
     * @return array<string, bool>
     */
    private function permissionColumns(array $permissions): array
    {
        $columns = [];

        foreach (Role::PERMISSIONS as $permission => $column) {
            $columns[$column] = $permissions[$permission];
        }

        return $columns;
    }
}
