<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * The global configuration. Exactly one row with id = 1.
 */
class GlobalSetting extends Model
{
    public const SINGLETON_ID = 1;

    protected $table = 'global_settings';

    public $incrementing = false;

    protected $keyType = 'int';

    protected $fillable = [
        'id',
        'opens_at',
        'closes_at',
        'max_booking_end_offset_days',
        'timezone',
    ];

    protected function casts(): array
    {
        return [
            // Deliberately as strings: these are times of day ("08:00"), not instants.
            'opens_at' => 'string',
            'closes_at' => 'string',
            'max_booking_end_offset_days' => 'integer',
        ];
    }

    public static function current(): self
    {
        return self::findOrFail(self::SINGLETON_ID);
    }
}
