import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, map, of } from 'rxjs';

import { ApiConfiguration } from '../api/api-configuration';
import {
  createBookingSeries,
  getBookingSeries,
  getConfig,
  listAreas,
  listWorkplaces,
  updateBookingSeries,
} from '../api/functions';
// Umbenannt, damit das generierte Modell das globale Error nicht verdeckt.
import {
  Area,
  BookingSeries,
  BookingSeriesResult,
  BookingSeriesWrite,
  Config,
  Error as ApiError,
  Workplace,
} from '../api/models';
import {
  DEFAULT_DURATION_MINUTES,
  TimeAxis,
  allowedDurations,
  buildTimeAxis,
  formatDuration,
  formatMinutes,
  instantAt,
  minutesOfDay,
  slotsOfDay,
  toLocalIso,
} from '../calendar/time-axis';
import { refinePageTitle } from '../shared/page-title';
import { SessionService } from '../shared/session-service';
import { AdminHeader } from './admin-header';
import { RHYTHMS, RhythmKey, rhythmByKey, rhythmOf, skipsMonths } from './series-rhythm';

/**
 * Der Formularzustand. Wie im Buchungsformular liegen Zahlen als Strings vor —
 * das ist es, was ein `<select>` liefert.
 */
interface SeriesFormValue {
  workplaceId: string;
  name: string;
  contact: string;
  /** Tag der ersten Instanz, "YYYY-MM-DD". */
  date: string;
  startMinutes: string;
  durationMinutes: string;
  rhythm: RhythmKey;
  /** Getrennt vom Datum, damit „läuft weiter" ankreuzbar ist. */
  openEnded: boolean;
  endDate: string;
}

/**
 * Serie anlegen und ändern.
 *
 * Bewusst ohne Vorabprüfung während der Eingabe: der häufigste Fehlerfall einer
 * Buchung ist die Kollision, und die ist bei einer Serie kein Fehler — der
 * einzelne Termin fällt aus, die Serie entsteht. Eine Live-Prüfung müsste das
 * wissen und damit Regelwissen im Frontend halten. Geprüft wird beim Speichern,
 * und geantwortet wird vom Server.
 *
 * Aus demselben Grund gibt es keine Terminvorschau: welche Termine entstehen,
 * rechnet `SeriesSchedule` im Backend aus, samt der Regel über übersprungene
 * Monate. Die Vorschau ist stattdessen die Einzelansicht des Arbeitsplatzes,
 * auf die der Weg nach dem Speichern führt.
 */
@Component({
  selector: 'app-series-form',
  imports: [AdminHeader, FormField, RouterLink],
  templateUrl: './series-form.html',
  styleUrl: './series-form.scss',
})
export class SeriesForm {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = inject(ApiConfiguration).rootUrl;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly session = inject(SessionService);

  protected readonly rhythms = RHYTHMS;

  private readonly config = signal<Config | null>(null);
  private readonly areas = signal<Area[]>([]);
  private readonly workplaces = signal<Workplace[]>([]);

