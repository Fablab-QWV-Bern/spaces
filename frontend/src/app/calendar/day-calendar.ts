import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { Workplace } from '../api/models';
import { Block, blocksFor } from './blocks';
import { CalendarStore, isoDate } from './calendar-store';
import { CalendarToolbar } from './calendar-toolbar';
import { syncDateWithUrl } from './date-in-url';
import { DayTrack } from './day-track';
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

  /** Länge der Vorschau unter dem Zeiger — dieselbe Dauer, die das Formular
   *  nach dem Klick voreinstellt. */
  protected readonly previewMinutes = DEFAULT_DURATION_MINUTES;

  constructor() {
    this.store.span.set('day');
    syncDateWithUrl();
    this.store.load();

    // Die Jetzt-Linie bewegt sich viertelstündlich weiter; häufiger wäre für ein
    // 15-Minuten-Raster ohne Aussage.
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

  /** Position der Jetzt-Linie, oder null wenn heute nicht dargestellt wird. */
  protected readonly nowPercent = computed<number | null>(() => {
    const axis = this.store.axis();
    const now = this.now();

    if (!axis || this.store.date() !== isoDate(now)) {
      return null;
    }

    return percentOfAxis(axis, now.getHours() * 60 + now.getMinutes());
  });

  /**
   * Die Balken je Arbeitsplatz, einmal berechnet. Als Methode im Template
   * würden sie bei jedem Change-Detection-Durchlauf neu entstehen.
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

  /** Nur wo tatsächlich gebucht werden kann, ist die Fläche anklickbar. */
  protected isBookable(workplace: Workplace): boolean {
    return workplace.status === 'OK' && this.store.canManageBookings();
  }

  protected onSlotClick(workplace: Workplace, minutes: number): void {
    this.router.navigate(['/buchen'], {
      queryParams: {
        workplace: workplace.id,
        start: toLocalIso(instantAt(this.store.date(), minutes)),
        // Keine Dauer mitgeben: das Formular setzt selbst seine Standarddauer.
      },
    });
  }

  protected onDateChange(value: string): void {
    this.store.date.set(value);
    this.store.load();
  }
}
