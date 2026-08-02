<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

/**
 * Eine Benutzerrolle, die sich mehrere Personen teilen. Es gibt bewusst keine
 * Benutzer: wer gebucht hat, steht als Name + Kontakt auf der Buchung.
 *
 * Authentifiziert wird als Rolle, nicht als Person — deshalb ist dieses Modell
 * das Authenticatable des `web`-Guards.
 */
class Role extends Authenticatable
{
    use HasUlids, Notifiable;

    /** Die Berechtigungen, wie sie in der API als Objekt erscheinen. */
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

    /** Die anonyme Rolle, die jeder nicht angemeldete Aufruf erhält. */
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

    /** Die Berechtigungen in der Form, in der die API sie ausliefert. */
    public function permissionMap(): array
    {
        return array_map(
            fn (string $column): bool => (bool) $this->{$column},
            self::PERMISSIONS,
        );
    }
}
