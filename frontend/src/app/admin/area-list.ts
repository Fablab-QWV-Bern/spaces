import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, map } from 'rxjs';

import { ApiConfiguration } from '../api/api-configuration';
import { deleteArea, listAreas, listWorkplaces, reorderAreas } from '../api/functions';
// Renamed so that the generated model does not shadow the global Error.
import { Area, Error as ApiError } from '../api/models';
import { formatDuration } from '../calendar/time-axis';
import { DragOrder } from '../shared/drag-order';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-area-list',
  imports: [DragOrder, Icon, RouterLink],
  templateUrl: './area-list.html',
  styleUrl: './area-list.scss',
})
export class AreaList {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = inject(ApiConfiguration).rootUrl;

  protected readonly areas = signal<Area[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /** The order as it stands in the backend — what dragging is measured against. */
  private readonly savedOrder = signal<string[]>([]);
  protected readonly savingOrder = signal(false);

  protected readonly order = computed(() => this.areas().map((area) => area.id));

  protected readonly orderChanged = computed(() =>
    this.order().some((id, position) => id !== this.savedOrder()[position]),
  );

  /** How many workplaces hang off the area — a full one cannot be deleted. */
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
      areas: listAreas(this.http, this.rootUrl).pipe(map((r) => r.body)),
      // Including the hidden ones, otherwise an area would look empty even
      // though deletion fails because of them.
      workplaces: listWorkplaces(this.http, this.rootUrl, { includeDisabled: true }).pipe(
        map((r) => r.body),
      ),
    }).subscribe({
      next: ({ areas, workplaces }) => {
        this.setAreas(areas);

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

  /** Dragged: only the display changes, saving is a step of its own. */
  protected rearrange(ids: string[]): void {
    const byId = new Map(this.areas().map((area) => [area.id, area]));

    this.areas.set(ids.map((id) => byId.get(id)).filter((area) => area !== undefined));
  }

  protected saveOrder(): void {
    this.savingOrder.set(true);
    this.error.set(null);

    reorderAreas(this.http, this.rootUrl, { body: { ids: this.order() } }).subscribe({
      next: (response) => {
        // The answer already carries the new order — reading it back saves a
        // second request and shows what really got saved.
        this.setAreas(response.body);
        this.savingOrder.set(false);
      },
      error: (response: HttpErrorResponse) => {
        this.savingOrder.set(false);
        this.error.set(
          (response.error as ApiError | null)?.message ??
            'Die Reihenfolge liess sich nicht speichern.',
        );
      },
    });
  }

  protected discardOrder(): void {
    this.rearrange(this.savedOrder());
  }

  private setAreas(areas: Area[]): void {
    this.areas.set(areas);
    this.savedOrder.set(areas.map((area) => area.id));
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
