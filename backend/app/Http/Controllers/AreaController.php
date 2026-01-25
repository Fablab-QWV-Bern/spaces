<?php

namespace App\Http\Controllers;

use App\Models\Area;
use App\Http\Resources\AreaResource;
use Illuminate\Http\Request;

class AreaController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        return AreaResource::collection(Area::orderBy('sort_order')->get());
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'color' => 'required|string',
            'max_booking_duration_minutes' => 'required|integer',
            'max_booking_end_offset_days' => 'required|integer',
        ]);

        $area = Area::create($validated);
        return new AreaResource($area);
    }

    /**
     * Display the specified resource.
     */
    public function show(string $id)
    {
        return new AreaResource(Area::findOrFail($id));
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id)
    {
        $area = Area::findOrFail($id);
        $area->update($request->all());
        return new AreaResource($area);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(string $id)
    {
        Area::destroy($id);
        return response()->noContent();
    }
}
