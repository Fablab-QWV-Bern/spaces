<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AreaResource;
use App\Models\Area;
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
}
