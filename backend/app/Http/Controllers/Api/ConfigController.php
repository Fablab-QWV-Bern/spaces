<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ConfigResource;
use App\Models\GlobalSetting;

class ConfigController extends Controller
{
    /** Für alle lesbar — das Frontend braucht die Öffnungszeiten zum Rendern. */
    public function show(): ConfigResource
    {
        return new ConfigResource(GlobalSetting::current());
    }
}
