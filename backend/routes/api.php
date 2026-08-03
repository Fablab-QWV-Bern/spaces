<?php

use App\Http\Controllers\Api\AreaController;
use App\Http\Controllers\Api\BookingController;
use App\Http\Controllers\Api\BookingSeriesController;
use App\Http\Controllers\Api\CalendarFeedController;
use App\Http\Controllers\Api\ConfigController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\SessionController;
use App\Http\Controllers\Api\WorkplaceController;
use App\Http\Controllers\Api\WorkplacePhotoController;
use Illuminate\Support\Facades\Route;

// Die Berechtigungen entsprechen den `x-permissions` in spec/reservation-api.yml.
// Was dort keine Angabe hat, ist ohne Anmeldung erreichbar.

Route::get('session', [SessionController::class, 'show']);
Route::post('session', [SessionController::class, 'login']);
Route::delete('session', [SessionController::class, 'logout']);
Route::get('session/roles', [SessionController::class, 'roles']);

Route::get('config', [ConfigController::class, 'show']);

Route::middleware('permission:manageRoles')->group(function (): void {
    Route::put('config', [ConfigController::class, 'update']);

    // Auch das Lesen der Rollen braucht das Recht: dort stehen die
    // Berechtigungen aller Rollen, nicht nur die eigenen.
    Route::get('roles', [RoleController::class, 'index']);
    Route::get('roles/{role}', [RoleController::class, 'show']);
    Route::post('roles', [RoleController::class, 'store']);
    Route::put('roles/{role}', [RoleController::class, 'update']);
    Route::delete('roles/{role}', [RoleController::class, 'destroy']);
});

Route::get('areas', [AreaController::class, 'index']);
Route::get('areas/{area}', [AreaController::class, 'show']);

Route::middleware('permission:manageAreas')->group(function (): void {
    Route::post('areas', [AreaController::class, 'store']);
    Route::put('areas/{area}', [AreaController::class, 'update']);
    Route::delete('areas/{area}', [AreaController::class, 'destroy']);
});

Route::get('workplaces', [WorkplaceController::class, 'index']);
Route::get('workplaces/{workplace}', [WorkplaceController::class, 'show']);

Route::middleware('permission:manageWorkplaces')->group(function (): void {
    Route::post('workplaces', [WorkplaceController::class, 'store']);
    Route::put('workplaces/{workplace}', [WorkplaceController::class, 'update']);
    Route::delete('workplaces/{workplace}', [WorkplaceController::class, 'destroy']);

    Route::post('workplaces/{workplace}/photo', [WorkplacePhotoController::class, 'store']);
    Route::delete('workplaces/{workplace}/photo', [WorkplacePhotoController::class, 'destroy']);
});

Route::middleware('permission:viewBookings')->group(function (): void {
    Route::get('bookings', [BookingController::class, 'index']);
    Route::get('bookings/{booking}', [BookingController::class, 'show']);
});

// Ohne `permission`-Middleware: der Feed prüft `viewBookings` selbst, und zwar
// an der anonymen Rolle statt an der angemeldeten.
Route::get('calendar.ics', [CalendarFeedController::class, 'show']);

Route::middleware('permission:viewBookings')->group(function (): void {
    Route::get('booking-series', [BookingSeriesController::class, 'index']);
    Route::get('booking-series/{bookingSeries}', [BookingSeriesController::class, 'show']);
});

Route::middleware('permission:manageBookingSeries')->group(function (): void {
    Route::post('booking-series', [BookingSeriesController::class, 'store']);
    Route::put('booking-series/{bookingSeries}', [BookingSeriesController::class, 'update']);
    Route::delete('booking-series/{bookingSeries}', [BookingSeriesController::class, 'destroy']);
});

Route::middleware('permission:manageBookings')->group(function (): void {
    Route::post('bookings', [BookingController::class, 'store']);
    Route::post('bookings/validate', [BookingController::class, 'check']);
    Route::put('bookings/{booking}', [BookingController::class, 'update']);
    Route::delete('bookings/{booking}', [BookingController::class, 'destroy']);
});
