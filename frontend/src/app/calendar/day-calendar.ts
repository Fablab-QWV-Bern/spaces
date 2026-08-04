import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { Area, Workplace } from '../api/models';
import { refinePageTitle } from '../shared/page-title';
import { Block, blocksFor } from './blocks';
import { leadTimeNotice } from './booking-horizon';
import { CalendarStore, isoDate } from './calendar-store';
import { CalendarToolbar } from './calendar-toolbar';
import { syncDateWithUrl } from './date-in-url';
import { DayTrack, SIGN_IN_NOTICE } from './day-track';
import { HourHeader } from './hour-header';
import { DEFAULT_DURATION_MINUTES, instantAt, percentOfAxis, toLocalIso } from './time-axis';
import { WorkplaceLabel } from './workplace-label';

@Component({
  selector: 'app-day-calendar',
  imports: [CalendarToolbar, DayTrack, HourHeader, WorkplaceLabel],
  templateUrl: './day-calendar.html',
  styleUrl: './day-calendar.scss',
})
export class DayCalendar {
  protected readonly store = inject(CalendarStore);
  private readonly router = inject(Router);

  protected readonly now = signal(new Date());

  /** Length of the preview under the pointer — the same duration the form
   *  prefills after the click. */
  protected readonly previewMinutes = DEFAULT_DURATION_MINUTES;

  constructor() {
    this.store.span.set('day');
    syncDateWithUrl();
    this.store.load();

    // The tab shows what the heading shows — a calendar without a date is no
    // information at all.
    refinePageTitle(this.heading);

    // The now-line moves on every quarter hour; more often would say nothing on
    // a 15-minute grid.
    setInterval(() => this.now.set(new Date()), 60_000);
  }

  protected readonly heading = computed(() =>
    new Date(`${this.store.date()}T12:00:00`).toLocaleDateString('de-CH', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  );

  /** Position of the now-line, or null when today is not being shown. */
  protected readonly nowPercent = computed<number | null>(() => {
    const axis = this.store.axis();
    const now = this.now();

    if (!axis || this.store.date() !== isoDate(now)) {
      return null;
    }

    return percentOfAxis(axis, now.getHours() * 60 + now.getMinutes());
  });

  /**
   * The bars per workplace, computed once. As a method in the template they would
   * be rebuilt on every change detection pass.
   */
  private readonly blocksByWorkplace = computed(() => {
    const axis = this.store.axis();
    const map = new Map<string, Block[]>();

    if (!axis) {
      return map;
    }

    const day = new Date(`${this.store.date()}T12:00:00`);
    const nameOf = this.store.nameOf();
    const bookings = this.store.bookingsByWorkplace();
    const blockages = this.store.blockagesByWorkplace();

    for (const group of this.store.rows()) {
      for (const workplace of group.workplaces) {
        const context = {
          axis,
          day,
          workplaceName: workplace.name,
          color: group.area.color,
          nameOf,
        };

        map.set(
          workplace.id,
          blocksFor(context, bookings.get(workplace.id) ?? [], blockages.get(workplace.id) ?? []),
        );
      }
    }

    return map;
  });

  protected blocks(workplace: Workplace): Block[] {
    return this.blocksByWorkplace().get(workplace.id) ?? [];
  }

  /**
   * The notice per area when the day being shown lies beyond its booking horizon
   * — otherwise null. The text is built once per area rather than per change
   * detection pass, so that the binding in the template does not see a new string
   * on every run.
   */
  private readonly noticeByArea = computed(() => {
    const config = this.store.config();
    const date = this.store.date();
    const unrestricted = this.store.noTimeRestrictions();
    const map = new Map<string, string | null>();

    for (const group of this.store.rows()) {
      map.set(
        group.area.id,
        config ? leadTimeNotice(config, group.area, unrestricted, date) : null,
      );
    }

    return map;
  });

  /** Only where booking is actually possible is the area clickable. */
  protected isBookable(workplace: Workplace, area: Area): boolean {
    return (
      workplace.status === 'OK' &&
      this.store.canManageBookings() &&
      !this.noticeByArea().get(area.id)
    );
  }

  /**
   * Why a click here creates nothing — shown where the preview would otherwise
   * be.
   *
   * For the anonymous role the answer is always the same and it comes before the
   * horizon: someone who has to log in first can do nothing with the information
   * about when this day would be released. It is only stated where logging in
   * would actually lead to booking — on a broken workplace it would be a false
   * promise.
   *
   * Otherwise: only in rows that would be bookable anyway. Where nothing can be
   * created, information about the horizon would answer a question nobody asked.
   */
  protected notice(workplace: Workplace, area: Area): string | null {
    if (workplace.status !== 'OK') {
      return null;
    }

    if (this.store.isAnonymous()) {
      return SIGN_IN_NOTICE;
    }

    if (!this.store.canManageBookings()) {
      return null;
    }

    return this.noticeByArea().get(area.id) ?? null;
  }

  protected onSlotClick(workplace: Workplace, minutes: number): void {
    this.router.navigate(['/buchen'], {
      queryParams: {
        workplace: workplace.id,
        start: toLocalIso(instantAt(this.store.date(), minutes)),
        // Do not pass a duration: the form sets its own default.
      },
    });
  }

  protected onDateChange(value: string): void {
    this.store.date.set(value);
    this.store.load();
  }
}
