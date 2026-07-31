import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { forkJoin, map } from 'rxjs';

import { ApiConfiguration } from '../api/api-configuration';
import { getConfig, getSession, listAreas, listBookings, listWorkplaces } from '../api/functions';
import { Area, Booking, Config, Session, Workplace } from '../api/models';

/** Ein Tag, wie ihn der Kalender braucht: lokales Datum ohne Zeitanteil. */
export type IsoDate = string;

@Injectable({ providedIn: 'root' })
export class CalendarStore {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = inject(ApiConfiguration).rootUrl;

  readonly date = signal<IsoDate>(todayIso());
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly config = signal<Config | null>(null);
  readonly session = signal<Session | null>(null);
  readonly areas = signal<Area[]>([]);
  readonly workplaces = signal<Workplace[]>([]);
  readonly bookings = signal<Booking[]>([]);

  /** Darf die aktuelle Rolle Buchungen anlegen und ändern? */
  readonly canManageBookings = computed(
    () => this.session()?.permissions.manageBookings ?? false,
  );

  readonly workplaceById = computed(
    () => new Map(this.workplaces().map((workplace) => [workplace.id, workplace])),
  );

  /** Arbeitsplätze in der Reihenfolge der Bereiche, mit Gruppenkopf. */
  readonly rows = computed(() => {
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

  /** Buchungen je Arbeitsplatz — die eigenen. */
  readonly bookingsByWorkplace = computed(() => {
    const map = new Map<string, Booking[]>();

    for (const booking of this.bookings()) {
      const list = map.get(booking.workplaceId) ?? [];
      list.push(booking);
      map.set(booking.workplaceId, list);
    }

    return map;
  });

  /**
   * Blockierungen je Arbeitsplatz: Buchungen auf *anderen* Plätzen, die diesen
   * hier mitbelegen. Sie erscheinen als graue Blöcke.
   */
  readonly blockagesByWorkplace = computed(() => {
    const map = new Map<string, Booking[]>();

    for (const booking of this.bookings()) {
      for (const blockedId of booking.blockedWorkplaceIds) {
        const list = map.get(blockedId) ?? [];
        list.push(booking);
        map.set(blockedId, list);
      }
    }

    return map;
  });

  /** Lädt Stammdaten und Buchungen für den gewählten Tag. */
  load(): void {
    this.loading.set(true);
    this.error.set(null);

    const date = this.date();
    // Grosszügiges Fenster: eine über Nacht laufende Buchung des Vortags ragt in
    // diesen Tag hinein und muss mitkommen.
    const from = new Date(`${date}T00:00:00`);
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);

    forkJoin({
      config: getConfig(this.http, this.rootUrl).pipe(map((r) => r.body)),
      session: getSession(this.http, this.rootUrl).pipe(map((r) => r.body)),
      areas: listAreas(this.http, this.rootUrl).pipe(map((r) => r.body)),
      workplaces: listWorkplaces(this.http, this.rootUrl).pipe(map((r) => r.body)),
      bookings: listBookings(this.http, this.rootUrl, {
        from: from.toISOString(),
        to: to.toISOString(),
      }).pipe(map((r) => r.body)),
    }).subscribe({
      next: ({ config, session, areas, workplaces, bookings }) => {
        this.config.set(config);
        this.session.set(session);
        this.areas.set(areas);
        this.workplaces.set(workplaces);
        this.bookings.set(bookings);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(err instanceof Error ? err.message : 'Laden fehlgeschlagen.');
        this.loading.set(false);
      },
    });
  }

  goToToday(): void {
    this.date.set(todayIso());
    this.load();
  }

  /** Springt auf morgen — unabhängig davon, welcher Tag gerade offen ist. */
  goToTomorrow(): void {
    const tomorrow = new Date(`${todayIso()}T12:00:00`);
    tomorrow.setDate(tomorrow.getDate() + 1);
    this.date.set(isoOf(tomorrow));
    this.load();
  }

  shiftDays(days: number): void {
    const next = new Date(`${this.date()}T12:00:00`);
    next.setDate(next.getDate() + days);
    this.date.set(isoOf(next));
    this.load();
  }
}

export function todayIso(): IsoDate {
  return isoOf(new Date());
}

/** Lokales Datum als ISO-Tag — toISOString() allein würde in UTC umrechnen. */
function isoOf(date: Date): IsoDate {
  const offset = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
