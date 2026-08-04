<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\WorkplaceResource;
use App\Models\Workplace;
use App\Support\WorkplacePhotos;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The photo has an endpoint of its own because it arrives as multipart/form-data
 * while the rest of the workplace is JSON. That way PUT /workplaces/{id} stays an
 * ordinary form submission that manages without a file.
 */
class WorkplacePhotoController extends Controller
{
    public function __construct(private readonly WorkplacePhotos $photos) {}

    public function store(Request $request, Workplace $workplace): WorkplaceResource
    {
        $request->validate([
            // The limit is in the spec too. `mimetypes` checks the actual
            // content, not the extension in the file name.
            'file' => [
                'required',
                'file',
                'mimetypes:image/jpeg,image/png,image/webp',
                'max:5120',
            ],
        ]);

        $this->photos->store($workplace, $request->file('file'));

        return new WorkplaceResource($workplace->load('blocksWorkplaces'));
    }

    public function destroy(Workplace $workplace): JsonResponse
    {
        $this->photos->remove($workplace);

        return response()->json(status: 204);
    }
}
