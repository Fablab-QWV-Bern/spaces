import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { forkJoin, map } from 'rxjs';

import { ApiConfiguration } from '../api/api-configuration';
import { listAreas, listWorkplaces } from '../api/functions';
import { Area, Workplace } from '../api/models';

interface WorkplaceGroup {
  area: Area;
  workplaces: Workplace[];
}

/**
 * "Schnittstellen": one place that gathers every way into the system that is not
 * the interface itself — the calendar subscription, the two embeddable widgets,
 * the API contract. Each of them existed before, scattered across a header link
 * and an icon in the workplace list; a reader looking for "how do I put today's
 * bookings on our website" had nowhere to look. Now there is a page whose whole
 * job is to answer that.
 *
 * The links point at backend-rendered pages and static files, all outside the
 * SPA — hence plain `href`s, opened in a new tab. The absolute URLs are spelled
 * out next to them so they can be copied into a calendar app or an `<iframe>`.
 *
 * The feed and the agenda take a workplace filter only. They accept an area one
 * too, but combined with a workplace it is an intersection — an empty calendar
 * when the two disagree — so the dropdown for it is deliberately left off. The
 * parameter name differs between them (`workplaceId` from the API spec, German
 * `arbeitsplatz` for the widgets), so each URL is built from its own.
 */
@Component({
  selector: 'app-interfaces',
  templateUrl: './interfaces.html',
  styleUrl: './interfaces.scss',
})
export class Interfaces {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = inject(ApiConfiguration).rootUrl;

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly groups = signal<WorkplaceGroup[]>([]);

  /** Where the site is served from — so the shown URLs are the ones to copy. */
  protected readonly origin = location.origin;
  private readonly host = location.host;

  // The calendar subscription, filtered by workplace (`workplaceId` per
  // spec/reservation-api.yml).
  protected readonly feedWorkplace = signal('');

  /** The `/api/calendar.ics` path with the chosen filter. */
  protected readonly feedPath = computed(() =>
    query('/api/calendar.ics', { workplaceId: this.feedWorkplace() }),
  );

  /**
   * `webcal:` rather than `https:`, so a click subscribes instead of downloading
   * a one-off file — the scheme is the whole difference between a subscription
   * and a snapshot. The plain URL beside it is for pasting.
   */
  protected readonly feedSubscribeUrl = computed(() => `webcal://${this.host}${this.feedPath()}`);

  // The embeddable agenda: same idea, German `arbeitsplatz`.
  protected readonly agendaWorkplace = signal('');

  protected readonly agendaPath = computed(() =>
    query('/agenda', { arbeitsplatz: this.agendaWorkplace() }),
  );

  // The per-workplace booking list: one workplace (required) and a row cap.
  protected readonly listWorkplace = signal('');

  /** Optional cap on the rows; a string, as every `<input>` delivers one. */
  protected readonly listMax = signal('');

  /**
   * The `/liste` URL for the current choice, or null while no workplace is
   * picked. A `max` that is not a positive whole number is simply left off — the
   * page defaults it, and the field is optional.
   */
  protected readonly listPath = computed(() => {
    const workplace = this.listWorkplace();

    if (!workplace) {
      return null;
    }

    const max = Number(this.listMax());

    return query('/liste', {
      arbeitsplatz: workplace,
      max: Number.isInteger(max) && max > 0 ? String(max) : '',
    });
  });

  constructor() {
    forkJoin({
      areas: listAreas(this.http, this.rootUrl).pipe(map((response) => response.body)),
      workplaces: listWorkplaces(this.http, this.rootUrl).pipe(map((response) => response.body)),
    }).subscribe({
      next: ({ areas, workplaces }) => {
        this.groups.set(this.group(areas, workplaces));
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Die Arbeitsplätze liessen sich nicht laden.');
        this.loading.set(false);
      },
    });
  }

  /** Grouped by area and in its order, as in the workplace list. */
  private group(areas: Area[], workplaces: Workplace[]): WorkplaceGroup[] {
    const byArea = new Map<string, Workplace[]>();

    for (const workplace of workplaces) {
      byArea.set(workplace.areaId, [...(byArea.get(workplace.areaId) ?? []), workplace]);
    }

    return areas
      .map((area) => ({ area, workplaces: byArea.get(area.id) ?? [] }))
      .filter((group) => group.workplaces.length > 0);
  }
}

/** A path with only the non-empty parameters appended. */
function query(path: string, params: Record<string, string>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }

  const rendered = search.toString();

  return rendered ? `${path}?${rendered}` : path;
}
