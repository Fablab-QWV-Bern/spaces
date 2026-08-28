import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { refinePageTitle } from '../shared/page-title';
import { Block, blocksFor } from './blocks';
import { leadTimeNotice } from './booking-horizon';
import { CalendarStore, IsoDate, isoDate } from './calendar-store';
import { CalendarToolbar } from './calendar-toolbar';
import { pageWithArrowKeys } from './arrow-key-paging';
import { syncDateWithUrl } from './date-in-url';
import { DayTrack, SIGN_IN_NOTICE } from './day-track';
import { HourHeader } from './hour-header';
import { DEFAULT_DURATION_MINUTES, instantAt, percentOfAxis, toLocalIso } from './time-axis';

/** One day row of the month, fully labelled. */
interface DayRow {
  date: IsoDate;
  /** "Mo., 27. Juli" */
  label: string;
  isWeekend: boolean;
  isToday: boolean;
}

/**
 * The calendar of a single workplace: one month, one day per row.
 *
 * Compared with the day view only the axes are swapped — there one day spans all
 * workplaces, here one workplace spans all days of the month. The cells are the
 * same `app-day-track` at the same scale, which is why booking works here just as
 * it does in the day view.
 *
 * There is no zoom level: the view *is* the month. The way in is the name in a
 * workplace row, the way back the "Alle Arbeitsplätze" button in the header. The
 * workplace lives in the address bar, from where this view reads it — the address
 * is the single source, otherwise there would be two that could drift apart.
 */
@Component({
  selector: 'app-workplace-calendar',
  imports: [CalendarToolbar, DayTrack, HourHeader],
  templateUrl: './workplace-calendar.html',
  styleUrl: './workplace-calendar.scss',
})
export class WorkplaceCalendar {
  protected readonly store = inject(CalendarStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly now = signal(new Date());

  /** Length of the preview under the pointer — as in the day view. */
  protected readonly previewMinutes = DEFAULT_DURATION_MINUTES;

  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  protected readonly workplaceId = computed(() => this.queryParams().get('arbeitsplatz'));

  constructor() {
    this.store.span.set('month');
    syncDateWithUrl();
    pageWithArrowKeys();
    this.store.load();

    // Without a workplace only the month would remain of the title — and in the
    // tab that would look like a month view, which does not exist. Better the
    // route's title then.
    refinePageTitle(() => (this.selection() ? this.heading() : null));

    setInterval(() => this.now.set(new Date()), 60_000);
  }

  /**
   * "Werkbank / Juli 2026". The name is in the heading because nothing else names
   * it any more: the way here is a click on a workplace row. As long as none is
   * determined, the month stands alone.
   */
  protected readonly heading = computed(() => {
    const month = new Date(`${this.store.date()}T12:00:00`).toLocaleDateString('de-CH', {
      month: 'long',
      year: 'numeric',
    });

    const selection = this.selection();

    return selection ? `${selection.workplace.name} / ${month}` : month;
  });

  protected readonly days = computed<DayRow[]>(() => {
    const today = isoDate(this.now());

    return this.store.days().map((date) => {
      const day = new Date(`${date}T12:00:00`);

      return {
        date,
        label: day.toLocaleDateString('de-CH', {
          weekday: 'short',
          day: 'numeric',
          month: 'long',
        }),
        isWeekend: day.getDay() === 0 || day.getDay() === 6,
        isToday: date === today,
      };
    });
  });

  /**
   * The selected workplace together with its area, or null while none is selected
   * or the identifier matches none.
   */
  protected readonly selection = computed(() => {
    const workplaceId = this.workplaceId();

    for (const group of this.store.rows()) {
      const workplace = group.workplaces.find((candidate) => candidate.id === workplaceId);

      if (workplace) {
        return { workplace, area: group.area };
      }
    }

    return null;
  });

  /** The bars per day, computed once — as in the other zoom levels. */
  private readonly blocksByDay = computed(() => {
    const axis = this.store.axis();
    const selection = this.selection();
    const map = new Map<IsoDate, Block[]>();

    if (!axis || !selection) {
      return map;
    }

    const { workplace, area } = selection;
    const nameOf = this.store.nameOf();
    const bookings = this.store.bookingsByWorkplace().get(workplace.id) ?? [];
    const blockages = this.store.blockagesByWorkplace().get(workplace.id) ?? [];

    for (const date of this.store.days()) {
      const context = {
        axis,
        day: new Date(`${date}T12:00:00`),
        workplaceName: workplace.name,
        color: area.color,
        nameOf,
      };

      map.set(date, blocksFor(context, bookings, blockages));
    }

    return map;
  });

  protected blocks(date: IsoDate): Block[] {
    return this.blocksByDay().get(date) ?? [];
  }

  /**
   * The now-line's position on the axis. It is only drawn in today's row — the
   * other rows are other days.
   */
  protected readonly nowPercent = computed<number | null>(() => {
    const axis = this.store.axis();
    const now = this.now();

    return axis ? percentOfAxis(axis, now.getHours() * 60 + now.getMinutes()) : null;
  });

  protected readonly isBookable = computed(() => {
    const selection = this.selection();

    return selection?.workplace.status === 'OK' && this.store.canManageBookings();
  });

  /**
   * The notice per day that still lies beyond the booking horizon — otherwise
   * null.
   *
   * Unlike in the day view, a whole month stands one row under the other here, so
   * the notice names a different date in every row. The sentences are built once
   * rather than on every change detection pass; otherwise the binding in the
   * template would see new strings across thirty-one rows every time.
   */
  private readonly noticeByDay = computed(() => {
    const config = this.store.config();
    const selection = this.selection();
    const map = new Map<IsoDate, string | null>();

    if (!config || !selection || !this.isBookable()) {
      return map;
    }

    const unrestricted = this.store.noTimeRestrictions();

    for (const date of this.store.days()) {
      map.set(date, leadTimeNotice(config, selection.area, unrestricted, date));
    }

    return map;
  });

  /**
   * Why a click in this row creates nothing — as in the day view.
   *
   * The anonymous role sees the login instead of the horizon: when this day would
   * be released helps nobody who needs a password first. It is only stated on a
   * workplace with status OK — otherwise it would be a promise the login does not
   * keep.
   */
  protected notice(date: IsoDate): string | null {
    if (this.selection()?.workplace.status !== 'OK') {
      return null;
    }

    if (this.store.isAnonymous()) {
      return SIGN_IN_NOTICE;
    }

    return this.noticeByDay().get(date) ?? null;
  }

  protected clickable(date: IsoDate): boolean {
    return this.isBookable() && this.notice(date) === null;
  }

  protected onSlotClick(date: IsoDate, minutes: number): void {
    const selection = this.selection();

    if (!selection) {
      return;
    }

    void this.router.navigate(['/buchen'], {
      queryParams: {
        workplace: selection.workplace.id,
        start: toLocalIso(instantAt(date, minutes)),
        from: this.router.url,
      },
    });
  }

  protected onDateChange(value: string): void {
    this.store.date.set(value);
    this.store.load();
  }
}
