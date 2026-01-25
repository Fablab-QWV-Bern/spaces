<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class BookingSeries extends Model
{
    use HasUuids;

    protected $fillable = [
        'interval',
        'interval_count',
        'start_time',
        'end_time',
        'recurrence_end_date',
        'instantiated_until',
    ];

    protected $casts = [
        'start_time' => 'datetime',
        'end_time' => 'datetime',
        'recurrence_end_date' => 'date',
        'instantiated_until' => 'date',
    ];

    public function bookings()
    {
        return $this->hasMany(Booking::class);
    }
}
