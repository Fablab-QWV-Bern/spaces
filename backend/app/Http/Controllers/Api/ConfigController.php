<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ConfigResource;
use App\Models\GlobalSetting;
use Illuminate\Http\Request;

class ConfigController extends Controller
{
    /** Opening hours sit on the time grid, which is fixed at 15 minutes. */
    private const TIME_OF_DAY = '/^([01][0-9]|2[0-3]):(00|15|30|45)$/';

    /** Readable by everyone — the frontend needs the opening hours for rendering. */
    public function show(): ConfigResource
    {
        return new ConfigResource(GlobalSetting::current());
    }

    public function update(Request $request): ConfigResource
    {
        $data = $request->validate([
            'opensAt' => ['required', 'string', 'regex:'.self::TIME_OF_DAY],
            'closesAt' => [
                'required', 'string', 'regex:'.self::TIME_OF_DAY,
                // `gt:opensAt` would not work: for strings Laravel compares the
                // length. "HH:MM", by contrast, can be compared directly.
                function (string $attribute, mixed $value, callable $fail) use ($request): void {
                    if ($value <= $request->string('opensAt')->value()) {
                        $fail('Der Schluss muss nach der Öffnung liegen.');
                    }
                },
            ],
            // Caps the column (unsignedSmallInteger), not the domain rule.
            'maxBookingEndOffsetDays' => ['required', 'integer', 'min:0', 'max:65535'],
            'timezone' => ['required', 'string', 'max:64', 'timezone'],
        ]);

        $settings = GlobalSetting::current();

        $settings->update([
            'opens_at' => $data['opensAt'],
            'closes_at' => $data['closesAt'],
            'max_booking_end_offset_days' => $data['maxBookingEndOffsetDays'],
            'timezone' => $data['timezone'],
        ]);

        return new ConfigResource($settings);
    }
}