  /** Gesetzt, wenn eine bestehende Serie bearbeitet wird. */
  protected readonly editing = signal<BookingSeries | null>(null);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);

  /** Feldfehler aus einer 422-Antwort, nach Feldnamen der Spec. */
  protected readonly fieldErrors = signal<Record<string, string[]>>({});

  /** Was das Speichern ergeben hat — solange gesetzt, steht die Abschlussansicht. */
  protected readonly result = signal<BookingSeriesResult | null>(null);

  protected readonly model = signal<SeriesFormValue>({
    workplaceId: '',
    name: '',
    contact: '',
    date: isoDate(new Date()),
    startMinutes: '540',
    durationMinutes: String(DEFAULT_DURATION_MINUTES),
    rhythm: 'weekly',
    openEnded: true,
    endDate: '',
  });

  /** Nur Pflichtfelder — alles Weitere prüft das Backend. */
  protected readonly seriesForm = form(this.model, (path) => {
    required(path.workplaceId, { message: 'Bitte einen Arbeitsplatz wählen.' });
    required(path.name, { message: 'Bitte einen Namen angeben.' });
    required(path.contact, { message: 'Bitte einen Kontakt angeben.' });
    required(path.date, { message: 'Bitte ein Datum für den ersten Termin angeben.' });
  });

  protected readonly heading = computed(() => (this.editing() ? 'Serie bearbeiten' : 'Neue Serie'));

  constructor() {
    // Der Name zuerst: welcher Serie bearbeitet wird, ist im Reiter die
    // eigentliche Auskunft. Beim Anlegen gibt es keinen, dann bleibt der
    // Titel der Route stehen.
    refinePageTitle(() => {
      const editing = this.editing();

      return editing ? `Serie ${editing.name} bearbeiten` : null;
    });

    const id = this.route.snapshot.paramMap.get('id');

    forkJoin({
      session: this.session.load(),
      config: getConfig(this.http, this.rootUrl).pipe(map((r) => r.body)),
      areas: listAreas(this.http, this.rootUrl).pipe(map((r) => r.body)),
      workplaces: listWorkplaces(this.http, this.rootUrl).pipe(map((r) => r.body)),
      series: id
        ? getBookingSeries(this.http, this.rootUrl, { id }).pipe(map((r) => r.body))
        : of(null),
    }).subscribe({
      next: ({ config, areas, workplaces, series }) => {
        this.config.set(config);
        this.areas.set(areas);
        this.workplaces.set(workplaces);

        if (series) {
          this.editing.set(series);
          this.model.set(toFormValue(series));
        } else {
          this.model.update((value) => ({
            ...value,
            workplaceId: workplaces[0]?.id ?? '',
            startMinutes: String(minutesOfDay(config.opensAt)),
          }));
        }

        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('Die Stammdaten liessen sich nicht laden.');
        this.loading.set(false);
      },
    });
  }

  // --- Abgeleitetes ---------------------------------------------------------

  protected readonly axis = computed<TimeAxis | null>(() => {
    const config = this.config();

    return config ? buildTimeAxis(config.opensAt, config.closesAt) : null;
  });

  protected readonly grouped = computed(() =>
    this.areas()
      .map((area) => ({
        area,
        workplaces: this.workplaces().filter((workplace) => workplace.areaId === area.id),
      }))
      .filter((group) => group.workplaces.length > 0),
  );

  private readonly workplace = computed(
    () => this.workplaces().find((entry) => entry.id === this.model().workplaceId) ?? null,
  );

  private readonly area = computed(
    () => this.areas().find((entry) => entry.id === this.workplace()?.areaId) ?? null,
  );

  protected readonly maxDurationMinutes = computed(
    () =>
      this.workplace()?.maxBookingDurationMinutes ?? this.area()?.maxBookingDurationMinutes ?? 0,
  );

  protected readonly durations = computed(() => allowedDurations(this.maxDurationMinutes()));

  protected readonly slots = computed(() => {
    const axis = this.axis();

    return axis ? slotsOfDay(axis) : [];
  });

  /** Beginn und Ende als lokale Wanduhrzeit, in der Form der Spec. */
  private readonly firstInstance = computed(() => {
    const value = this.model();
    const start = instantAt(value.date, Number(value.startMinutes));
    const end = instantAt(value.date, Number(value.startMinutes) + Number(value.durationMinutes));

    return { start, end };
  });

  /**
   * „Montag, 3.8.2026, 11:00" — das Ende des ersten Termins. Rutscht es auf den
   * Folgetag, sagt es das von selbst, denn es steht das ganze Datum da; ein
   * eigenes Kreuz für „über Nacht" braucht es deshalb nicht.
   */
  protected readonly endLabel = computed(() =>
    this.firstInstance().end.toLocaleString('de-CH', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  );

  /** Der Wochentag, der aus dem gewählten Datum folgt. */
  protected readonly weekday = computed(() =>
    this.firstInstance().start.toLocaleDateString('de-CH', { weekday: 'long' }),
  );

  protected readonly dayOfMonth = computed(() => this.firstInstance().start.getDate());

  /** Bei MONTHLY über dem 28.: Monate ohne diesen Tag fallen aus. */
  protected readonly warnsAboutSkippedMonths = computed(
    () => this.model().rhythm === 'monthly' && skipsMonths(this.dayOfMonth()),
  );

  protected readonly canSubmit = computed(() => !this.saving() && this.seriesForm().valid());

  protected errorsFor(field: string): string[] {
    return this.fieldErrors()[field] ?? [];
  }

  // --- Abschlussansicht -----------------------------------------------------

  protected readonly skipped = computed(() => this.result()?.skippedInstances ?? []);

  /** Datum eines ausgefallenen Termins, für Anzeige und Link auf den Tag. */
  protected skippedDay(startTime: string): string {
    return isoDate(new Date(startTime));
  }

  protected skippedLabel(startTime: string): string {
    return new Date(startTime).toLocaleString('de-CH', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Der Monat, in dem die Serie zu sehen ist: der erste Termin, oder heute, wenn
   * er längst vorbei ist — erzeugt wird ohnehin erst ab jetzt.
   */
  protected readonly calendarLink = computed(() => {
    const series = this.result()?.series;

    if (!series) {
      return null;
    }

    const first = new Date(`${series.firstInstanceStart}:00`);
    const today = new Date();

    return {
      arbeitsplatz: series.workplaceId,
      datum: isoDate(first > today ? first : today),
    };
  });

  protected toCalendar(): void {
    const link = this.calendarLink();

    if (link) {
      this.router.navigate(['/arbeitsplatz'], { queryParams: link });
    }
  }

  protected toList(): void {
    this.router.navigate(['/verwaltung/serien']);
  }

  // --- Speichern ------------------------------------------------------------

  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }

    const series = this.editing();
    const body = this.toWrite();

    this.saving.set(true);
    this.saveError.set(null);
    this.fieldErrors.set({});

    const request = series
      ? updateBookingSeries(this.http, this.rootUrl, { id: series.id, body })
      : createBookingSeries(this.http, this.rootUrl, { body });

    request.subscribe({
      next: (response) => {
        this.saving.set(false);
        this.result.set(response.body);
      },
      error: (response: HttpErrorResponse) => {
        this.saving.set(false);

        const error = response.error as ApiError | null;

        this.fieldErrors.set(error?.errors ?? {});
        this.saveError.set(error?.message ?? 'Die Serie liess sich nicht speichern.');
      },
    });
  }

  protected cancel(): void {
    this.toList();
  }

  private toWrite(): BookingSeriesWrite {
    const value = this.model();
    const rhythm = rhythmByKey(value.rhythm);
    const { start, end } = this.firstInstance();

    return {
      workplaceId: value.workplaceId,
      name: value.name.trim(),
      contact: value.contact.trim(),
      interval: rhythm.interval,
      intervalCount: rhythm.intervalCount,
      // Ohne Zonenangabe, und das ist keine Nachlässigkeit: die Serie hält
      // Wanduhrzeit fest, damit sie über die Zeitumstellung hinweg zur selben
      // Uhrzeit stattfindet. Ein `toISOString()` an dieser Stelle wäre der Fehler.
      firstInstanceStart: toLocalIso(start),
      firstInstanceEnd: toLocalIso(end),
      endDate: value.openEnded ? null : value.endDate,
    };
  }

  // --- Hilfsmittel fürs Template --------------------------------------------

  protected readonly formatDuration = formatDuration;
  protected readonly formatMinutes = formatMinutes;
}

function toFormValue(series: BookingSeries): SeriesFormValue {
  const start = new Date(`${series.firstInstanceStart}:00`);
  const end = new Date(`${series.firstInstanceEnd}:00`);

  return {
    workplaceId: series.workplaceId,
    name: series.name,
    contact: series.contact,
    date: isoDate(start),
    startMinutes: String(start.getHours() * 60 + start.getMinutes()),
    durationMinutes: String(Math.round((end.getTime() - start.getTime()) / 60_000)),
    rhythm: rhythmOf(series),
    openEnded: series.endDate === null,
    endDate: series.endDate ?? '',
  };
}

function isoDate(instant: Date): string {
  return toLocalIso(instant).slice(0, 10);
}
