<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class Area extends Model
{
    use HasUuids;

    protected $fillable = [
        'name',
        'color',
        'max_booking_duration_minutes',
        'max_booking_end_offset_days',
        'sort_order',
    ];

    public function workplaces()
    {
        return $this->hasMany(Workplace::class);
    }
}
