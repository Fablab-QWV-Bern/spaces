<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Booking;
use App\Http\Resources\BookingResource;

class BookingController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $query = Booking::query();

        if ($request->has('workplaceId')) {
            $query->where('workplace_id', $request->workplaceId);
        }

        // Correct overlap logic: start < to AND end > from
        if ($request->has('from')) {
            $query->where('end_time', '>', $request->from);
        }

        if ($request->has('to')) {
            $query->where('start_time', '<', $request->to);
        }

        return BookingResource::collection($query->get());
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'workplace_id' => 'required|exists:workplaces,id',
            'start_time' => 'required|date',
            'end_time' => 'required|date|after:start_time',
            'name' => 'required|string',
            'contact' => 'required|string',
        ]);

        // TODO: Conflict checks logic

        $booking = Booking::create($request->all());

        return new BookingResource($booking);
    }

    /**
     * Display the specified resource.
     */
    public function show(string $id)
    {
        return new BookingResource(Booking::findOrFail($id));
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id)
    {
        $booking = Booking::findOrFail($id);
        $booking->update($request->all());
        return new BookingResource($booking);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(string $id)
    {
        Booking::destroy($id);
        return response()->noContent();
    }
}
