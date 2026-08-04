import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, map, of, switchMap } from 'rxjs';

import { ApiConfiguration } from '../api/api-configuration';
import {
  createBooking,
  deleteBooking,
  getBooking,
  getConfig,
  listAreas,
  listBookings,
  listWorkplaces,
  updateBooking,
  validateBooking,
} from '../api/functions';
import {
  Area,
  Booking,
  BookingValidation,
  BookingWrite,
  Config,
  // Renamed so that the generated model does not shadow the global Error.
  Error as ApiError,
  Workplace,
} from '../api/models';
import { formatDay, lastBookableDay } from '../calendar/booking-horizon';
import {
  DEFAULT_DURATION_MINUTES,
  TimeAxis,
  allowedDurations,
  blockGeometry,
  buildTimeAxis,
  formatDuration,
  formatMinutes,
  formatTime,
  instantAt,
  minutesOfDay,
  slotsOfDay,
} from '../calendar/time-axis';
import { readBooker, writeBooker } from '../shared/booker-cookie';
import { Icon } from '../shared/icon';
import { refinePageTitle } from '../shared/page-title';
import { SessionBar } from '../shared/session-bar';
import { SessionService } from '../shared/session-service';

/**
 * The form state as a single value. The fields bound to a `<select>` are
 * deliberately strings — that is what a select delivers; the conversion to
 * minutes happens in the derived signals.
 */
interface BookingFormValue {
  workplaceId: string;
  date: string;
  startMinutes: string;
  durationMinutes: string;
  overnight: boolean;
  /** Only in use with `overnight`, and always meant on the following day. */
  endMinutes: string;
  name: string;
  contact: string;
  rulesAcknowledged: boolean;
}

interface PreviewBlock {
  label: string;
  leftPercent: number;
  widthPercent: number;
  own: boolean;
  blockage: boolean;
  /** Set only for one's own box: colours it red. */
  collision?: boolean;
}

@Component({
  selector: 'app-booking-form',
  imports: [FormField, Icon, RouterLink, SessionBar],
  templateUrl: './booking-form.html',
  styleUrl: './booking-form.scss',
})
export class BookingForm {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = inject(ApiConfiguration).rootUrl;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly session = inject(SessionService);

  // --- Form -----------------------------------------------------------------

  private readonly model = signal<BookingFormValue>({
    workplaceId: '',
    date: '',
    startMinutes: '480',
    durationMinutes: String(DEFAULT_DURATION_MINUTES),
    overnight: false,
    endMinutes: '540',
    ...readBooker(),
    rulesAcknowledged: false,
  });

  /**
   * Signal Forms only takes on what the client can judge for itself: required
   * fields. All booking rules stay in the backend and come back via
   * `POST /bookings/validate` — that way they exist only once.
   */
  protected readonly bookingForm = form(this.model, (path) => {
    required(path.name, { message: 'Bitte einen Namen angeben.' });
    required(path.contact, {
      message: 'Bitte eine Kontaktangabe machen, z.B. E-Mail oder Telefon.',
    });
  });

  // --- Master data ----------------------------------------------------------

