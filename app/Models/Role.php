<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

/**
 * A user role shared by several people. There are deliberately no users: who did
 * the booking is recorded as name + contact on the booking itself.
 *
 * Authentication happens as a role, not as a person — which is why this model is
 * the Authenticatable of the `web` guard.
 */
class Role extends Authenticatable
{
    use HasUlids, Notifiable;

    /** The permissions as they appear in the API as an object. */
    public const PERMISSIONS = [
        'viewBookings' => 'view_bookings',
        'viewBookingsDetails' => 'view_bookings_details',
        'manageBookings' => 'manage_bookings',
        'noTimeRestrictions' => 'no_time_restrictions',
        'manageBookingSeries' => 'manage_booking_series',
        'manageWorkplaces' => 'manage_workplaces',
        'manageAreas' => 'manage_areas',
        'manageRoles' => 'manage_roles',
    ];

    protected $fillable = [
        'name',
        'password',
        'is_anonymous',
        ...self::PERMISSIONS,
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'is_anonymous' => 'boolean',
            'view_bookings' => 'boolean',
            'view_bookings_details' => 'boolean',
            'manage_bookings' => 'boolean',
            'no_time_restrictions' => 'boolean',
            'manage_booking_series' => 'boolean',
            'manage_workplaces' => 'boolean',
            'manage_areas' => 'boolean',
            'manage_roles' => 'boolean',
        ];
    }

    /** The anonymous role that every unauthenticated call gets. */
    public static function anonymous(): self
    {
        return self::where('is_anonymous', true)->firstOrFail();
    }

    public function can($abilities, $arguments = []): bool
    {
        $column = self::PERMISSIONS[$abilities] ?? null;

        return $column !== null
            ? (bool) $this->{$column}
            : parent::can($abilities, $arguments);
    }

    /** The permissions in the shape the API delivers them. */
    public function permissionMap(): array
    {
        return array_map(
            fn (string $column): bool => (bool) $this->{$column},
            self::PERMISSIONS,
        );
    }
}
