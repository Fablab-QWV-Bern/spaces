import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, map } from 'rxjs';

import { ApiConfiguration } from '../api/api-configuration';
import { deleteArea, listAreas, listWorkplaces } from '../api/functions';
// Umbenannt, damit das generierte Modell das globale Error nicht verdeckt.
import { Area, Error as ApiError } from '../api/models';
import { formatDuration } from '../calendar/time-axis';
import { SessionService } from '../shared/session-service';
import { AdminHeader } from './admin-header';

@Component({
  selector: 'app-area-list',
  imports: [AdminHeader, RouterLink],
  templateUrl: './area-list.html',
  styleUrl: './area-list.scss',
})
export class AreaList {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = inject(ApiConfiguration).rootUrl;
  protected readonly session = inject(SessionService);

  protected readonly areas = signal<Area[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /** Wie viele Arbeitsplätze im Bereich hängen — ein voller lässt sich nicht löschen. */
  private readonly countByArea = signal(new Map<string, number>());

  protected readonly formatDuration = formatDuration;

  constructor() {
    this.load();
  }

  protected count(area: Area): number {
    return this.countByArea().get(area.id) ?? 0;
  }

  protected readonly empty = computed(() => !this.loading() && this.areas().length === 0);

  private load(): void {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      session: this.session.load(),
      areas: listAreas(this.http, this.rootUrl).pipe(map((r) => r.body)),
      // Auch die ausgeblendeten, sonst sähe ein Bereich leer aus, obwohl das
      // Löschen daran scheitert.
      workplaces: listWorkplaces(this.http, this.rootUrl, { includeDisabled: true }).pipe(
        map((r) => r.body),
      ),
    }).subscribe({
      next: ({ areas, workplaces }) => {
        this.areas.set(areas);

        const counts = new Map<string, number>();

        for (const workplace of workplaces) {
          counts.set(workplace.areaId, (counts.get(workplace.areaId) ?? 0) + 1);
        }

        this.countByArea.set(counts);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Die Bereiche liessen sich nicht laden.');
        this.loading.set(false);
      },
    });
  }

  protected remove(area: Area): void {
    if (!confirm(`Bereich „${area.name}“ wirklich löschen?`)) {
      return;
    }

    this.error.set(null);

    deleteArea(this.http, this.rootUrl, { id: area.id }).subscribe({
      next: () => this.load(),
      error: (response: HttpErrorResponse) =>
        this.error.set(
          (response.error as ApiError | null)?.message ?? 'Der Bereich liess sich nicht löschen.',
        ),
    });
  }
}
