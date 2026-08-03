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
  // Umbenannt, damit das generierte Modell das globale Error nicht verdeckt.
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
import { SessionBar } from '../shared/session-bar';
import { SessionService } from '../shared/session-service';

/**
 * Der Formularzustand als ein Wert. Die Felder, die an einem `<select>` hängen,
 * sind bewusst Strings — das ist es, was ein Select liefert; die Umrechnung in
 * Minuten passiert in den abgeleiteten Signalen.
 */
interface BookingFormValue {
  workplaceId: string;
  date: string;
  startMinutes: string;
  durationMinutes: string;
  overnight: boolean;
  /** Nur bei `overnight` in Gebrauch, und immer am Folgetag gemeint. */
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
  /** Nur für die eigene Box gesetzt: färbt sie rot. */
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

  // --- Formular -------------------------------------------------------------

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
   * Signal Forms übernimmt nur, was der Client selbst beurteilen kann:
   * Pflichtfelder. Alle Buchungsregeln bleiben im Backend und kommen über
   * `POST /bookings/validate` zurück — so gibt es sie nur einmal.
   */
  protected readonly bookingForm = form(this.model, (path) => {
    required(path.name, { message: 'Bitte einen Namen angeben.' });
    required(path.contact, {
      message: 'Bitte eine Kontaktangabe machen, z.B. E-Mail oder Telefon.',
    });
  });

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

    // Die Endzeiten hängen am Beginn: verschiebt der sich, passt die
    // eingestellte nicht mehr auf eine erlaubte Dauer. Die nächstliegende tritt
    // an ihre Stelle — sie hält die Dauer, wo die kürzeste sie einkürzte.
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

