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

    public const INTERVAL_DAILY = 'DAILY';

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
            // first_instance_start und first_instance_end bleiben bewusst
            // ungecastet: sie sind lokale Wanduhrzeit, kein Zeitpunkt. Ein Cast
            // auf datetime würde ihnen die App-Zeitzone (UTC) anheften und die
            // Serie über die Zeitumstellung um eine Stunde verschieben.
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

    /** Der Start der ersten Instanz als echter Zeitpunkt in der Anzeige-Zeitzone. */
    public function firstInstanceStartIn(string $timezone): CarbonImmutable
    {
        return CarbonImmutable::parse($this->first_instance_start, $timezone);
    }

    public function firstInstanceEndIn(string $timezone): CarbonImmutable
    {
        return CarbonImmutable::parse($this->first_instance_end, $timezone);
    }
}
