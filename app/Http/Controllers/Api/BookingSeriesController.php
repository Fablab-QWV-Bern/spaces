<?php

namespace App\Http\Controllers\Api;

use App\Domain\Booking\BookingRuleException;
use App\Domain\Booking\SeriesWriter;
use App\Domain\Booking\SkippedInstance;
use App\Domain\Booking\ViolationCode;
use App\Http\Controllers\Controller;
use App\Http\Resources\BookingSeriesResource;
use App\Models\BookingSeries;
use App\Support\CurrentRole;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class BookingSeriesController extends Controller
{
    public function __construct(
        private readonly CurrentRole $currentRole,
        private readonly SeriesWriter $writer,
    ) {}

    public function index(): AnonymousResourceCollection
    {
        // Without a time window: series are few, and the admin view needs all.
        return BookingSeriesResource::collection(
            BookingSeries::query()->orderBy('first_instance_start')->get(),
        );
    }

    public function show(BookingSeries $bookingSeries): BookingSeriesResource
    {
        return new BookingSeriesResource($bookingSeries);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatePayload($request);

        try {
            [$series, $skipped] = $this->writer->create($data, $this->currentRole->get());
        } catch (BookingRuleException $exception) {
            return $this->ruleFailure($exception);
        }

        return response()
            ->json($this->result($series, $skipped, $request), 201)
            ->header('Location', "/api/booking-series/{$series->id}");
    }

    public function update(Request $request, BookingSeries $bookingSeries): JsonResponse
    {
        $data = $this->validatePayload($request);

        try {
            [$series, $skipped] = $this->writer->update($bookingSeries, $data, $this->currentRole->get());
        } catch (BookingRuleException $exception) {
            return $this->ruleFailure($exception);
        }

        return response()->json($this->result($series, $skipped, $request));
    }

    public function destroy(BookingSeries $bookingSeries): JsonResponse
    {
        $this->writer->delete($bookingSeries);

        return response()->json(status: 204);
    }

    /** @return array<string, mixed> */
    private function validatePayload(Request $request): array
    {
        return $request->validate([
            'workplaceId' => ['required', 'string'],
            'name' => ['required', 'string', 'max:150'],
            'contact' => ['required', 'string', 'max:150'],
            'interval' => ['required', Rule::in([
                BookingSeries::INTERVAL_WEEKLY,
                BookingSeries::INTERVAL_MONTHLY,
            ])],
            // The upper bound is the column's; without it an absurd number would
            // be a database error rather than an input error.
            'intervalCount' => ['required', 'integer', 'min:1', 'max:65535'],
            // Wall-clock time without a timezone, exactly in the shape of the
            // spec. `date` would be too generous: it would also accept a "Z",
            // which has no business here.
            'firstInstanceStart' => ['required', 'string', 'regex:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/'],
            'firstInstanceEnd' => ['required', 'string', 'regex:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/'],
            'endDate' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
        ]);
    }

    /**
     * @param  list<SkippedInstance>  $skipped
     * @return array<string, mixed>
     */
    private function result(BookingSeries $series, array $skipped, Request $request): array
    {
        return [
            'series' => (new BookingSeriesResource($series))->toArray($request),
            'skippedInstances' => array_map(fn (SkippedInstance $instance): array => [
                'startTime' => $instance->startTime->toIso8601ZuluString(),
                'endTime' => $instance->endTime->toIso8601ZuluString(),
                'conflictingBookingIds' => $instance->conflictingBookingIds,
            ], $skipped),
        ];
    }

    /**
     * Unlike for a single booking there is no 409 here: a collision makes the
     * instance drop out rather than the series fail. Whatever remains is always an
     * error in the input.
     */
    private function ruleFailure(BookingRuleException $exception): JsonResponse
    {
        $errors = [];

        foreach ($exception->result->violations as $code) {
            $errors[self::FIELDS[$code->value]][] = self::MESSAGES[$code->value];
        }

        return response()->json([
            'message' => 'Die Serie verstösst gegen die Buchungsregeln.',
            'errors' => $errors,
        ], 422);
    }

    private const MESSAGES = [
        ViolationCode::OutsideOpeningHours->value => 'Beginn und Ende müssen innerhalb der Öffnungszeiten liegen.',
        ViolationCode::ExceedsMaxDuration->value => 'Die Buchung ist länger als für diesen Arbeitsplatz erlaubt.',
        ViolationCode::NotOnGrid->value => 'Beginn und Ende müssen auf einer Viertelstunde liegen, das Ende nach dem Beginn.',
        ViolationCode::SpansNightNotAllowed->value => 'In diesem Bereich sind keine Buchungen über Nacht möglich.',
        ViolationCode::WorkplaceNotBookable->value => 'Dieser Arbeitsplatz ist nicht buchbar.',
    ];

    private const FIELDS = [
        ViolationCode::OutsideOpeningHours->value => 'firstInstanceStart',
        ViolationCode::ExceedsMaxDuration->value => 'firstInstanceEnd',
        ViolationCode::NotOnGrid->value => 'firstInstanceStart',
        ViolationCode::SpansNightNotAllowed->value => 'firstInstanceEnd',
        ViolationCode::WorkplaceNotBookable->value => 'workplaceId',
    ];
}
