import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { forkJoin, map } from 'rxjs';

import { ApiConfiguration } from '../api/api-configuration';
import { getConfig, listAreas, listBookings, listWorkplaces } from '../api/functions';
import { Area, Booking, Config, Workplace } from '../api/models';
import { SessionService } from '../shared/session-service';
import { TimeAxis, buildTimeAxis } from './time-axis';

/** A day as the calendar needs it: a local date with no time component. */
export type IsoDate = string;

/**
 * The calendar's zoom level. It determines which days get loaded.
 *
 * `month` belongs to the single-workplace view: there one workplace fills the
 * view and one day fills each row, so a whole month fits.
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

  /** The days being shown — one in the day view, seven in the week, all in the month. */
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

  /** One source for the role: the SessionService the login bar uses too. */
  readonly canManageBookings = this.sessionService.canManageBookings;
  readonly canManageBookingSeries = this.sessionService.canManageBookingSeries;
  readonly noTimeRestrictions = this.sessionService.noTimeRestrictions;
  readonly isAnonymous = this.sessionService.isAnonymous;

  /** The time axis derived from the configured opening hours. */
  readonly axis = computed<TimeAxis | null>(() => {
    const config = this.config();

    return config ? buildTimeAxis(config.opensAt, config.closesAt) : null;
  });

  readonly workplaceById = computed(
    () => new Map(this.workplaces().map((workplace) => [workplace.id, workplace])),
  );

  /** A workplace's name, falling back to its identifier. */
  readonly nameOf = computed(() => {
    const byId = this.workplaceById();

    return (workplaceId: string) => byId.get(workplaceId)?.name ?? workplaceId;
  });

  /** Workplaces in the order of their areas, with a group heading. */
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

  /** Bookings per workplace — the workplace's own. */
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
   * Blockages per workplace: bookings on *other* workplaces that also occupy this
   * one. They appear as grey blocks.
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

  /** Loads master data and bookings for the period being shown. */
  load(): void {
    this.loading.set(true);
    this.error.set(null);

    const days = this.days();
    // The API returns every booking that *overlaps* the window. An overnight
    // booking from the previous day therefore comes along without the range
    // having to be widened here as a precaution.
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

  /** One paging step in the zoom level's unit: day, week or month. */
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
   * One month on, keeping the day of the month.
   *
   * Computed via the first of the target month: `setMonth` alone would push 31
   * January to 3 March, and the view would jump a month too far.
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
 * The seven days of the week the date falls in — Monday first.
 *
 * `getDay()` counts from Sunday; shifting by six moves Sunday to the end of its
 * week rather than to the start of the next one.
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
 * All days of the month the date falls in.
 *
 * Computed via midday like `weekOf`: on a day with a DST change the step across
 * midnight would be 23 or 25 hours long and would land on the previous day.
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

/** The local date as an ISO day — toISOString() alone would convert to UTC. */
export function isoDate(date: Date): IsoDate {
  const offset = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
