<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookingResource;
use App\Models\Booking;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class BookingController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            // Pflicht, damit die Antwort begrenzt bleibt — der Kalender kennt
            // sein Zeitfenster immer.
            'from' => ['required', 'date'],
            'to' => ['required', 'date', 'after:from'],
            'workplaceId' => ['sometimes', 'string'],
            'areaId' => ['sometimes', 'string'],
        ]);

        $from = CarbonImmutable::parse($filters['from'])->utc();
        $to = CarbonImmutable::parse($filters['to'])->utc();

        $bookings = Booking::query()
            // Alles, was das Fenster überschneidet, halboffen verglichen.
            ->where('start_time', '<', $to)
            ->where('end_time', '>', $from)
            ->when($filters['workplaceId'] ?? null, fn ($query, $id) => $query->where('workplace_id', $id))
            ->when($filters['areaId'] ?? null, fn ($query, $areaId) => $query->whereIn(
                'workplace_id',
                fn ($sub) => $sub->select('id')->from('workplaces')->where('area_id', $areaId),
            ))
            ->orderBy('start_time')
            ->get();

        Booking::primeBlockedWorkplaceIds($bookings);

        return BookingResource::collection($bookings);
    }

    public function show(Booking $booking): BookingResource
    {
        return new BookingResource($booking);
    }
}
