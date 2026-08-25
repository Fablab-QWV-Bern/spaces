<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\FloorPlan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The floor plan the overview map is drawn from.
 *
 * There is no resource class and no model behind this: the plan is a file, and
 * what the API reports about it — where it lies, whether it is the shipped one,
 * when it was stored — is read off the disk at the moment of asking.
 */
class FloorPlanController extends Controller
{
    /** Readable by everyone: the map is part of the calendar. */
    public function show(): JsonResponse
    {
        return response()->json(FloorPlan::state());
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            // Deliberately not `mimes:svg`: that asks the finfo extension what
            // the file is, and an SVG comes back as `text/plain`, `text/xml` or
            // `image/svg+xml` depending on what stands in the first line. What
            // the file actually is, is decided below by parsing it.
            'file' => ['required', 'file', 'max:'.FloorPlan::MAX_KILOBYTES],
        ]);

        $rejected = FloorPlan::store($request->file('file'));

        if ($rejected !== null) {
            // As a validation error rather than a 400: it is the field that is
            // wrong, and the form shows it where the file was chosen.
            return response()->json([
                'message' => $rejected,
                'errors' => ['file' => [$rejected]],
            ], 422);
        }

        return response()->json(FloorPlan::state());
    }

    public function destroy(): JsonResponse
    {
        FloorPlan::forget();

        return response()->json(FloorPlan::state());
    }
}
