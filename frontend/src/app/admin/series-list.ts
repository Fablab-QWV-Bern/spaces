import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, map } from 'rxjs';

import { ApiConfiguration } from '../api/api-configuration';
import { deleteBookingSeries, listBookingSeries, listWorkplaces } from '../api/functions';
// Umbenannt, damit das generierte Modell das globale Error nicht verdeckt.
import { BookingSeries, Error as ApiError } from '../api/models';
import { SessionService } from '../shared/session-service';
import { AdminHeader } from './admin-header';
import { describeRhythm } from './series-rhythm';

@Component({
  selector: 'app-series-list',
  imports: [AdminHeader, RouterLink],
  templateUrl: './series-list.html',
  styleUrl: './series-list.scss',
})
export class SeriesList {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = inject(ApiConfiguration).rootUrl;
  protected readonly session = inject(SessionService);

  protected readonly series = signal<BookingSeries[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  private readonly workplaceNames = signal(new Map<string, string>());

  protected readonly describeRhythm = describeRhythm;

  constructor() {
    this.load();
  }

  protected readonly empty = computed(() => !this.loading() && this.series().length === 0);

  protected workplaceName(series: BookingSeries): string {
    return this.workplaceNames().get(series.workplaceId) ?? series.workplaceId;
  }

  /** „ab 03.08.2026" und, wenn es eines gibt, das Ende. */
  protected period(series: BookingSeries): string {
    const from = formatDate(series.firstInstanceStart.slice(0, 10));

    return series.endDate ? `${from} – ${formatDate(series.endDate)}` : `ab ${from}`;
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      session: this.session.load(),
      series: listBookingSeries(this.http, this.rootUrl).pipe(map((r) => r.body)),
      // Auch die ausgeblendeten: eine Serie kann auf einem Arbeitsplatz liegen,
      // der inzwischen nicht mehr buchbar ist, und braucht dort erst recht einen
      // Namen statt einer Kennung.
      workplaces: listWorkplaces(this.http, this.rootUrl, { includeDisabled: true }).pipe(
        map((r) => r.body),
      ),
    }).subscribe({
      next: ({ series, workplaces }) => {
        this.series.set(series);
        this.workplaceNames.set(new Map(workplaces.map((entry) => [entry.id, entry.name])));
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Die Serien liessen sich nicht laden.');
        this.loading.set(false);
      },
    });
  }

  protected remove(series: BookingSeries): void {
    // Nennt vor allem, was bleibt: das ist die beruhigende Hälfte und die wahre.
    const confirmed = confirm(
      `Serie „${series.name}“ wirklich löschen?\n\n` +
        'Alle künftigen Termine verschwinden mit ihr. Vergangene und laufende ' +
        'bleiben als gewöhnliche Buchungen bestehen.',
    );

    if (!confirmed) {
      return;
    }

    this.error.set(null);

    deleteBookingSeries(this.http, this.rootUrl, { id: series.id }).subscribe({
      next: () => this.load(),
      error: (response: HttpErrorResponse) =>
        this.error.set(
          (response.error as ApiError | null)?.message ?? 'Die Serie liess sich nicht löschen.',
        ),
    });
  }
}

function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('de-CH');
}
