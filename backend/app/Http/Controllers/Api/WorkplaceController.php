<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\WorkplaceResource;
use App\Models\Workplace;
use App\Support\CurrentRole;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

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
}
