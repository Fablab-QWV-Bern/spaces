<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\WorkplaceResource;
use App\Models\Workplace;
use App\Support\CurrentRole;
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
            'includeDisabled' => ['sometimes', 'boolean'],
            'areaId' => ['sometimes', 'string'],
        ]);

        // Deaktivierte Arbeitsplätze sieht nur, wer sie verwalten darf. Für alle
        // anderen wird der Parameter ignoriert statt abgewiesen.
        $includeDisabled = ($filters['includeDisabled'] ?? false)
            && $this->currentRole->can('manageWorkplaces');

        $query = Workplace::query()
            ->with(['blocksWorkplaces', 'area'])
            ->when(! $includeDisabled, fn ($query) => $query->where('status', '!=', Workplace::STATUS_DISABLED))
            ->when($filters['areaId'] ?? null, fn ($query, $areaId) => $query->where('area_id', $areaId));

        // Sortierung folgt der Gruppierung der Kalenderansicht: erst der Bereich,
        // dann der Arbeitsplatz.
        $workplaces = $query
            ->join('areas', 'areas.id', '=', 'workplaces.area_id')
            ->orderBy('areas.sort_order')
            ->orderBy('workplaces.sort_order')
            ->orderBy('workplaces.name')
            ->select('workplaces.*')
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

        // Die ID kommt vom Aufrufer und ist damit ein Konflikt mit fremdem
        // Zustand, kein Fehler in der Eingabe selbst — 409 statt 422.
        if (Workplace::whereKey($data['id'])->exists()) {
            return response()->json([
                'message' => 'Ein Arbeitsplatz mit dieser Kennung besteht bereits.',
            ], 409);
        }

        $workplace = DB::transaction(function () use ($data): Workplace {
            $workplace = Workplace::create($this->attributes($data) + ['id' => $data['id']]);
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

        DB::transaction(function () use ($workplace, $data): void {
            $workplace->update($this->attributes($data));
            $this->syncLists($workplace, $data);
        });

        return new WorkplaceResource($workplace->load('blocksWorkplaces'));
    }

    public function destroy(Workplace $workplace): JsonResponse
    {
        // Vergangene Buchungen dürfen bleiben und ihren Arbeitsplatz verlieren;
        // eine künftige wäre dagegen ein Versprechen, das niemand mehr einlöst.
        if ($workplace->bookings()->where('end_time', '>', now())->exists()) {
            return response()->json([
                'message' => 'Auf diesem Arbeitsplatz liegen noch künftige Buchungen.',
            ], 422);
        }

        // Aus den Blockierlisten der anderen verschwindet er über die
        // Fremdschlüssel der Tabelle workplace_blocks_workplaces.
        $workplace->delete();

        return response()->json(status: 204);
    }

    /** @return array<string, mixed> */
    private function validatePayload(Request $request, bool $creating): array
    {
        return $request->validate([
            // Vom Aufrufer vergeben, URL- und SVG-tauglich. Beim Ändern steht sie
            // im Pfad und wird ignoriert.
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
            'sortOrder' => ['sometimes', 'integer'],
        ]);
    }

    /**
     * PUT ersetzt den ganzen Arbeitsplatz: was der Aufruf weglässt, fällt auf
     * seinen Standardwert zurück und behält nicht den bisherigen. Das Foto ist
     * davon ausgenommen — es hat einen eigenen Endpunkt.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function attributes(array $data): array
    {
        return [
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'usage_rules' => $data['usageRules'] ?? null,
            'status' => $data['status'],
            'location' => $data['location'] ?? null,
            'area_id' => $data['areaId'],
            'wiki_url' => $data['wikiUrl'] ?? null,
            'max_booking_duration_minutes' => $data['maxBookingDurationMinutes'] ?? null,
            'sort_order' => $data['sortOrder'] ?? 0,
        ];
    }

    /** @param  array<string, mixed>  $data */
    private function syncLists(Workplace $workplace, array $data): void
    {
        // Ein Arbeitsplatz blockiert sich nicht selbst — das wäre still
        // wirkungslos und stiftet in der Verwaltungsansicht nur Verwirrung.
        $blocked = array_values(array_diff(
            $data['blocksWorkplaceIds'] ?? [],
            [$workplace->getKey()],
        ));

        $workplace->blocksWorkplaces()->sync($blocked);
        $workplace->syncTags($data['tags'] ?? []);
        $workplace->syncBlocksWorkplacesWithTag($data['blocksWorkplacesWithTag'] ?? []);
    }
}
