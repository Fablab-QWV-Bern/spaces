<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class Role extends Model
{
    use HasUuids;

    protected $fillable = [
        'name',
        'password_hash',
        'permissions',
    ];

    protected $casts = [
        'permissions' => 'array',
    ];
}
