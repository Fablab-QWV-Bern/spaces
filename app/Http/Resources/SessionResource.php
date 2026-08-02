<?php

namespace App\Http\Resources;

use App\Models\Role;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Role */
class SessionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'roleId' => $this->id,
            'roleName' => $this->name,
            'isAnonymous' => $this->is_anonymous,
            'permissions' => $this->permissionMap(),
        ];
    }
}
