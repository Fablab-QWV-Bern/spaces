import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { Workplace } from '../api/models';
import { BookingCard } from './booking-card';
import { Block, blocksFor } from './blocks';
import { CalendarStore, isoDate } from './calendar-store';
import { CalendarToolbar } from './calendar-toolbar';
import { DayTrack } from './day-track';
import { gridTemplateColumns, instantAt, lineName, percentOfAxis } from './time-axis';

@Component({
  selector: 'app-day-calendar',
  imports: [BookingCard, CalendarToolbar, DayTrack],
  templateUrl: './day-calendar.html',
  styleUrl: './day-calendar.scss',
})
export class DayCalendar {
  protected readonly store = inject(CalendarStore);
  private readonly router = inject(Router);

  protected readonly now = signal(new Date());

  constructor() {
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

  /** Das Spaltenraster für die Stundenbeschriftung der Kopfzeile. */
  protected readonly gridTemplate = computed(() => {
    const axis = this.store.axis();

    return axis ? gridTemplateColumns(axis) : '';
  });

  /** Eine Stundenbeschriftung spannt über ihre vier Viertelstunden. */
  protected hourColumn(hour: number): string {
    const axis = this.store.axis();

    if (!axis) {
      return 'auto';
    }

    return `${lineName(hour * 60)} / ${lineName(Math.min(hour * 60 + 60, axis.closesAt))}`;
  }

  protected statusLabel(workplace: Workplace): string | null {
    return { DEFECT: 'defekt', DISABLED: 'deaktiviert', OK: null }[workplace.status];
  }

  /** Nur wo tatsächlich gebucht werden kann, ist die Fläche anklickbar. */
  protected isBookable(workplace: Workplace): boolean {
    return workplace.status === 'OK' && this.store.canManageBookings();
  }

  protected onSlotClick(workplace: Workplace, minutes: number): void {
    this.router.navigate(['/buchen'], {
      queryParams: {
        workplace: workplace.id,
        // Lokale Zeit ohne Zone: das Formular arbeitet in Anzeige-Zeit, die
        // Umrechnung nach UTC passiert erst beim Speichern.
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

/** "2026-07-31T14:00" — lokale Wanduhrzeit, bewusst ohne Zonenangabe. */
function toLocalIso(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
