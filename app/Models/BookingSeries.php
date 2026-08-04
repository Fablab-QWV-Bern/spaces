<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BookingSeries extends Model
{
    use HasUlids;

    // There is deliberately no daily interval: for the running of the workshop
    // that is not a series but a permanent occupation. Fortnightly is WEEKLY with
    // interval_count = 2.
    public const INTERVAL_WEEKLY = 'WEEKLY';

    public const INTERVAL_MONTHLY = 'MONTHLY';

    protected $table = 'booking_series';

    protected $fillable = [
        'workplace_id',
        'name',
        'contact',
        'interval',
        'interval_count',
        'first_instance_start',
        'first_instance_end',
        'end_date',
        'instantiated_until',
    ];

    protected function casts(): array
    {
        return [
            // first_instance_start and first_instance_end deliberately stay
            // uncast: they are local wall-clock time, not points in time. A cast
            // to datetime would pin the app timezone (UTC) onto them and shift the
            // series by an hour across a DST change.
            'interval_count' => 'integer',
            'end_date' => 'immutable_date',
            'instantiated_until' => 'immutable_date',
        ];
    }

    public function workplace(): BelongsTo
    {
        return $this->belongsTo(Workplace::class);
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class, 'booking_series_id');
    }

    /** The first instance's start as a real point in time in the display timezone. */
    public function firstInstanceStartIn(string $timezone): CarbonImmutable
    {
        return CarbonImmutable::parse($this->first_instance_start, $timezone);
    }

    public function firstInstanceEndIn(string $timezone): CarbonImmutable
    {
        return CarbonImmutable::parse($this->first_instance_end, $timezone);
    }
}
