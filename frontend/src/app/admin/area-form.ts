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
import { planPalette } from '../map/plan';
import { PlanSource } from '../map/plan-source';
import { refinePageTitle } from '../shared/page-title';
import { Oklch, RANGE, RECOMMENDED, colorKey, formatOklch, toOklch } from './area-color';

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

/** Where a colour starts that nobody has chosen yet. */
const DEFAULT_COLOR = formatOklch({ ...RECOMMENDED, h: 130 });

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
  private readonly plans = inject(PlanSource);

  protected readonly range = RANGE;
  protected readonly recommended = RECOMMENDED;

  /** The colours the floor plan draws its benches in; empty until it is loaded,
   *  and empty for good if it cannot be. */
  protected readonly planColors = signal<string[]>([]);

  /** Set when an existing area is being edited. */
  protected readonly editing = signal<Area | null>(null);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);

  protected readonly model = signal<AreaFormValue>({
    name: '',
    color: DEFAULT_COLOR,
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

  /**
   * The colour in the three channels the sliders set.
   *
   * Derived from the stored value rather than kept beside it: the value is what
   * gets saved, and a second copy would be the one that disagrees with it. So a
   * colour picked from the plan moves the sliders too — it arrives as `rgb(…)`
   * and is converted for them.
   */
  protected readonly channels = computed<Oklch>(
    () => toOklch(this.model().color) ?? { ...RECOMMENDED, h: 0 },
  );

  /**
   * The rails, painted in what they set: the hue rail runs through all hues at
   * the chosen lightness and chroma, the other two along their own channel. So
   * the sliders show what they will do before they are touched, and grey stays
   * grey on the hue rail rather than pretending to be a rainbow.
   *
   * The hue rail is one gradient between two identical colours, and `longer hue`
   * is what makes that a full circle instead of a single colour: it sends the
   * interpolation the long way round, which from a hue to itself is all 360°.
   * Stops every 60° would do it too and would be wrong in a way that is easy to
   * miss — between them the interpolation runs on the chord through the colour
   * circle rather than along its arc, so the chroma sags to 0.087 of the 0.1 it
   * claims at every second stop. Interpolating in oklch keeps the two channels
   * that are not being shown exactly where they are set.
   */
  protected readonly hueRail = computed(() => {
    const { l, c } = this.channels();
    const start = formatOklch({ l, c, h: RANGE.h.min });

    return `linear-gradient(to right in oklch longer hue, ${start}, ${start})`;
  });

  protected readonly chromaRail = computed(() => {
    const { l, h } = this.channels();

    return this.rail((c) => formatOklch({ l, c, h }), RANGE.c);
  });

  protected readonly lightnessRail = computed(() => {
    const { c, h } = this.channels();

    return this.rail((l) => formatOklch({ l, c, h }), RANGE.l);
  });

  /** The plan's colours, each with the key its ring is decided by — see
   *  `colorKey`. Computed once per row instead of per comparison. */
  protected readonly swatches = computed(() =>
    this.planColors().map((color) => ({ color, key: colorKey(color) })),
  );

  protected readonly chosenKey = computed(() => colorKey(this.model().color));

  /** Where the mark for the recommended value sits, as a percentage of its rail. */
  protected readonly chromaMark = percentOf(RECOMMENDED.c, RANGE.c);
  protected readonly lightnessMark = percentOf(RECOMMENDED.l, RANGE.l);

  /** The two single-channel rails. In oklch as well, so that a rail from chroma 0
   *  keeps its hue instead of losing it on the way through the grey axis. */
  private rail(at: (value: number) => string, range: { min: number; max: number }): string {
    return `linear-gradient(to right in oklch, ${at(range.min)}, ${at(range.max)})`;
  }

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

    // The floor plan, for the row of colours it draws its benches in. Its own
    // colours and not the palette's: an area whose colour is the one the plan
    // already uses is invisible on the map as an overwrite, which is what one
    // wants where the two agree. A plan that will not load costs the row and
    // nothing else.
    this.plans.read().subscribe({
      next: (svg) => this.planColors.set(planPalette(svg)),
      error: () => this.planColors.set([]),
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

  /**
   * A slider was moved.
   *
   * What is written is always a whole `oklch(…)` and never a single channel: the
   * field holds one colour, and the sliders are three views of it.
   */
  protected setChannel(channel: keyof Oklch, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);

    this.pick(formatOklch({ ...this.channels(), [channel]: value }));
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

/** Where a value sits on its rail, for the mark that names the recommendation. */
function percentOf(value: number, range: { min: number; max: number }): number {
  return ((value - range.min) / (range.max - range.min)) * 100;
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
