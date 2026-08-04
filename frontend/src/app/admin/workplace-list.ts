import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, map } from 'rxjs';

import { ApiConfiguration } from '../api/api-configuration';
import { deleteWorkplace, listAreas, listWorkplaces } from '../api/functions';
// Renamed so that the generated model does not shadow the global Error.
import { Area, Error as ApiError, Workplace } from '../api/models';
import { Icon } from '../shared/icon';
import { SessionService } from '../shared/session-service';
import { AdminHeader } from './admin-header';

@Component({
  selector: 'app-workplace-list',
  imports: [AdminHeader, Icon, RouterLink],
  templateUrl: './workplace-list.html',
  styleUrl: './workplace-list.scss',
})
export class WorkplaceList {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = inject(ApiConfiguration).rootUrl;
  protected readonly session = inject(SessionService);

  protected readonly areas = signal<Area[]>([]);
  protected readonly workplaces = signal<Workplace[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /** Grouped by area as in the calendar — that is how one finds a workplace again there. */
  protected readonly groups = computed(() => {
    const byArea = new Map<string, Workplace[]>();

    for (const workplace of this.workplaces()) {
      const list = byArea.get(workplace.areaId) ?? [];
      list.push(workplace);
      byArea.set(workplace.areaId, list);
    }

    return this.areas()
      .map((area) => ({ area, workplaces: byArea.get(area.id) ?? [] }))
      .filter((group) => group.workplaces.length > 0);
  });

  protected readonly empty = computed(() => !this.loading() && this.workplaces().length === 0);

  constructor() {
    this.load();
  }

  protected statusLabel(workplace: Workplace): string {
    return { OK: 'in Betrieb', DEFECT: 'defekt', DISABLED: 'ausgeblendet' }[workplace.status];
  }

  protected remove(workplace: Workplace): void {
    if (!confirm(`Arbeitsplatz „${workplace.name}“ wirklich löschen?`)) {
      return;
    }

    this.error.set(null);

    deleteWorkplace(this.http, this.rootUrl, { id: workplace.id }).subscribe({
      next: () => this.load(),
      error: (response: HttpErrorResponse) =>
        this.error.set(
          (response.error as ApiError | null)?.message ??
            'Der Arbeitsplatz liess sich nicht löschen.',
        ),
    });
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      session: this.session.load(),
      areas: listAreas(this.http, this.rootUrl).pipe(map((r) => r.body)),
      // The hidden ones belong here — this is the only place they can be brought
      // back into service.
      workplaces: listWorkplaces(this.http, this.rootUrl, { includeDisabled: true }).pipe(
        map((r) => r.body),
      ),
    }).subscribe({
      next: ({ areas, workplaces }) => {
        this.areas.set(areas);
        this.workplaces.set(workplaces);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Die Arbeitsplätze liessen sich nicht laden.');
        this.loading.set(false);
      },
    });
  }
}
