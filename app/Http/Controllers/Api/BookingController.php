<?php

namespace App\Http\Controllers\Api;

use App\Domain\Booking\BookingCandidate;
use App\Domain\Booking\BookingRuleException;
use App\Domain\Booking\BookingValidator;
use App\Domain\Booking\BookingWriter;
use App\Domain\Booking\ValidationResult;
use App\Domain\Booking\ViolationCode;
use App\Http\Controllers\Controller;
use App\Http\Resources\BookingResource;
use App\Models\Booking;
use App\Support\CurrentRole;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class BookingController extends Controller
{
    public function __construct(
        private readonly CurrentRole $currentRole,
        private readonly BookingWriter $writer,
        private readonly BookingValidator $validator,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            // Required so that the response stays bounded — the calendar always
            // knows its time window.
            'from' => ['required', 'date'],
            'to' => ['required', 'date', 'after:from'],
            'workplaceId' => ['sometimes', 'string'],
            'areaId' => ['sometimes', 'string'],
        ]);

        $from = CarbonImmutable::parse($filters['from'])->utc();
        $to = CarbonImmutable::parse($filters['to'])->utc();

        $bookings = Booking::query()
            // Everything overlapping the window, compared half-open.
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

    public function store(Request $request): BookingResource|JsonResponse
    {
        $data = $this->validatePayload($request);

        try {
            $booking = $this->writer->create(
                $this->candidate($data),
                $this->currentRole->get(),
                ['name' => $data['name'], 'contact' => $data['contact']],
                $request->ip(),
            );
        } catch (BookingRuleException $exception) {
            return $this->ruleFailure($exception);
        }

        return (new BookingResource($booking))
            ->response()
            ->setStatusCode(201)
            ->header('Location', "/api/bookings/{$booking->id}");
    }

    public function update(Request $request, Booking $booking): BookingResource|JsonResponse
    {
        if ($booking->isPast()) {
            return $this->pastBooking();
        }

        $data = $this->validatePayload($request);

        // The field is optional in the contract. When changing, however,
        // "omitted" does not mean "revoked" — otherwise a call without the field
        // would withdraw the acknowledgement without anyone intending it. Same for
        // the blocking switch.
        $data['usageRulesAcknowledged'] ??= $booking->usage_rules_acknowledged;
        $data['skipAutomaticBlocking'] ??= $booking->skip_automatic_blocking;

        try {
            $updated = $this->writer->update(
                $booking,
                $this->candidate($data, excludeBookingId: $booking->id),
                $this->currentRole->get(),
                ['name' => $data['name'], 'contact' => $data['contact']],
            );
        } catch (BookingRuleException $exception) {
            return $this->ruleFailure($exception);
        }

        return new BookingResource($updated);
    }

    public function destroy(Booking $booking): JsonResponse
    {
        if ($booking->isPast()) {
            return $this->pastBooking();
        }

        $this->writer->delete($booking);

        return response()->json(status: 204);
    }

    /** Pre-flight check for the real-time display in the form. Writes nothing. */
    public function check(Request $request): JsonResponse
    {
        $data = $this->validatePayload($request);

        $result = $this->validator->validate(
            $this->candidate($data, excludeBookingId: $request->query('excludeBookingId')),
            $this->currentRole->get(),
        );

        return response()->json([
            'valid' => $result->isValid(),
            'conflictingBookingIds' => $result->conflictingBookingIds,
            'violations' => array_map(fn (ViolationCode $code): array => [
                'code' => $code->value,
                'message' => $this->message($code, $result),
            ], $result->violations),
            'chargeableDurationMinutes' => $result->chargeableDurationMinutes,
        ]);
    }

    /** @return array<string, mixed> */
    private function validatePayload(Request $request): array
    {
        return $request->validate([
            'workplaceId' => ['required', 'string'],
            'startTime' => ['required', 'date'],
            'endTime' => ['required', 'date'],
            'name' => ['required', 'string', 'max:150'],
            'contact' => ['required', 'string', 'max:150'],
            'usageRulesAcknowledged' => ['sometimes', 'boolean'],
            'skipAutomaticBlocking' => ['sometimes', 'boolean'],
        ]);
    }

    /** @param  array<string, mixed>  $data */
    private function candidate(array $data, ?string $excludeBookingId = null): BookingCandidate
    {
        return new BookingCandidate(
            $data['workplaceId'],
            CarbonImmutable::parse($data['startTime'])->utc(),
            CarbonImmutable::parse($data['endTime'])->utc(),
            (bool) ($data['usageRulesAcknowledged'] ?? false),
            (bool) ($data['skipAutomaticBlocking'] ?? false),
            $excludeBookingId,
        );
    }

    /**
     * A collision is a conflict with someone else's state (409); everything else
     * is an error in the input itself (422).
     */
    private function ruleFailure(BookingRuleException $exception): JsonResponse
    {
        $result = $exception->result;

        if ($exception->isCollision()) {
            return response()->json([
                'message' => 'Die Buchung überschneidet sich mit einer bestehenden Buchung.',
                'conflictingBookingIds' => $result->conflictingBookingIds,
            ], 409);
        }

        return response()->json([
            'message' => 'Die Buchung verstösst gegen die Buchungsregeln.',
            'errors' => $this->fieldErrors($result),
        ], 422);
    }

    /** @return array<string, list<string>> */
    private function fieldErrors(ValidationResult $result): array
    {
        $errors = [];

        foreach ($result->violations as $code) {
            $field = self::FIELDS[$code->value];
            $errors[$field][] = $this->message($code, $result);
        }

        return $errors;
    }

    /**
     * The text for a violation.
     *
     * The booking horizon is the only rule whose limit comes from the
     * configuration rather than from the input — which is why it appears in the
     * message. Without it, how far "this far in advance" reaches would stay open
     * and you would have to feel your way along the date list.
     */
    private function message(ViolationCode $code, ValidationResult $result): string
    {
        $text = self::MESSAGES[$code->value];

        if ($code === ViolationCode::ExceedsMaxEndOffset && $result->latestBookableDay !== null) {
            $text .= ' Buchbar ist bis zum '
                .$result->latestBookableDay->locale('de')->translatedFormat('j. F Y').'.';
        }

        return $text;
    }

    private function pastBooking(): JsonResponse
    {
        return response()->json([
            'message' => 'Vergangene Buchungen lassen sich nicht mehr ändern oder löschen.',
        ], 422);
    }

    private const MESSAGES = [
        'COLLISION' => 'Der Arbeitsplatz ist in diesem Zeitraum bereits belegt.',
        'OUTSIDE_OPENING_HOURS' => 'Beginn und Ende müssen innerhalb der Öffnungszeiten liegen.',
        'EXCEEDS_MAX_DURATION' => 'Die Buchung ist länger als für diesen Arbeitsplatz erlaubt.',
        'EXCEEDS_MAX_END_OFFSET' => 'So weit im Voraus lässt sich hier nicht buchen.',
        'ENDS_IN_PAST' => 'Die Buchung ist bereits vorbei.',
        'NOT_ON_GRID' => 'Beginn und Ende müssen auf einer Viertelstunde liegen, das Ende nach dem Beginn.',
        'SPANS_NIGHT_NOT_ALLOWED' => 'In diesem Bereich sind keine Buchungen über Nacht möglich.',
        'WORKPLACE_NOT_BOOKABLE' => 'Dieser Arbeitsplatz ist nicht buchbar.',
        'USAGE_RULES_NOT_ACKNOWLEDGED' => 'Die Nutzungsregeln müssen bestätigt werden.',
    ];

    private const FIELDS = [
        'COLLISION' => 'startTime',
        'OUTSIDE_OPENING_HOURS' => 'startTime',
        'EXCEEDS_MAX_DURATION' => 'endTime',
        'EXCEEDS_MAX_END_OFFSET' => 'startTime',
        'ENDS_IN_PAST' => 'endTime',
        'NOT_ON_GRID' => 'startTime',
        'SPANS_NIGHT_NOT_ALLOWED' => 'endTime',
        'WORKPLACE_NOT_BOOKABLE' => 'workplaceId',
        'USAGE_RULES_NOT_ACKNOWLEDGED' => 'usageRulesAcknowledged',
    ];
}
