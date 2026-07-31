import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
import { Area, Booking, BookingValidation, Config, Workplace } from '../api/models';
import {
  GRID_MINUTES,
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
import { Booker, readBooker, writeBooker } from '../shared/booker-cookie';
import { SessionBar } from '../shared/session-bar';
import { SessionService } from '../shared/session-service';

/** Standarddauer einer neuen Buchung, sofern sie am Arbeitsplatz erlaubt ist. */
const DEFAULT_DURATION_MINUTES = 120;

interface PreviewBlock {
  label: string;
  leftPercent: number;
  widthPercent: number;
  own: boolean;
  blockage: boolean;
  /** Nur für die eigene Box gesetzt: färbt sie rot. */
  collision?: boolean;
}

@Component({
  selector: 'app-booking-form',
  imports: [FormsModule, RouterLink, SessionBar],
  templateUrl: './booking-form.html',
  styleUrl: './booking-form.scss',
})
export class BookingForm {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = inject(ApiConfiguration).rootUrl;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly session = inject(SessionService);

  // --- Stammdaten -----------------------------------------------------------

  protected readonly config = signal<Config | null>(null);
  protected readonly areas = signal<Area[]>([]);
  protected readonly workplaces = signal<Workplace[]>([]);
  protected readonly dayBookings = signal<Booking[]>([]);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);

  /** Gesetzt, wenn eine bestehende Buchung bearbeitet wird. */
  protected readonly editing = signal<Booking | null>(null);

  // --- Formularfelder -------------------------------------------------------

  protected readonly workplaceId = signal('');
  protected readonly date = signal('');
  protected readonly startMinutes = signal(0);
  protected readonly durationMinutes = signal(GRID_MINUTES);
  protected readonly overnight = signal(false);
  protected readonly endDate = signal('');
  protected readonly endMinutes = signal(0);
  protected readonly booker = signal<Booker>(readBooker());
  protected readonly rulesAcknowledged = signal(false);

  protected readonly validation = signal<BookingValidation | null>(null);

  constructor() {
    this.load();

    // Bei jeder Änderung am Zeitfenster frisch gegen den Server prüfen — die
    // Regeln liegen dort und werden hier bewusst nicht nachgebaut.
    effect(() => {
      const candidate = this.candidate();

      if (candidate) {
        this.check(candidate);
      }
    });

    // Wechselt der Arbeitsplatz oder der Tag, müssen die Nachbarbuchungen neu her.
    effect(() => {
      const workplaceId = this.workplaceId();
      const date = this.date();

      if (workplaceId && date) {
        this.loadDayBookings(workplaceId, date);
      }
    });
  }

  // --- Abgeleitetes ---------------------------------------------------------

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

  /** Arbeitsplätze nach Bereich gruppiert, für das Auswahlfeld. */
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

  protected readonly durations = computed(() => allowedDurations(this.maxDurationMinutes()));

  protected readonly slots = computed(() => {
    const axis = this.axis();

    return axis ? slotsOfDay(axis) : [];
  });

  /** Die Enden liegen eine Viertelstunde später als die Startzeiten. */
  protected readonly endSlots = computed(() => {
    const axis = this.axis();

    return axis
      ? slotsOfDay(axis)
          .map((minutes) => minutes + GRID_MINUTES)
          .filter((minutes) => minutes <= axis.closesAt)
      : [];
  });

  protected readonly allowsOvernight = computed(() => this.area()?.allowNightlyActivities ?? false);

  /** Auswählbare Tage, begrenzt durch den Vorlauf des Bereichs. */
  protected readonly dateOptions = computed(() => {
    const config = this.config();

    if (!config) {
      return [];
    }

    const limit = this.session.session()?.permissions.noTimeRestrictions
      ? 365
      : (this.area()?.maxBookingEndOffsetDays ?? config.maxBookingEndOffsetDays);

    const options: { value: string; label: string }[] = [];

    for (let offset = 0; offset <= Math.min(limit, 365); offset++) {
      const day = new Date();
      day.setDate(day.getDate() + offset);
      const value = isoDate(day);

      options.push({
        value,
        label:
          offset === 0
            ? `Heute, ${formatDate(day)}`
            : offset === 1
              ? `Morgen, ${formatDate(day)}`
              : formatDate(day),
      });
    }

    return options;
  });

  /** Start und Ende als echte Zeitpunkte, oder null solange etwas fehlt. */
  private readonly range = computed<{ start: Date; end: Date } | null>(() => {
    const date = this.date();

    if (!date) {
      return null;
    }

    const start = instantAt(date, this.startMinutes());

    if (this.overnight()) {
      const endDate = this.endDate();

      return endDate ? { start, end: instantAt(endDate, this.endMinutes()) } : null;
    }

    return { start, end: new Date(start.getTime() + this.durationMinutes() * 60_000) };
  });

  protected readonly endLabel = computed(() => {
    const range = this.range();

    if (!range) {
      return '';
    }

    const sameDay = isoDate(range.start) === isoDate(range.end);

    return sameDay ? formatTime(range.end) : `${formatTime(range.end)} am ${formatDate(range.end)}`;
  });

  private readonly candidate = computed(() => {
    const range = this.range();
    const workplaceId = this.workplaceId();

    if (!range || !workplaceId || range.end <= range.start) {
      return null;
    }

    return {
      workplaceId,
      startTime: range.start.toISOString(),
      endTime: range.end.toISOString(),
      name: this.booker().name || 'Vorschau',
      contact: this.booker().contact || 'vorschau@example.org',
      usageRulesAcknowledged: this.rulesAcknowledged(),
    };
  });

  protected readonly canSubmit = computed(
    () =>
      !this.saving() &&
      this.validation()?.valid === true &&
      this.booker().name.trim() !== '' &&
      this.booker().contact.trim() !== '',
  );

  /** Speziell die Kollision, nicht jeder Regelverstoss — die färbt die Box rot. */
  protected readonly hasCollision = computed(
    () =>
      this.validation()?.violations.some((violation) => violation.code === 'COLLISION') ?? false,
  );

  // --- Vorschau auf der Zeitleiste -----------------------------------------

  protected readonly previewBlocks = computed<PreviewBlock[]>(() => {
    const axis = this.axis();
    const date = this.date();

    if (!axis || !date) {
      return [];
    }

    const day = new Date(`${date}T12:00:00`);
    const editingId = this.editing()?.id;

    const workplaceId = this.workplaceId();

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
            label: onThisWorkplace ? booking.name : `blockiert durch ${booking.name}`,
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

  // --- Laden ---------------------------------------------------------------

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

    this.editing.set(booking);
    this.workplaceId.set(booking.workplaceId);
    this.date.set(isoDate(start));
    this.startMinutes.set(start.getHours() * 60 + start.getMinutes());

    if (isoDate(start) === isoDate(end)) {
      this.durationMinutes.set(Math.round((end.getTime() - start.getTime()) / 60_000));
    } else {
      this.overnight.set(true);
      this.endDate.set(isoDate(end));
      this.endMinutes.set(end.getHours() * 60 + end.getMinutes());
    }

    this.booker.set({ name: booking.name, contact: booking.contact ?? '' });
    this.rulesAcknowledged.set(booking.usageRulesAcknowledged);
  }

  private prefillFromQuery(query: { get(key: string): string | null }): void {
    const axis = this.axis();
    const start = query.get('start');

    this.workplaceId.set(query.get('workplace') ?? this.workplaces()[0]?.id ?? '');

    if (start) {
      const [datePart, timePart] = start.split('T');
      this.date.set(datePart);
      this.startMinutes.set(minutesOfDay(timePart));
    } else {
      this.date.set(isoDate(new Date()));
      this.startMinutes.set(axis?.opensAt ?? 480);
    }

    const requestedDuration = Number(query.get('durationMinutes'));
    const maxDuration = this.maxDurationMinutes() || DEFAULT_DURATION_MINUTES;

    this.durationMinutes.set(
      requestedDuration > 0 ? requestedDuration : Math.min(DEFAULT_DURATION_MINUTES, maxDuration),
    );
    this.endDate.set(this.date());
    this.endMinutes.set((axis?.opensAt ?? 480) + GRID_MINUTES);
  }

  private loadDayBookings(workplaceId: string, date: string): void {
    const from = new Date(`${date}T00:00:00`);
    // Zwei Tage, damit eine Buchung über Nacht vollständig sichtbar bleibt.
    const to = new Date(from.getTime() + 2 * 24 * 60 * 60 * 1000);

    // Bewusst ohne Filter auf den Arbeitsplatz: eine Buchung auf einem anderen
    // Platz kann diesen hier mitblockieren, und genau das muss die Vorschau
    // zeigen — sonst steht dort "belegt" ohne sichtbaren Grund.
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

  private check(candidate: ReturnType<typeof this.candidate>): void {
    if (!candidate) {
      return;
    }

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

  // --- Speichern -----------------------------------------------------------

  protected submit(): void {
    const candidate = this.candidate();

    if (!candidate || !this.canSubmit()) {
      return;
    }

    const body = { ...candidate, name: this.booker().name, contact: this.booker().contact };
    const booking = this.editing();

    this.saving.set(true);
    this.saveError.set(null);
    writeBooker(this.booker());

    const request = booking
      ? updateBooking(this.http, this.rootUrl, { id: booking.id, body })
      : createBooking(this.http, this.rootUrl, { body });

    request.subscribe({
      next: () => this.router.navigate(['/']),
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

    return (
      (error.error as { message?: string } | null)?.message ??
      'Die Buchung liess sich nicht speichern.'
    );
  }

  // --- Hilfsmittel fürs Template --------------------------------------------

  protected readonly formatDuration = formatDuration;
  protected readonly formatMinutes = formatMinutes;

  protected updateBooker(patch: Partial<Booker>): void {
    this.booker.update((current) => ({ ...current, ...patch }));
  }
}

function isoDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'long' });
}
