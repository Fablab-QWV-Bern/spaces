import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { forkJoin, map } from 'rxjs';

import { ApiConfiguration } from '../api/api-configuration';
import { getConfig, listAreas, listBookings, listWorkplaces } from '../api/functions';
import { Area, Booking, Config, Workplace } from '../api/models';
import { SessionService } from '../shared/session-service';
import { TimeAxis, buildTimeAxis } from './time-axis';

/** Ein Tag, wie ihn der Kalender braucht: lokales Datum ohne Zeitanteil. */
export type IsoDate = string;

/**
 * Die Zoomstufe des Kalenders. Sie bestimmt, welche Tage geladen werden.
 *
 * `month` gehört der Einzelansicht: dort steht ein Arbeitsplatz je Ansicht und
 * ein Tag je Zeile, deshalb hat ein ganzer Monat Platz.
 */
export type Span = 'day' | 'week' | 'month';

@Injectable({ providedIn: 'root' })
export class CalendarStore {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = inject(ApiConfiguration).rootUrl;
  private readonly sessionService = inject(SessionService);

  readonly date = signal<IsoDate>(todayIso());
  readonly span = signal<Span>('day');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /** Die dargestellten Tage — einer im Tag, sieben in der Woche, alle im Monat. */
  readonly days = computed<IsoDate[]>(() => {
    switch (this.span()) {
      case 'week':
        return weekOf(this.date());
      case 'month':
        return monthOf(this.date());
      default:
        return [this.date()];
    }
  });

  readonly config = signal<Config | null>(null);
  readonly areas = signal<Area[]>([]);
  readonly workplaces = signal<Workplace[]>([]);
  readonly bookings = signal<Booking[]>([]);

  /** Eine Quelle für die Rolle: der SessionService, den auch die Anmeldeleiste nutzt. */
  readonly canManageBookings = this.sessionService.canManageBookings;
  readonly canManageBookingSeries = this.sessionService.canManageBookingSeries;

  /** Die Zeitachse aus den konfigurierten Öffnungszeiten. */
  readonly axis = computed<TimeAxis | null>(() => {
    const config = this.config();

    return config ? buildTimeAxis(config.opensAt, config.closesAt) : null;
  });

  readonly workplaceById = computed(
    () => new Map(this.workplaces().map((workplace) => [workplace.id, workplace])),
  );

  /** Name eines Arbeitsplatzes, mit der Kennung als Rückfallebene. */
  readonly nameOf = computed(() => {
    const byId = this.workplaceById();

    return (workplaceId: string) => byId.get(workplaceId)?.name ?? workplaceId;
  });

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

  /** Lädt Stammdaten und Buchungen für den dargestellten Zeitraum. */
  load(): void {
    this.loading.set(true);
    this.error.set(null);

    const days = this.days();
    // Die API liefert jede Buchung, die das Fenster *überlappt*. Eine über Nacht
    // laufende Buchung des Vortags kommt darum mit, ohne dass der Rand hier
    // vorsorglich vergrössert werden müsste.
    const from = new Date(`${days[0]}T00:00:00`);
    const to = new Date(`${days.at(-1)}T00:00:00`);
    to.setDate(to.getDate() + 1);

    forkJoin({
      config: getConfig(this.http, this.rootUrl).pipe(map((r) => r.body)),
      session: this.sessionService.load(),
      areas: listAreas(this.http, this.rootUrl).pipe(map((r) => r.body)),
      workplaces: listWorkplaces(this.http, this.rootUrl).pipe(map((r) => r.body)),
      bookings: listBookings(this.http, this.rootUrl, {
        from: from.toISOString(),
        to: to.toISOString(),
      }).pipe(map((r) => r.body)),
    }).subscribe({
      next: ({ config, areas, workplaces, bookings }) => {
        this.config.set(config);
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

  /** Ein Blätterschritt in der Einheit der Zoomstufe: Tag, Woche oder Monat. */
  shift(steps: number): void {
    if (this.span() === 'month') {
      this.shiftMonths(steps);

      return;
    }

    this.shiftDays(steps * (this.span() === 'week' ? 7 : 1));
  }

  shiftDays(days: number): void {
    const next = new Date(`${this.date()}T12:00:00`);
    next.setDate(next.getDate() + days);
    this.date.set(isoDate(next));
    this.load();
  }

  /**
   * Ein Monat weiter, unter Beibehaltung des Tages im Monat.
   *
   * Gerechnet wird über den Ersten des Zielmonats: `setMonth` allein schöbe den
   * 31. Januar auf den 3. März, und die Ansicht spränge einen Monat zu weit.
   */
  private shiftMonths(steps: number): void {
    const current = new Date(`${this.date()}T12:00:00`);
    const target = new Date(current.getFullYear(), current.getMonth() + steps, 1, 12);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();

    target.setDate(Math.min(current.getDate(), lastDay));
    this.date.set(isoDate(target));
    this.load();
  }
}

/**
 * Die sieben Tage der Woche, in der das Datum liegt — Montag zuerst.
 *
 * `getDay()` zählt ab Sonntag; die Verschiebung um sechs rückt den Sonntag ans
 * Ende seiner Woche statt an den Anfang der nächsten.
 */
export function weekOf(date: IsoDate): IsoDate[] {
  const monday = new Date(`${date}T12:00:00`);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(day.getDate() + index);

    return isoDate(day);
  });
}

/**
 * Alle Tage des Monats, in dem das Datum liegt.
 *
 * Wie `weekOf` über Mittag gerechnet: an einem Tag mit Zeitumstellung wäre der
 * Schritt über Mitternacht 23 oder 25 Stunden lang und träfe den Vortag.
 */
export function monthOf(date: IsoDate): IsoDate[] {
  const day = new Date(`${date}T12:00:00`);
  day.setDate(1);

  const month = day.getMonth();
  const days: IsoDate[] = [];

  while (day.getMonth() === month) {
    days.push(isoDate(day));
    day.setDate(day.getDate() + 1);
  }

  return days;
}

export function todayIso(): IsoDate {
  return isoDate(new Date());
}

/** Lokales Datum als ISO-Tag — toISOString() allein würde in UTC umrechnen. */
export function isoDate(date: Date): IsoDate {
  const offset = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