  protected readonly config = signal<Config | null>(null);
  protected readonly areas = signal<Area[]>([]);
  protected readonly workplaces = signal<Workplace[]>([]);
  protected readonly dayBookings = signal<Booking[]>([]);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);

  /** Set when an existing booking is being edited. */
  protected readonly editing = signal<Booking | null>(null);

  protected readonly validation = signal<BookingValidation | null>(null);

  constructor() {
    this.load();

    // The workplace first: a tab gets truncated, and "Neue Buchung" would be on
    // every second one. The booker's name stays out — it would otherwise end up
    // in the browser history.
    refinePageTitle(() => {
      const what = this.editing() ? 'Buchung bearbeiten' : 'Neue Buchung';
      const workplace = this.workplace();

      return workplace ? `${workplace.name}: ${what}` : what;
    });

    // Re-check against the server on every change to the time window — the rules
    // live there and are deliberately not reimplemented here.
    effect(() => {
      const candidate = this.candidate();

      if (candidate) {
        this.check(candidate);
      }
    });

    // The end times hang off the start: if that moves, the one currently set no
    // longer lands on a permitted duration. The nearest one takes its place — it
    // holds the duration where the shortest would have cut it back.
    effect(() => {
      const slots = this.endSlots();
      const chosen = this.endMinutes();

      if (!this.overnight() || slots.length === 0 || slots.includes(chosen)) {
        return;
      }

      const nearest = slots.reduce((best, slot) =>
        Math.abs(slot - chosen) < Math.abs(best - chosen) ? slot : best,
      );

      this.model.update((value) => ({ ...value, endMinutes: String(nearest) }));
    });

    // When the workplace or the day changes, the neighbouring bookings have to be
    // fetched afresh.
    effect(() => {
      const workplaceId = this.workplaceId();
      const date = this.date();

      if (workplaceId && date) {
        this.loadDayBookings(workplaceId, date);
      }
    });
  }

  // --- Derived form values --------------------------------------------------

  protected readonly workplaceId = computed(() => this.model().workplaceId);
  protected readonly date = computed(() => this.model().date);
  protected readonly startMinutes = computed(() => Number(this.model().startMinutes));
  protected readonly durationMinutes = computed(() => Number(this.model().durationMinutes));
  protected readonly overnight = computed(() => this.model().overnight);
  protected readonly endMinutes = computed(() => Number(this.model().endMinutes));
  protected readonly rulesAcknowledged = computed(() => this.model().rulesAcknowledged);

  // --- Derived state --------------------------------------------------------

  protected readonly axis = computed<TimeAxis | null>(() => {
    const config = this.config();

    return config ? buildTimeAxis(config.opensAt, config.closesAt) : null;
  });

  protected readonly workplace = computed(
    () => this.workplaces().find((entry) => entry.id === this.workplaceId()) ?? null,
  );

  protected readonly area = computed(() => {
    const workplace = this.workplace();

    return workplace ? (this.areas().find((entry) => entry.id === workplace.areaId) ?? null) : null;
  });

  /** Workplaces grouped by area, for the select field. */
  protected readonly grouped = computed(() =>
    this.areas()
      .map((area) => ({
        area,
        workplaces: this.workplaces().filter((workplace) => workplace.areaId === area.id),
      }))
      .filter((group) => group.workplaces.length > 0),
  );

  protected readonly maxDurationMinutes = computed(() => {
    const workplace = this.workplace();
    const area = this.area();

    return workplace?.maxBookingDurationMinutes ?? area?.maxBookingDurationMinutes ?? 0;
  });

  protected readonly durations = computed(() =>
    withChosen(allowedDurations(this.maxDurationMinutes()), this.durationMinutes()),
  );

  protected readonly slots = computed(() => {
    const axis = this.axis();

    return axis ? slotsOfDay(axis) : [];
  });

  /**
   * Possible end times on the following day — for every permitted booking
   * duration, the time it works out to.
   *
   * Only what falls within the opening hours is charged: the evening up to
   * closing and the morning from opening. A duration therefore corresponds not to
   * "start plus duration" but to what is left over after the evening. Durations
   * that do not reach beyond the evening do not lead overnight and do not appear
   * here; nor do those that would still run past closing in the morning.
   */
  protected readonly endSlots = computed(() => {
    const axis = this.axis();

    if (!axis) {
      return [];
    }

    const evening = axis.closesAt - this.startMinutes();

    return allowedDurations(this.maxDurationMinutes())
      .map((minutes) => axis.opensAt + minutes - evening)
      .filter((minutes) => minutes > axis.opensAt && minutes <= axis.closesAt);
  });

  protected readonly allowsOvernight = computed(() => this.area()?.allowNightlyActivities ?? false);

  /**
   * Selectable days: from today up to the area's booking horizon — and beyond it,
   * the day currently selected.
   *
   * That one may come from the URL or from an existing booking and lie further
   * out than the horizon. If it were missing from the list, the field would stand
   * empty while the check beneath it passed judgement on it — one would read an
   * error about a date that is nowhere on screen.
   */
  protected readonly dateOptions = computed(() => {
    const config = this.config();

    if (!config) {
      return [];
    }

    const last = lastBookableDay(config, this.area(), this.session.noTimeRestrictions());
    const days: string[] = [];

    // Without a limit it stops at a year: no select list reaches further.
    for (let offset = 0; offset <= 365; offset++) {
      const value = dayFromToday(offset);

      if (last !== null && value > last) {
        break;
      }

      days.push(value);
    }

    const chosen = this.date();

    if (chosen && !days.includes(chosen)) {
      days.push(chosen);
      days.sort();
    }

    const today = dayFromToday(0);
    const tomorrow = dayFromToday(1);

    return days.map((value) => ({
      value,
      label:
        value === today
          ? `Heute, ${formatDay(value)}`
          : value === tomorrow
            ? `Morgen, ${formatDay(value)}`
            : formatDay(value),
    }));
  });

  /** Start and end as real instants, or null while something is missing. */
  private readonly range = computed<{ start: Date; end: Date } | null>(() => {
    const date = this.date();

    if (!date) {
      return null;
    }

    const start = instantAt(date, this.startMinutes());

    // Overnight ends on the following day, without a second date picker. If
    // there were one, the same day could be set — and thus an end before the
    // start. Booking longer than one night takes the duration in whole-day steps.
    if (this.overnight()) {
      return { start, end: instantAt(nextDay(date), this.endMinutes()) };
    }

    return { start, end: new Date(start.getTime() + this.durationMinutes() * 60_000) };
  });

  protected readonly endLabel = computed(() => {
    const range = this.range();

    if (!range) {
      return '';
    }

    const sameDay = isoDate(range.start) === isoDate(range.end);

    return sameDay ? formatTime(range.end) : `${formatTime(range.end)} am ${formatDay(range.end)}`;
  });

  /** The booking as it would go to the API — or null while something is missing. */
  private readonly candidate = computed<BookingWrite | null>(() => {
    const range = this.range();
    const value = this.model();

    if (!range || !value.workplaceId || range.end <= range.start) {
      return null;
    }

    return {
      workplaceId: value.workplaceId,
      startTime: range.start.toISOString(),
      endTime: range.end.toISOString(),
      // A placeholder is enough for the pre-check — what gets checked is the time
      // range, not who is booking. The real values go along on save.
      name: value.name || 'Vorschau',
      contact: value.contact || 'vorschau@example.org',
      usageRulesAcknowledged: value.rulesAcknowledged,
    };
  });

  protected readonly canSubmit = computed(
    () => !this.saving() && this.validation()?.valid === true && this.bookingForm().valid(),
  );

  /** Specifically the collision, not every rule violation — it colours the box red. */
  protected readonly hasCollision = computed(
    () =>
      this.validation()?.violations.some((violation) => violation.code === 'COLLISION') ?? false,
  );

  // --- Preview on the timeline ----------------------------------------------

  protected readonly previewBlocks = computed<PreviewBlock[]>(() => {
    const axis = this.axis();
    const date = this.date();

    if (!axis || !date) {
      return [];
    }

    const day = new Date(`${date}T12:00:00`);
    const editingId = this.editing()?.id;
    const workplaceId = this.workplaceId();
    const nameOf = (id: string) =>
      this.workplaces().find((workplace) => workplace.id === id)?.name ?? id;

    const existing = this.dayBookings()
      .filter((booking) => booking.id !== editingId)
      .flatMap((booking): PreviewBlock[] => {
        const onThisWorkplace = booking.workplaceId === workplaceId;
        const blocksThisWorkplace = booking.blockedWorkplaceIds.includes(workplaceId);

        if (!onThisWorkplace && !blocksThisWorkplace) {
          return [];
        }

        const geometry = blockGeometry(
          axis,
          new Date(booking.startTime),
          new Date(booking.endTime),
          day,
        );

        if (!geometry) {
          return [];
        }

        return [
          {
            // As on the detail card in the calendar: a blockage names the
            // workplace it originates from, not who is booking there.
            label: onThisWorkplace
              ? booking.name
              : `blockiert durch ${nameOf(booking.workplaceId)}`,
            own: false,
            blockage: !onThisWorkplace,
            ...geometry,
          },
        ];
      });

    const range = this.range();

    if (range) {
      const geometry = blockGeometry(axis, range.start, range.end, day);

      if (geometry) {
        existing.push({
          label: 'Neue Buchung',
          own: true,
          blockage: false,
          collision: this.hasCollision(),
          ...geometry,
        });
      }
    }

    return existing;
  });

  protected readonly hourMarks = computed(() => this.axis()?.hours ?? []);

  protected hourLeftPercent(hour: number): number {
    const axis = this.axis();

    return axis ? ((hour * 60 - axis.opensAt) / (axis.closesAt - axis.opensAt)) * 100 : 0;
  }

  // --- Loading --------------------------------------------------------------

  private load(): void {
    const query = this.route.snapshot.queryParamMap;
    const bookingId = query.get('booking');

    forkJoin({
      config: getConfig(this.http, this.rootUrl).pipe(map((r) => r.body)),
      areas: listAreas(this.http, this.rootUrl).pipe(map((r) => r.body)),
      workplaces: listWorkplaces(this.http, this.rootUrl).pipe(map((r) => r.body)),
      session: this.session.load(),
      booking: bookingId
        ? getBooking(this.http, this.rootUrl, { id: bookingId }).pipe(map((r) => r.body))
        : of(null),
    }).subscribe({
      next: ({ config, areas, workplaces, booking }) => {
        this.config.set(config);
        this.areas.set(areas);
        this.workplaces.set(workplaces);

        if (booking) {
          this.prefillFromBooking(booking);
        } else {
          this.prefillFromQuery(query);
        }

        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('Die Stammdaten liessen sich nicht laden.');
        this.loading.set(false);
      },
    });
  }

  private prefillFromBooking(booking: Booking): void {
    const start = new Date(booking.startTime);
    const end = new Date(booking.endTime);

    // Only the one night counts as "overnight" — anything reaching further is
    // described through the duration, otherwise on save the form would silently
    // pull the end back to the following day.
    const overnight = isoDate(end) === nextDay(isoDate(start));

    this.editing.set(booking);

    this.model.update((value) => ({
      ...value,
      workplaceId: booking.workplaceId,
      date: isoDate(start),
      startMinutes: String(start.getHours() * 60 + start.getMinutes()),
      durationMinutes: overnight
        ? value.durationMinutes
        : String(Math.round((end.getTime() - start.getTime()) / 60_000)),
      overnight,
      endMinutes: String(end.getHours() * 60 + end.getMinutes()),
      name: booking.name,
      contact: booking.contact ?? '',
      rulesAcknowledged: booking.usageRulesAcknowledged,
    }));
  }

  private prefillFromQuery(query: { get(key: string): string | null }): void {
    const axis = this.axis();
    const start = query.get('start');
    const workplaceId = query.get('workplace') ?? this.workplaces()[0]?.id ?? '';

    const [datePart, timePart] = start ? start.split('T') : [isoDate(new Date()), null];
    const startMinutes = timePart ? minutesOfDay(timePart) : (axis?.opensAt ?? 480);

    // Set the workplace first, so that the default duration can be clamped
    // against its maximum.
    this.model.update((value) => ({ ...value, workplaceId, date: datePart }));

    const requestedDuration = Number(query.get('durationMinutes'));
    const maxDuration = this.maxDurationMinutes() || DEFAULT_DURATION_MINUTES;

    this.model.update((value) => ({
      ...value,
      startMinutes: String(startMinutes),
      durationMinutes: String(
        requestedDuration > 0 ? requestedDuration : Math.min(DEFAULT_DURATION_MINUTES, maxDuration),
      ),
      // The end time stays as it is: it only counts for "overnight", and then the
      // reconciliation above moves it onto a permitted duration anyway.
    }));
  }

  private loadDayBookings(workplaceId: string, date: string): void {
    const from = new Date(`${date}T00:00:00`);
    // Two days, so that an overnight booking stays fully visible.
    const to = new Date(from.getTime() + 2 * 24 * 60 * 60 * 1000);

    // Deliberately without a filter on the workplace: a booking on another
    // workplace can also block this one, and that is exactly what the preview has
    // to show — otherwise it reads "occupied" with no visible reason.
    listBookings(this.http, this.rootUrl, {
      from: from.toISOString(),
      to: to.toISOString(),
    })
      .pipe(map((response) => response.body))
      .subscribe({
        next: (bookings) => this.dayBookings.set(bookings),
        error: () => this.dayBookings.set([]),
      });
  }

  private check(candidate: BookingWrite): void {
    const excludeBookingId = this.editing()?.id;

    validateBooking(this.http, this.rootUrl, {
      ...(excludeBookingId ? { excludeBookingId } : {}),
      body: candidate,
    })
      .pipe(map((response) => response.body))
      .subscribe({
        next: (result) => this.validation.set(result),
        error: () => this.validation.set(null),
      });
  }

  // --- Saving ---------------------------------------------------------------

  protected submit(): void {
    const candidate = this.candidate();
    const value = this.model();

    if (!candidate || !this.canSubmit()) {
      return;
    }

    // The candidate carries placeholders for the pre-check — the values actually
    // entered go along on save.
    const body: BookingWrite = { ...candidate, name: value.name, contact: value.contact };
    const booking = this.editing();

    this.saving.set(true);
    this.saveError.set(null);

    const request = booking
      ? updateBooking(this.http, this.rootUrl, { id: booking.id, body })
      : createBooking(this.http, this.rootUrl, { body });

    request.subscribe({
      next: () => {
        // Remember only when creating: when editing, that is somebody else's name
        // and one does not want to adopt it as one's own.
        if (!booking) {
          writeBooker({ name: value.name, contact: value.contact });
        }

        this.router.navigate(['/']);
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.saveError.set(this.describe(error));
      },
    });
  }

  protected remove(): void {
    const booking = this.editing();

    if (!booking || !confirm('Diese Buchung wirklich löschen?')) {
      return;
    }

    this.saving.set(true);

    deleteBooking(this.http, this.rootUrl, { id: booking.id })
      .pipe(switchMap(() => of(null)))
      .subscribe({
        next: () => this.router.navigate(['/']),
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);
          this.saveError.set(this.describe(error));
        },
      });
  }

  private describe(error: HttpErrorResponse): string {
    if (error.status === 409) {
      return 'Der Arbeitsplatz wurde inzwischen von jemand anderem belegt.';
    }

    return (error.error as ApiError | null)?.message ?? 'Die Buchung liess sich nicht speichern.';
  }

  // --- Helpers for the template ---------------------------------------------

  protected readonly formatDuration = formatDuration;
  protected readonly formatMinutes = formatMinutes;
}

function isoDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * The day that lies the given number of days after today.
 *
 * Computed via midday: on a day with a DST change the step across midnight would
 * be 23 or 25 hours long and would land on the neighbouring day.
 */
/** The day after the given one. */
function nextDay(day: string): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + 1);

  return isoDate(date);
}

/**
 * The value currently set belongs in the select list even when it lands on no
 * step: it may come from an existing booking made before a change to the
 * gradation or the maximum. If it were missing, the field would stand empty while
 * what it holds would be saved.
 */
function withChosen(values: number[], chosen: number): number[] {
  return chosen > 0 && !values.includes(chosen)
    ? [...values, chosen].sort((left, right) => left - right)
    : values;
}

function dayFromToday(offset: number): string {
  const day = new Date();
  day.setHours(12, 0, 0, 0);
  day.setDate(day.getDate() + offset);

  return isoDate(day);
}
