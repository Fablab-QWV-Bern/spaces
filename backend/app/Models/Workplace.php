<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class Workplace extends Model
{
    use HasUuids;

    protected $fillable = [
        'name',
        'description',
        'status',
        'location',
        'area_id',
        'wiki_url',
        'max_booking_duration_minutes',
        'blocks_workplace_ids',
        'blocks_workplaces_with_tag',
        'tags',
        'sort_order',
    ];

    protected $casts = [
        'blocks_workplace_ids' => 'array',
        'blocks_workplaces_with_tag' => 'array',
        'tags' => 'array',
    ];

    public function area()
    {
        return $this->belongsTo(Area::class);
    }

    public function bookings()
    {
        return $this->hasMany(Booking::class);
    }
}
