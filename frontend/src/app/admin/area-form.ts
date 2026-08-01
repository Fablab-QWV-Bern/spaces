import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, map, of } from 'rxjs';

import { ApiConfiguration } from '../api/api-configuration';
import { createArea, getArea, updateArea } from '../api/functions';
// Umbenannt, damit das generierte Modell das globale Error nicht verdeckt.
import { Area, AreaWrite, Error as ApiError } from '../api/models';
import { formatDuration } from '../calendar/time-axis';
import { SessionService } from '../shared/session-service';
import { AdminHeader } from './admin-header';

/**
 * Der Formularzustand. Zahlen liegen als Strings vor — das ist es, was ein
 * `<input>` liefert; umgerechnet wird erst beim Speichern.
 */
interface AreaFormValue {
  name: string;
  color: string;
  maxBookingDurationMinutes: string;
  /** Getrennt vom Wert, damit "es gilt der globale Vorlauf" ankreuzbar ist. */
  useGlobalOffset: boolean;
  maxBookingEndOffsetDays: string;
  allowNightlyActivities: boolean;
  sortOrder: string;
}

/**
 * Die Farben der Bereiche unterscheiden sich nur im Farbton, nicht in Helligkeit
 * und Sättigung — deshalb eine Reihe fertiger Farbtöne statt eines freien
 * Farbwählers. So bleiben die Balken im Kalender untereinander lesbar.
 */
const HUES = [20, 70, 130, 170, 230, 280, 320, 350];

const SWATCHES = [...HUES.map((hue) => `oklch(0.8 0.1 ${hue})`), 'oklch(0.8 0 0)'];

@Component({
  selector: 'app-area-form',
  imports: [AdminHeader, FormField],
  templateUrl: './area-form.html',
  styleUrl: './area-form.scss',
})
export class AreaForm {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = inject(ApiConfiguration).rootUrl;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly session = inject(SessionService);

  protected readonly swatches = SWATCHES;

  /** Gesetzt, wenn ein bestehender Bereich bearbeitet wird. */
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
    sortOrder: '0',
  });

  /** Wie im Buchungsformular: nur Pflichtfelder hier, alles Weitere im Backend. */
  protected readonly areaForm = form(this.model, (path) => {
    required(path.name, { message: 'Bitte einen Namen angeben.' });
    required(path.color, { message: 'Bitte eine Farbe wählen.' });
  });

  protected readonly heading = computed(() =>
    this.editing() ? 'Bereich bearbeiten' : 'Neuer Bereich',
  );

  /** Die eingegebene Dauer in Klartext — 240 sagt weniger als "4 Stunden". */
  protected readonly durationLabel = computed(() => {
    const minutes = Number(this.model().maxBookingDurationMinutes);

    return Number.isFinite(minutes) && minutes >= 15 ? formatDuration(minutes) : '';
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');

    forkJoin({
      session: this.session.load(),
      area: id ? getArea(this.http, this.rootUrl, { id }).pipe(map((r) => r.body)) : of(null),
    }).subscribe({
      next: ({ area }) => {
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
    sortOrder: String(area.sortOrder),
  };
}

function toWrite(value: AreaFormValue): AreaWrite {
  return {
    name: value.name.trim(),
    color: value.color.trim(),
    maxBookingDurationMinutes: Number(value.maxBookingDurationMinutes),
    maxBookingEndOffsetDays: value.useGlobalOffset ? null : Number(value.maxBookingEndOffsetDays),
    allowNightlyActivities: value.allowNightlyActivities,
    sortOrder: Number(value.sortOrder),
  };
}
