<?php
use App\Http\Controllers\AreaController;
use App\Http\Controllers\WorkplaceController;
use App\Http\Controllers\BookingController;
use App\Http\Controllers\BookingSeriesController;
use App\Http\Controllers\RoleController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');
Route::apiResource('areas', AreaController::class);
Route::apiResource('workplaces', WorkplaceController::class);
Route::apiResource('bookings', BookingController::class);
Route::apiResource('booking-series', BookingSeriesController::class);
Route::apiResource('roles', RoleController::class);
Route::get('/test', function () {
    return 'OK';
});
