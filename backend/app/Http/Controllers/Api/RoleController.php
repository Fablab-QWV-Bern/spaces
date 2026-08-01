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
        // Wie in der Anmeldeliste: nach Alter, damit die Reihenfolge stabil
        // bleibt, wenn eine Rolle umbenannt wird.
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
            // `isAnonymous` ist über die API nicht setzbar: die anonyme Rolle
            // gibt es genau einmal, und sie ist ausgesät, nicht angelegt.
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

        // Sonst könnte sich jeder Aufruf ohne Anmeldung selbst zum Verwalter
        // machen. Die Spec verlangt das nicht ausdrücklich, aber eine anonyme
        // Rolle mit diesem Recht ist kein sinnvoller Zustand.
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

        // Ein weggelassenes Kennwort lässt das bisherige stehen — sonst müsste
        // man es bei jeder Umbenennung neu setzen.
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

        // Buchungen dieser Rolle behalten ihre `creator_role_id` als
        // Karteileiche: sie sind ein historischer Beleg, kein Verweis, den man
        // noch verfolgen müsste.
        $role->delete();

        return response()->json(status: 204);
    }

    /** Ob diese Rolle die einzige ist, die `manageRoles` trägt. */
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
            // Beim Anlegen Pflicht: eine Rolle ohne Kennwort stünde in der
            // Anmeldeliste, ohne dass man sich mit ihr anmelden könnte.
            'password' => [$role === null ? 'required' : 'sometimes', 'nullable', 'string', 'min:8'],
            'permissions' => ['required', 'array'],
        ];

        foreach (array_keys(Role::PERMISSIONS) as $permission) {
            $rules["permissions.{$permission}"] = ['required', 'boolean'];
        }

        return $request->validate($rules);
    }

    /**
     * Die Berechtigungen aus der API-Form in die Spaltennamen übersetzt.
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
