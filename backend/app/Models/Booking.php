<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class Booking extends Model
{
    use HasUlids;

    protected $fillable = [
        'creator_role_id',
        'ip_address',
        'workplace_id',
        'name',
        'contact',
        'usage_rules_acknowledged',
        'start_time',
        'end_time',
        'chargeable_duration_minutes',
        'booking_series_id',
        'series_detached',
    ];

    protected function casts(): array
    {
        return [
            // UTC, like everything in this table.
            'start_time' => 'immutable_datetime',
            'end_time' => 'immutable_datetime',
            'usage_rules_acknowledged' => 'boolean',
            'series_detached' => 'boolean',
            'chargeable_duration_minutes' => 'integer',
        ];
    }

    public function workplace(): BelongsTo
    {
        return $this->belongsTo(Workplace::class);
    }

    public function series(): BelongsTo
    {
        return $this->belongsTo(BookingSeries::class, 'booking_series_id');
    }

    public function isPast(): bool
    {
        return $this->end_time->isPast();
    }

    /** @var list<string>|null Memoised snapshot, see blockedWorkplaceIds(). */
    private ?array $blockedList = null;

    /**
     * The snapshot of blocked workplaces recorded on creation or change.
     * Deliberately not an Eloquent relationship: the list points at workplaces
     * that may have been deleted since.
     *
     * @return list<string>
     */
    public function blockedWorkplaceIds(): array
    {
        return $this->blockedList ??= DB::table('booking_blocked_workplaces')
            ->where('booking_id', $this->getKey())
            ->orderBy('workplace_id')
            ->pluck('workplace_id')
            ->all();
    }

    /**
     * Loads the snapshots of a whole collection in one query. The calendar view
     * fetches hundreds of bookings at once.
     *
     * @param  Collection<int, self>  $bookings
     */
    public static function primeBlockedWorkplaceIds(Collection $bookings): void
    {
        if ($bookings->isEmpty()) {
            return;
        }

        $grouped = DB::table('booking_blocked_workplaces')
            ->whereIn('booking_id', $bookings->modelKeys())
            ->orderBy('workplace_id')
            ->get()
            ->groupBy('booking_id')
            ->map(fn ($rows): array => $rows->pluck('workplace_id')->all())
            ->all();

        foreach ($bookings as $booking) {
            $booking->blockedList = $grouped[$booking->getKey()] ?? [];
        }
    }

    /** @param  list<string>  $workplaceIds */
    public function setBlockedWorkplaceIds(array $workplaceIds): void
    {
        $workplaceIds = array_values(array_unique(array_filter(
            $workplaceIds,
            fn (string $id): bool => $id !== $this->workplace_id,
        )));

        DB::table('booking_blocked_workplaces')->where('booking_id', $this->getKey())->delete();

        if ($workplaceIds !== []) {
            DB::table('booking_blocked_workplaces')->insert(array_map(
                fn (string $id): array => [
                    'booking_id' => $this->getKey(),
                    'workplace_id' => $id,
                ],
                $workplaceIds,
            ));
        }
    }
}
