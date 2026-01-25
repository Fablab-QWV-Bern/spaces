<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class Booking extends Model
{
    use HasUuids;

    protected $fillable = [
        'creator_role_id',
        'ip_address',
        'workplace_id',
        'blocks_workplace_ids',
        'name',
        'contact',
        'start_time',
        'end_time',
        'booking_series_id',
    ];

    protected $casts = [
        'blocks_workplace_ids' => 'array',
        'start_time' => 'datetime',
        'end_time' => 'datetime',
    ];

    public function workplace()
    {
        return $this->belongsTo(Workplace::class);
    }

    public function creatorRole()
    {
        return $this->belongsTo(Role::class, 'creator_role_id');
    }

    public function bookingSeries()
    {
        return $this->belongsTo(BookingSeries::class);
    }
}