    // Wechselt der Arbeitsplatz oder der Tag, müssen die Nachbarbuchungen neu her.
    effect(() => {
      const workplaceId = this.workplaceId();
      const date = this.date();

      if (workplaceId && date) {
        this.loadDayBookings(workplaceId, date);
      }
    });
  }

  // --- Abgeleitete Formularwerte -------------------------------------------

  protected readonly workplaceId = computed(() => this.model().workplaceId);
  protected readonly date = computed(() => this.model().date);
  protected readonly startMinutes = computed(() => Number(this.model().startMinutes));
  protected readonly durationMinutes = computed(() => Number(this.model().durationMinutes));
  protected readonly overnight = computed(() => this.model().overnight);
  protected readonly endMinutes = computed(() => Number(this.model().endMinutes));
  protected readonly rulesAcknowledged = computed(() => this.model().rulesAcknowledged);

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

  protected readonly durations = computed(() =>
    withChosen(allowedDurations(this.maxDurationMinutes()), this.durationMinutes()),
  );

  protected readonly slots = computed(() => {
    const axis = this.axis();

    return axis ? slotsOfDay(axis) : [];
  });

  /**
   * Mögliche Endzeiten am Folgetag — zu jeder erlaubten Buchungsdauer die
   * Uhrzeit, bei der sie herauskommt.
   *
   * Angerechnet wird nur, was in den Öffnungszeiten liegt: der Abend bis zur
   * Schliessung und der Morgen ab der Öffnung. Zu einer Dauer gehört darum
   * nicht "Beginn plus Dauer", sondern was nach dem Abend noch übrig ist.
   * Dauern, die über den Abend nicht hinausreichen, führen nicht über Nacht
   * und stehen hier nicht; ebensowenig solche, die noch am Morgen über die
   * Schliessung hinauskämen.
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
   * Auswählbare Tage: von heute bis zum Vorlauf des Bereichs — und darüber
   * hinaus der gerade gewählte Tag.
   *
   * Der kann aus der Adresse kommen oder aus einer bestehenden Buchung und
   * weiter draussen liegen als der Vorlauf. Fehlte er in der Liste, stünde das
   * Feld leer, während die Prüfung darunter über ihn urteilt — man läse einen
   * Fehler zu einem Datum, das nirgends steht.
   */
  protected readonly dateOptions = computed(() => {
    const config = this.config();

    if (!config) {
      return [];
    }

    const last = lastBookableDay(config, this.area(), this.session.noTimeRestrictions());
    const days: string[] = [];

    // Ohne Grenze bleibt es bei einem Jahr: weiter reicht keine Auswahlliste.
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

  /** Start und Ende als echte Zeitpunkte, oder null solange etwas fehlt. */
  private readonly range = computed<{ start: Date; end: Date } | null>(() => {
    const date = this.date();

    if (!date) {
      return null;
    }

    const start = instantAt(date, this.startMinutes());

    // Über Nacht endet am Folgetag, ohne zweite Datumswahl. Stünde sie da,
    // liesse sich derselbe Tag einstellen — und damit ein Ende vor dem Beginn.
    // Wer länger als eine Nacht bucht, nimmt die Dauer in Tagesschritten.
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

  /** Die Buchung, wie sie an die API ginge — oder null, solange etwas fehlt. */
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
      // Für die Vorabprüfung reicht ein Platzhalter — geprüft wird der Zeitraum,
      // nicht wer bucht. Beim Speichern gehen die echten Werte mit.
      name: value.name || 'Vorschau',
      contact: value.contact || 'vorschau@example.org',
      usageRulesAcknowledged: value.rulesAcknowledged,
    };
  });

  protected readonly canSubmit = computed(
    () => !this.saving() && this.validation()?.valid === true && this.bookingForm().valid(),
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

    // Nur die eine Nacht ist "über Nacht" — was weiter reicht, wird über die
    // Dauer beschrieben, sonst zöge das Formular beim Speichern das Ende
    // stillschweigend auf den Folgetag zurück.
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

    // Erst den Arbeitsplatz setzen, damit die Standarddauer gegen dessen
    // Maximum geklemmt werden kann.
    this.model.update((value) => ({ ...value, workplaceId, date: datePart }));

    const requestedDuration = Number(query.get('durationMinutes'));
    const maxDuration = this.maxDurationMinutes() || DEFAULT_DURATION_MINUTES;

    this.model.update((value) => ({
      ...value,
      startMinutes: String(startMinutes),
      durationMinutes: String(
        requestedDuration > 0 ? requestedDuration : Math.min(DEFAULT_DURATION_MINUTES, maxDuration),
      ),
      // Die Endzeit bleibt, wie sie ist: sie zählt erst bei "über Nacht", und
      // dann rückt der Abgleich oben sie ohnehin auf eine erlaubte Dauer.
    }));
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

  // --- Speichern -----------------------------------------------------------

  protected submit(): void {
    const candidate = this.candidate();
    const value = this.model();

    if (!candidate || !this.canSubmit()) {
      return;
    }

    // Der Kandidat trägt für die Vorabprüfung Platzhalter — beim Speichern
    // gehen die tatsächlich eingegebenen Werte mit.
    const body: BookingWrite = { ...candidate, name: value.name, contact: value.contact };
    const booking = this.editing();

    this.saving.set(true);
    this.saveError.set(null);

    const request = booking
      ? updateBooking(this.http, this.rootUrl, { id: booking.id, body })
      : createBooking(this.http, this.rootUrl, { body });

    request.subscribe({
      next: () => {
        // Nur beim Anlegen merken: beim Bearbeiten steht dort der Name einer
        // fremden Person, den man nicht als eigenen übernehmen will.
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

  // --- Hilfsmittel fürs Template --------------------------------------------

  protected readonly formatDuration = formatDuration;
  protected readonly formatMinutes = formatMinutes;
}

function isoDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * Der Tag, der so viele Tage nach heute liegt.
 *
 * Über Mittag gerechnet: an einem Tag mit Zeitumstellung wäre der Schritt über
 * Mitternacht 23 oder 25 Stunden lang und träfe den Nachbartag.
 */
/** Der Tag nach dem gegebenen. */
function nextDay(day: string): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + 1);

  return isoDate(date);
}

/**
 * Der eingestellte Wert gehört in die Auswahlliste, auch wenn er auf keiner
 * Stufe liegt: er kann aus einer bestehenden Buchung stammen, die vor einer
 * Änderung der Staffelung oder des Maximums entstanden ist. Fehlte er, stünde
 * das Feld leer, während gespeichert würde, was darin steht.
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
