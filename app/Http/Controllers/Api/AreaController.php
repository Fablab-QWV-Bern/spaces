<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AreaResource;
use App\Models\Area;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

class AreaController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        return AreaResource::collection($this->ordered());
    }

    public function show(Area $area): AreaResource
    {
        return new AreaResource($area);
    }

    public function store(Request $request): JsonResponse
    {
        // A new area lands at the end; where it belongs is decided by dragging in
        // the list afterwards.
        $area = Area::create($this->attributes($this->validatePayload($request)) + [
            'sort_order' => (int) Area::max('sort_order') + 1,
        ]);

        return (new AreaResource($area))
            ->response()
            ->setStatusCode(201)
            ->header('Location', "/api/areas/{$area->id}");
    }

    public function update(Request $request, Area $area): AreaResource
    {
        $area->update($this->attributes($this->validatePayload($request)));

        return new AreaResource($area);
    }

    /**
     * The order of all areas at once. One call rather than one PUT per area:
     * the positions only make sense together, and a run that stops halfway
     * would leave an order nobody arranged.
     */
    public function reorder(Request $request): JsonResponse
    {
        $ids = $request->validate([
            'ids' => ['required', 'array'],
            'ids.*' => ['string', 'distinct', 'exists:areas,id'],
        ])['ids'];

        if (count($ids) !== Area::count()) {
            return response()->json([
                'message' => 'Die Reihenfolge muss alle Bereiche nennen.',
            ], 422);
        }

        DB::transaction(function () use ($ids): void {
            foreach ($ids as $position => $id) {
                Area::whereKey($id)->update(['sort_order' => $position]);
            }
        });

        return AreaResource::collection($this->ordered())->response();
    }

    public function destroy(Area $area): JsonResponse
    {
        // The foreign key constraint would prevent this anyway; here it fails
        // with a reason rather than with a database error.
        if ($area->workplaces()->exists()) {
            return response()->json([
                'message' => 'Dem Bereich sind noch Arbeitsplätze zugeordnet.',
            ], 422);
        }

        $area->delete();

        return response()->json(status: 204);
    }

    /** @return array<string, mixed> */
    private function validatePayload(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'min:1', 'max:100'],
            // Any CSS colour; the view applies it unchanged as a background. The
            // length is capped by the column.
            'color' => ['required', 'string', 'max:30'],
            'maxBookingDurationMinutes' => ['required', 'integer', 'min:15', 'multiple_of:15'],
            // Null means "the global value applies".
            'maxBookingEndOffsetDays' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'allowNightlyActivities' => ['required', 'boolean'],
        ]);
    }

    /** @return Collection<int, Area> */
    private function ordered(): Collection
    {
        return Area::orderBy('sort_order')->orderBy('name')->get();
    }

    /**
     * PUT replaces the whole area: whatever the call omits falls back to its
     * default rather than keeping the previous value. The order is exempt — it
     * has an endpoint of its own and no field in the form.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function attributes(array $data): array
    {
        return [
            'name' => $data['name'],
            'color' => $data['color'],
            'max_booking_duration_minutes' => $data['maxBookingDurationMinutes'],
            'max_booking_end_offset_days' => $data['maxBookingEndOffsetDays'] ?? null,
            'allow_nightly_activities' => $data['allowNightlyActivities'],
        ];
    }
}
