import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { Workplace } from '../api/models';
import { refinePageTitle } from '../shared/page-title';
import { Block, blocksFor } from './blocks';
import { CalendarStore, IsoDate, isoDate } from './calendar-store';
import { CalendarToolbar } from './calendar-toolbar';
import { syncDateWithUrl } from './date-in-url';
import { DayTrack } from './day-track';
import { percentOfAxis } from './time-axis';
import { WorkplaceLabel } from './workplace-label';

/** One day column of the week, fully labelled. */
interface WeekDay {
  date: IsoDate;
  /** "Mo" */
  weekday: string;
  /** "27. Juli" */
  label: string;
  isWeekend: boolean;
  isToday: boolean;
}

/**
 * The calendar at week resolution: seven day cells per workplace.
 *
 * Every cell is the same `app-day-track` as in the day view, only narrow — the
 * bars sit in it to scale across the opening hours of *that* day. An overnight
 * booking therefore appears in both day cells.
 *
 * Booking does not happen here: at roughly a hundred pixels for thirteen hours a
 * quarter hour would not be two pixels wide, and a click would never hit what was
 * meant. It therefore opens the day in the day view.
 *
 * It follows that every cell is clickable: paging is not booking. Someone who is
 * not logged in reaches the day here just as a member does, and a broken
 * workplace is no reason to refuse to show its day. Whether anything can be
 * created there is the day view's business.
 */
@Component({
  selector: 'app-week-calendar',
  imports: [CalendarToolbar, DayTrack, WorkplaceLabel],
  templateUrl: './week-calendar.html',
  styleUrl: './week-calendar.scss',
})
export class WeekCalendar {
  protected readonly store = inject(CalendarStore);
  private readonly router = inject(Router);

  protected readonly now = signal(new Date());

  constructor() {
    this.store.span.set('week');
    syncDateWithUrl();
    this.store.load();

    // "Woche" in front, because a range alone in the tab does not say which zoom
    // level is open — on the page the view itself does that.
    refinePageTitle(() => `Woche ${this.heading()}`);

    setInterval(() => this.now.set(new Date()), 60_000);
  }

  protected readonly days = computed<WeekDay[]>(() => {
    // Today is highlighted, not the date being shown: when paging, the same
    // weekday would otherwise be blue in every week without anything being
    // special about it.
    const today = isoDate(this.now());

    return this.store.days().map((date) => {
      const day = new Date(`${date}T12:00:00`);

      return {
        date,
        weekday: day.toLocaleDateString('de-CH', { weekday: 'short' }),
        label: day.toLocaleDateString('de-CH', { day: 'numeric', month: 'long' }),
        isWeekend: day.getDay() === 0 || day.getDay() === 6,
        isToday: date === today,
      };
    });
  });

  /**
   * The day under the pointer. The whole column is highlighted rather than just
   * the cell beneath it — the click opens the day with all workplaces, and that is
   * exactly what the column indicates.
   */
  protected readonly hoveredDay = signal<IsoDate | null>(null);

  /** "27. – 31. Juli 2026", spelled out across a change of month. */
  protected readonly heading = computed(() => {
    const days = this.store.days();
    const first = new Date(`${days[0]}T12:00:00`);
    const last = new Date(`${days.at(-1)}T12:00:00`);

    if (first.getFullYear() !== last.getFullYear()) {
      return `${format(first, { day: 'numeric', month: 'long', year: 'numeric' })} – ${format(last, { day: 'numeric', month: 'long', year: 'numeric' })}`;
    }

    const from =
      first.getMonth() === last.getMonth()
        ? `${first.getDate()}.`
        : format(first, { day: 'numeric', month: 'long' });

    return `${from} – ${format(last, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  });

  /**
   * The bars per workplace and day, computed once. A block is built exactly as in
   * the day view — only seven times over, each clipped to its own day.
   */
  private readonly blocksByCell = computed(() => {
    const axis = this.store.axis();
    const map = new Map<string, Block[]>();

    if (!axis) {
      return map;
    }

    const nameOf = this.store.nameOf();
    const bookings = this.store.bookingsByWorkplace();
    const blockages = this.store.blockagesByWorkplace();

    for (const group of this.store.rows()) {
      for (const workplace of group.workplaces) {
        for (const date of this.store.days()) {
          const context = {
            axis,
            day: new Date(`${date}T12:00:00`),
            workplaceName: workplace.name,
            color: group.area.color,
            nameOf,
          };

          map.set(
            cellKey(workplace.id, date),
            blocksFor(context, bookings.get(workplace.id) ?? [], blockages.get(workplace.id) ?? []),
          );
        }
      }
    }

    return map;
  });

  protected blocks(workplace: Workplace, date: IsoDate): Block[] {
    return this.blocksByCell().get(cellKey(workplace.id, date)) ?? [];
  }

  /** The now-line stands in today's column — nowhere else. */
  protected readonly nowMark = computed<{ column: number; percent: number } | null>(() => {
    const axis = this.store.axis();
    const now = this.now();

    if (!axis) {
      return null;
    }

    const index = this.store.days().indexOf(isoDate(now));
    const percent = index < 0 ? null : percentOfAxis(axis, now.getHours() * 60 + now.getMinutes());

    return percent === null ? null : { column: index + 1, percent };
  });

  protected openDay(date: IsoDate): void {
    this.router.navigate(['/tag'], { queryParams: { datum: date } });
  }

  protected onDateChange(value: string): void {
    this.store.date.set(value);
    this.store.load();
  }
}

function cellKey(workplaceId: string, date: IsoDate): string {
  return `${workplaceId}|${date}`;
}

function format(date: Date, options: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString('de-CH', options);
}
