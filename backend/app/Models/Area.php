<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Area extends Model
{
    use HasUlids;

    protected $fillable = [
        'name',
        'color',
        'max_booking_duration_minutes',
        'max_booking_end_offset_days',
        'allow_nightly_activities',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'max_booking_duration_minutes' => 'integer',
            'max_booking_end_offset_days' => 'integer',
            'allow_nightly_activities' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function workplaces(): HasMany
    {
        return $this->hasMany(Workplace::class)->orderBy('sort_order');
    }

    /** Der Vorlauf dieses Bereichs, sonst der globale Wert. */
    public function effectiveMaxBookingEndOffsetDays(GlobalSetting $settings): int
    {
        return $this->max_booking_end_offset_days ?? $settings->max_booking_end_offset_days;
    }
}
