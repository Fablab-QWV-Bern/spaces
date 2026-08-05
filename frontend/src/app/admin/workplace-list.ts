import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, map } from 'rxjs';

import { ApiConfiguration } from '../api/api-configuration';
import { deleteWorkplace, listAreas, listWorkplaces, reorderWorkplaces } from '../api/functions';
// Renamed so that the generated model does not shadow the global Error.
import { Area, Error as ApiError, Workplace } from '../api/models';
import { DragOrder } from '../shared/drag-order';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-workplace-list',
  imports: [DragOrder, Icon, RouterLink],
  templateUrl: './workplace-list.html',
  styleUrl: './workplace-list.scss',
})
export class WorkplaceList {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = inject(ApiConfiguration).rootUrl;

  protected readonly areas = signal<Area[]>([]);
  protected readonly workplaces = signal<Workplace[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /** The order as it stands in the backend — what dragging is measured against. */
  private readonly savedOrder = signal<string[]>([]);
  protected readonly savingOrder = signal(false);

  protected readonly order = computed(() => this.workplaces().map((workplace) => workplace.id));

  protected readonly orderChanged = computed(() =>
    this.order().some((id, position) => id !== this.savedOrder()[position]),
  );

  /**
   * Grouped by area as in the calendar — that is how one finds a workplace again
   * there. Each group brings its ids along: they are what is dragged in, and one
   * group knows nothing of the next.
   */
  protected readonly groups = computed(() => {
    const byArea = new Map<string, Workplace[]>();

    for (const workplace of this.workplaces()) {
      const list = byArea.get(workplace.areaId) ?? [];
      list.push(workplace);
      byArea.set(workplace.areaId, list);
    }

    return this.areas()
      .map((area) => ({ area, workplaces: byArea.get(area.id) ?? [] }))
      .filter((group) => group.workplaces.length > 0)
      .map((group) => ({ ...group, ids: group.workplaces.map((workplace) => workplace.id) }));
  });

  protected readonly empty = computed(() => !this.loading() && this.workplaces().length === 0);

  constructor() {
    this.load();
  }

  protected statusLabel(workplace: Workplace): string {
    return { OK: 'in Betrieb', DEFECT: 'defekt', DISABLED: 'ausgeblendet' }[workplace.status];
  }

  /**
   * Dragged within one area: the group's workplaces take their new order, the
   * places of the other areas in the flat list stay where they are. Saving is a
   * step of its own.
   */
  protected rearrange(areaId: string, ids: string[]): void {
    const byId = new Map(this.workplaces().map((workplace) => [workplace.id, workplace]));
    const reordered = ids.map((id) => byId.get(id)).filter((workplace) => workplace !== undefined);

    let next = 0;

    this.workplaces.update((workplaces) =>
      workplaces.map((workplace) =>
        workplace.areaId === areaId ? (reordered[next++] ?? workplace) : workplace,
      ),
    );
  }

  protected saveOrder(): void {
    this.savingOrder.set(true);
    this.error.set(null);

    reorderWorkplaces(this.http, this.rootUrl, { body: { ids: this.order() } }).subscribe({
      next: (response) => {
        // The answer already carries the new order — reading it back saves a
        // second request and shows what really got saved.
        this.setWorkplaces(response.body);
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
    const byId = new Map(this.workplaces().map((workplace) => [workplace.id, workplace]));

    this.workplaces.set(
      this.savedOrder()
        .map((id) => byId.get(id))
        .filter((workplace) => workplace !== undefined),
    );
  }

  private setWorkplaces(workplaces: Workplace[]): void {
    this.workplaces.set(workplaces);
    this.savedOrder.set(workplaces.map((workplace) => workplace.id));
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
      areas: listAreas(this.http, this.rootUrl).pipe(map((r) => r.body)),
      // The hidden ones belong here — this is the only place they can be brought
      // back into service.
      workplaces: listWorkplaces(this.http, this.rootUrl, { includeDisabled: true }).pipe(
        map((r) => r.body),
      ),
    }).subscribe({
      next: ({ areas, workplaces }) => {
        this.areas.set(areas);
        this.setWorkplaces(workplaces);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Die Arbeitsplätze liessen sich nicht laden.');
        this.loading.set(false);
      },
    });
  }
}
