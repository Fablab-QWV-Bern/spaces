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
        // Die Fremdschlüssel-Beschränkung würde das ohnehin verhindern; hier
        // scheitert es mit einer Begründung statt mit einem Datenbankfehler.
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
            // Beliebige CSS-Farbe; die Ansicht setzt sie unverändert als
            // Hintergrund. Die Länge deckelt die Spalte.
            'color' => ['required', 'string', 'max:30'],
            'maxBookingDurationMinutes' => ['required', 'integer', 'min:15', 'multiple_of:15'],
            // Null bedeutet "es gilt der globale Wert".
            'maxBookingEndOffsetDays' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'allowNightlyActivities' => ['required', 'boolean'],
            'sortOrder' => ['sometimes', 'integer'],
        ]);
    }

    /**
     * PUT ersetzt den ganzen Bereich: was der Aufruf weglässt, fällt auf seinen
     * Standardwert zurück und behält nicht den bisherigen.
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
