import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, map, of } from 'rxjs';

import { ApiConfiguration } from '../api/api-configuration';
import { createArea, getArea, updateArea } from '../api/functions';
// Renamed so that the generated model does not shadow the global Error.
import { Area, AreaWrite, Error as ApiError } from '../api/models';
import { formatDuration } from '../calendar/time-axis';
import { refinePageTitle } from '../shared/page-title';

/**
 * The form state. Numbers are held as strings — that is what an `<input>`
 * delivers; conversion happens only on save.
 */
interface AreaFormValue {
  name: string;
  color: string;
  maxBookingDurationMinutes: string;
  /** Separate from the value so that "the global horizon applies" is checkable. */
  useGlobalOffset: boolean;
  maxBookingEndOffsetDays: string;
  allowNightlyActivities: boolean;
}

/**
 * The area colours differ only in hue, not in lightness and saturation — hence a
 * row of ready-made hues rather than a free colour picker. That keeps the bars in
 * the calendar legible against one another.
 */
const HUES = [20, 70, 130, 170, 230, 280, 320, 350];

const SWATCHES = [...HUES.map((hue) => `oklch(0.8 0.1 ${hue})`), 'oklch(0.8 0 0)'];

@Component({
  selector: 'app-area-form',
  imports: [FormField],
  templateUrl: './area-form.html',
  styleUrl: './area-form.scss',
})
export class AreaForm {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = inject(ApiConfiguration).rootUrl;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly swatches = SWATCHES;

  /** Set when an existing area is being edited. */
  protected readonly editing = signal<Area | null>(null);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);

  protected readonly model = signal<AreaFormValue>({
    name: '',
    color: SWATCHES[2],
    maxBookingDurationMinutes: '240',
    useGlobalOffset: true,
    maxBookingEndOffsetDays: '30',
    allowNightlyActivities: false,
  });

  /** As in the booking form: only required fields here, everything else in the backend. */
  protected readonly areaForm = form(this.model, (path) => {
    required(path.name, { message: 'Bitte einen Namen angeben.' });
    required(path.color, { message: 'Bitte eine Farbe wählen.' });
  });

  /** The entered duration in plain words — 240 says less than "4 Stunden". */
  protected readonly durationLabel = computed(() => {
    const minutes = Number(this.model().maxBookingDurationMinutes);

    return Number.isFinite(minutes) && minutes >= 15 ? formatDuration(minutes) : '';
  });

  constructor() {
    // The name first: which area is being edited is the real information in the
    // tab. When creating there is none, and then the route's title stays.
    refinePageTitle(() => {
      const editing = this.editing();

      return editing ? `Bereich ${editing.name} bearbeiten` : null;
    });

    const id = this.route.snapshot.paramMap.get('id');

    const loaded: Observable<Area | null> = id
      ? getArea(this.http, this.rootUrl, { id }).pipe(map((r) => r.body))
      : of(null);

    loaded.subscribe({
      next: (area) => {
        if (area) {
          this.editing.set(area);
          this.model.set(toFormValue(area));
        }

        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('Der Bereich liess sich nicht laden.');
        this.loading.set(false);
      },
    });
  }

  protected pick(color: string): void {
    this.model.update((value) => ({ ...value, color }));
  }

  protected readonly canSubmit = computed(() => !this.saving() && this.areaForm().valid());

  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }

    const area = this.editing();
    const body = toWrite(this.model());

    this.saving.set(true);
    this.saveError.set(null);

    const request = area
      ? updateArea(this.http, this.rootUrl, { id: area.id, body })
      : createArea(this.http, this.rootUrl, { body });

    request.subscribe({
      next: () => this.router.navigate(['/verwaltung/bereiche']),
      error: (response: HttpErrorResponse) => {
        this.saving.set(false);
        this.saveError.set(
          (response.error as ApiError | null)?.message ?? 'Speichern fehlgeschlagen.',
        );
      },
    });
  }

  protected cancel(): void {
    this.router.navigate(['/verwaltung/bereiche']);
  }
}

function toFormValue(area: Area): AreaFormValue {
  return {
    name: area.name,
    color: area.color,
    maxBookingDurationMinutes: String(area.maxBookingDurationMinutes),
    useGlobalOffset: area.maxBookingEndOffsetDays === null,
    maxBookingEndOffsetDays: String(area.maxBookingEndOffsetDays ?? 30),
    allowNightlyActivities: area.allowNightlyActivities,
  };
}

function toWrite(value: AreaFormValue): AreaWrite {
  return {
    name: value.name.trim(),
    color: value.color.trim(),
    maxBookingDurationMinutes: Number(value.maxBookingDurationMinutes),
    maxBookingEndOffsetDays: value.useGlobalOffset ? null : Number(value.maxBookingEndOffsetDays),
    allowNightlyActivities: value.allowNightlyActivities,
  };
}
