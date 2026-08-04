<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AreaResource;
use App\Models\Area;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class AreaController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        return AreaResource::collection(
            Area::orderBy('sort_order')->orderBy('name')->get(),
        );
    }

    public function show(Area $area): AreaResource
    {
        return new AreaResource($area);
    }

    public function store(Request $request): JsonResponse
    {
        $area = Area::create($this->attributes($this->validatePayload($request)));

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
            'sortOrder' => ['sometimes', 'integer'],
        ]);
    }

    /**
     * PUT replaces the whole area: whatever the call omits falls back to its
     * default rather than keeping the previous value.
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
            'sort_order' => $data['sortOrder'] ?? 0,
        ];
    }
}
