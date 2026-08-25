<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\WorkplaceResource;
use App\Models\Workplace;
use App\Support\CurrentRole;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class WorkplaceController extends Controller
{
    public function __construct(private readonly CurrentRole $currentRole) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            // Not `boolean`: that does not let "true" and "false" through, and
            // that is exactly how OpenAPI writes a boolean into a query string.
            'includeDisabled' => ['sometimes', 'in:true,false,1,0'],
            'areaId' => ['sometimes', 'string'],
        ]);

        // Disabled workplaces are only visible to whoever may manage them. For
        // everyone else the parameter is ignored rather than rejected.
        $includeDisabled = $request->boolean('includeDisabled')
            && $this->currentRole->can('manageWorkplaces');

        $workplaces = $this->orderedQuery()
            ->when(! $includeDisabled, fn ($query) => $query->where('status', '!=', Workplace::STATUS_DISABLED))
            ->when($filters['areaId'] ?? null, fn ($query, $areaId) => $query->where('workplaces.area_id', $areaId))
            ->get();

        Workplace::primeTagLists($workplaces);

        return WorkplaceResource::collection($workplaces);
    }

    public function show(Workplace $workplace): WorkplaceResource
    {
        abort_if(
            $workplace->status === Workplace::STATUS_DISABLED
                && ! $this->currentRole->can('manageWorkplaces'),
            404,
        );

        return new WorkplaceResource($workplace->load('blocksWorkplaces'));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatePayload($request, creating: true);

        // The ID comes from the caller and is therefore a conflict with someone
        // else's state, not an error in the input itself — 409 rather than 422.
        if (Workplace::whereKey($data['id'])->exists()) {
            return response()->json([
                'message' => 'Ein Arbeitsplatz mit dieser Kennung besteht bereits.',
            ], 409);
        }

        $workplace = DB::transaction(function () use ($data): Workplace {
            // A new workplace lands at the end of its area; where it belongs is
            // decided by dragging in the list afterwards.
            $workplace = Workplace::create($this->attributes($data) + [
                'id' => $data['id'],
                'sort_order' => $this->nextSortOrder($data['areaId']),
            ]);
            $this->syncLists($workplace, $data);

            return $workplace;
        });

        return (new WorkplaceResource($workplace->load('blocksWorkplaces')))
            ->response()
            ->setStatusCode(201)
            ->header('Location', "/api/workplaces/{$workplace->id}");
    }

    public function update(Request $request, Workplace $workplace): WorkplaceResource
    {
        $data = $this->validatePayload($request, creating: false);

        $attributes = $this->attributes($data);

        // Moved into another area, the old position would say something about
        // neighbours it no longer has — so it goes to the end there.
        if ($data['areaId'] !== $workplace->area_id) {
            $attributes['sort_order'] = $this->nextSortOrder($data['areaId']);
        }

        DB::transaction(function () use ($workplace, $attributes, $data): void {
            $workplace->update($attributes);
            $this->syncLists($workplace, $data);
        });

        return new WorkplaceResource($workplace->load('blocksWorkplaces'));
    }

    /**
     * The order of all workplaces at once, counted anew per area: the list
     * arrives as the admin view shows it — grouped by area, one after another —
     * and each workplace gets its position among those of its own area. Which
     * area it belongs to is not decided here; dragging never leaves the group.
     */
    public function reorder(Request $request): JsonResponse
    {
        $ids = $request->validate([
            'ids' => ['required', 'array'],
            'ids.*' => ['string', 'distinct', 'exists:workplaces,id'],
        ])['ids'];

        if (count($ids) !== Workplace::count()) {
            return response()->json([
                'message' => 'Die Reihenfolge muss alle Arbeitsplätze nennen.',
            ], 422);
        }

        $workplaces = Workplace::whereKey($ids)->get()->keyBy('id');

        DB::transaction(function () use ($ids, $workplaces): void {
            $next = [];

            foreach ($ids as $id) {
                $areaId = $workplaces[$id]->area_id;
                $position = $next[$areaId] ?? 0;
                $next[$areaId] = $position + 1;

                Workplace::whereKey($id)->update(['sort_order' => $position]);
            }
        });

        $ordered = $this->orderedQuery()->get();

        Workplace::primeTagLists($ordered);

        return WorkplaceResource::collection($ordered)->response();
    }

    public function destroy(Workplace $workplace): JsonResponse
    {
        // Past bookings may stay and lose their workplace; a future one, by
        // contrast, would be a promise nobody is going to keep.
        if ($workplace->bookings()->where('end_time', '>', now())->exists()) {
            return response()->json([
                'message' => 'Auf diesem Arbeitsplatz liegen noch künftige Buchungen.',
            ], 422);
        }

        // It disappears from the others' blocking lists through the foreign keys
        // of the workplace_blocks_workplaces table.
        $workplace->delete();

        return response()->json(status: 204);
    }

    /**
     * The ordering follows the calendar view's grouping: area first, then
     * workplace.
     *
     * @return Builder<Workplace>
     */
    private function orderedQuery(): Builder
    {
        return Workplace::query()
            ->with(['blocksWorkplaces', 'area'])
            ->join('areas', 'areas.id', '=', 'workplaces.area_id')
            ->orderBy('areas.sort_order')
            ->orderBy('workplaces.sort_order')
            ->orderBy('workplaces.name')
            ->select('workplaces.*');
    }

    /** @return array<string, mixed> */
    private function validatePayload(Request $request, bool $creating): array
    {
        return $request->validate([
            // Assigned by the caller, usable in URLs and SVG. When changing, it
            // is in the path and gets ignored.
            'id' => $creating
                ? ['required', 'string', 'max:64', 'regex:/^[a-z0-9][a-z0-9-]*$/']
                : ['sometimes'],
            'name' => ['required', 'string', 'min:1', 'max:150'],
            'description' => ['sometimes', 'nullable', 'string'],
            'usageRules' => ['sometimes', 'nullable', 'string'],
            'status' => ['required', Rule::in([
                Workplace::STATUS_OK,
                Workplace::STATUS_DEFECT,
                Workplace::STATUS_DISABLED,
            ])],
            'location' => ['sometimes', 'nullable', 'string', 'max:150'],
            'areaId' => ['required', 'string', 'exists:areas,id'],
            'wikiUrl' => ['sometimes', 'nullable', 'url', 'max:500'],
            'maxBookingDurationMinutes' => ['sometimes', 'nullable', 'integer', 'min:15', 'multiple_of:15'],
            'blocksWorkplaceIds' => ['sometimes', 'array'],
            'blocksWorkplaceIds.*' => ['string', 'exists:workplaces,id'],
            'blocksWorkplacesWithTag' => ['sometimes', 'array'],
            'blocksWorkplacesWithTag.*' => ['string', 'max:64'],
            'tags' => ['sometimes', 'array'],
            'tags.*' => ['string', 'max:64'],
        ]);
    }

    /**
     * PUT replaces the whole workplace: whatever the call omits falls back to its
     * default rather than keeping the previous value. The order is exempt from
     * this — it has an endpoint of its own.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function attributes(array $data): array
    {
        // An empty text field in the form means "not set" — otherwise the column
        // would hold an empty string that no view can tell apart from "set".
        $text = fn (?string $value): ?string => ($value === null || trim($value) === '')
            ? null
            : $value;

        return [
            'name' => $data['name'],
            'description' => $text($data['description'] ?? null),
            'usage_rules' => $text($data['usageRules'] ?? null),
            'status' => $data['status'],
            'location' => $text($data['location'] ?? null),
            'area_id' => $data['areaId'],
            'wiki_url' => $text($data['wikiUrl'] ?? null),
            'max_booking_duration_minutes' => $data['maxBookingDurationMinutes'] ?? null,
        ];
    }

    /** The position after the last one of the area. */
    private function nextSortOrder(string $areaId): int
    {
        return (int) Workplace::where('area_id', $areaId)->max('sort_order') + 1;
    }

    /** @param  array<string, mixed>  $data */
    private function syncLists(Workplace $workplace, array $data): void
    {
        // A workplace does not block itself — that would be silently ineffective
        // and only causes confusion in the admin view.
        $blocked = array_values(array_diff(
            $data['blocksWorkplaceIds'] ?? [],
            [$workplace->getKey()],
        ));

        $workplace->blocksWorkplaces()->sync($blocked);
        $workplace->syncTags($data['tags'] ?? []);
        $workplace->syncBlocksWorkplacesWithTag($data['blocksWorkplacesWithTag'] ?? []);
    }
}
