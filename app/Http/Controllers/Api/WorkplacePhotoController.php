<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\WorkplaceResource;
use App\Models\Workplace;
use App\Support\WorkplacePhotos;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Das Foto hat einen eigenen Endpunkt, weil es als multipart/form-data kommt
 * und der Rest des Arbeitsplatzes als JSON. So bleibt PUT /workplaces/{id} ein
 * gewöhnlicher Formularabsender, der ohne Datei auskommt.
 */
class WorkplacePhotoController extends Controller
{
    public function __construct(private readonly WorkplacePhotos $photos) {}

    public function store(Request $request, Workplace $workplace): WorkplaceResource
    {
        $request->validate([
            // Die Grenze steht auch in der Spec. `mimetypes` prüft den
            // tatsächlichen Inhalt, nicht die Endung im Dateinamen.
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
