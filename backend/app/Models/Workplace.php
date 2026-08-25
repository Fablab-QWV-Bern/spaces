<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class Workplace extends Model
{
    public const STATUS_OK = 'OK';

    public const STATUS_DEFECT = 'DEFECT';

    public const STATUS_DISABLED = 'DISABLED';

    /** The ID is assigned on creation ("holz-3"), not generated. */
    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'name',
        'description',
        'usage_rules',
        'status',
        'location',
        'area_id',
        'wiki_url',
        'max_booking_duration_minutes',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'max_booking_duration_minutes' => 'integer',
            'sort_order' => 'integer',
        ];
    }

    public function area(): BelongsTo
    {
        return $this->belongsTo(Area::class);
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }

    /** Workplaces that this one blocks by explicit ID. */
    public function blocksWorkplaces(): BelongsToMany
    {
        return $this->belongsToMany(
            self::class,
            'workplace_blocks_workplaces',
            'workplace_id',
            'blocked_workplace_id',
        );
    }

    public function isBookable(): bool
    {
        return $this->status === self::STATUS_OK;
    }

    /** This workplace's maximum booking duration, otherwise the area's. */
    public function effectiveMaxBookingDurationMinutes(Area $area): int
    {
        return $this->max_booking_duration_minutes ?? $area->max_booking_duration_minutes;
    }

    // The two tag lists are pure value lists. Eloquent has no fitting
    // relationship construct for that which manages without a model of its own —
    // hence the query builder directly here, with memoisation against N+1.

    /** @var list<string>|null */
    private ?array $tagList = null;

    /** @var list<string>|null */
    private ?array $blocksTagList = null;

    /** @return list<string> */
    public function tags(): array
    {
        return $this->tagList ??= $this->readValueList('workplace_tags');
    }

    /** @return list<string> */
    public function blocksWorkplacesWithTag(): array
    {
        return $this->blocksTagList ??= $this->readValueList('workplace_blocks_tags');
    }

    /**
     * Loads both tag lists for a whole collection in two queries rather than two
     * per workplace. The calendar view fetches all workplaces at once — without
     * this it would quickly be fifty queries.
     *
     * @param  Collection<int, self>  $workplaces
     */
    public static function primeTagLists(Collection $workplaces): void
    {
        if ($workplaces->isEmpty()) {
            return;
        }

        $ids = $workplaces->modelKeys();

        $grouped = fn (string $table): array => DB::table($table)
            ->whereIn('workplace_id', $ids)
            ->orderBy('tag')
            ->get()
            ->groupBy('workplace_id')
            ->map(fn ($rows): array => $rows->pluck('tag')->all())
            ->all();

        $tags = $grouped('workplace_tags');
        $blocksTags = $grouped('workplace_blocks_tags');

        foreach ($workplaces as $workplace) {
            $workplace->tagList = $tags[$workplace->getKey()] ?? [];
            $workplace->blocksTagList = $blocksTags[$workplace->getKey()] ?? [];
        }
    }

    /** @return list<string> */
    private function readValueList(string $table): array
    {
        return DB::table($table)
            ->where('workplace_id', $this->getKey())
            ->orderBy('tag')
            ->pluck('tag')
            ->all();
    }

    /** @param  list<string>  $tags */
    public function syncTags(array $tags): void
    {
        $this->syncValueList('workplace_tags', $tags);
    }

    /** @param  list<string>  $tags */
    public function syncBlocksWorkplacesWithTag(array $tags): void
    {
        $this->syncValueList('workplace_blocks_tags', $tags);
    }

    /** @param  list<string>  $tags */
    private function syncValueList(string $table, array $tags): void
    {
        // The memoisation is invalid after the write.
        $this->tagList = null;
        $this->blocksTagList = null;

        // Without a leading "#", without empty strings, without duplicates. The
        // deduplication has to be case-insensitive like the table's collation —
        // otherwise "Lärmig" and "lärmig" would both get through and run into the
        // primary key. The spelling mentioned first wins.
        $normalized = [];

        foreach ($tags as $tag) {
            $tag = ltrim(trim($tag), '#');

            if ($tag === '') {
                continue;
            }

            $normalized[mb_strtolower($tag)] ??= $tag;
        }

        $tags = array_values($normalized);

        DB::transaction(function () use ($table, $tags): void {
            DB::table($table)->where('workplace_id', $this->getKey())->delete();

            if ($tags !== []) {
                DB::table($table)->insert(array_map(
                    fn (string $tag): array => [
                        'workplace_id' => $this->getKey(),
                        'tag' => $tag,
                    ],
                    $tags,
                ));
            }
        });
    }
}
