<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Workplace;
use App\Http\Resources\WorkplaceResource;

class WorkplaceController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        $includeDisabled = request()->boolean('includeDisabled');

        $query = Workplace::query()->orderBy('sort_order');

        if (!$includeDisabled) {
            $query->where('status', '!=', 'DISABLED');
        }

        return WorkplaceResource::collection($query->get());
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'area_id' => 'required|exists:areas,id',
            'status' => 'required|in:OK,DEFECT,DISABLED',
            'location' => 'required|string',
            // ... other fields
        ]);

        $workplace = Workplace::create($request->all());

        return new WorkplaceResource($workplace); // 201 is default for new resource usually, but let's stick to simple return
    }

    /**
     * Display the specified resource.
     */
    public function show(string $id)
    {
        return new WorkplaceResource(Workplace::findOrFail($id));
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id)
    {
        $workplace = Workplace::findOrFail($id);
        $workplace->update($request->all());
        return $workplace;
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(string $id)
    {
        Workplace::destroy($id);
        return response()->noContent();
    }
}
