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

/** Eine Tagesspalte der Woche, fertig beschriftet. */
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
 * Der Kalender in Wochenauflösung: sieben Tageszellen je Arbeitsplatz.
 *
 * Jede Zelle ist dieselbe `app-day-track` wie in der Tagesansicht, nur schmal —
 * die Balken liegen darin massstabsgetreu über den Öffnungszeiten *dieses*
 * Tages. Eine Buchung über Nacht erscheint dadurch in beiden Tageszellen.
 *
 * Gebucht wird hier nicht: bei rund hundert Pixeln für dreizehn Stunden wäre
 * eine Viertelstunde keine zwei Pixel breit, ein Klick träfe nie das Gemeinte.
 * Er öffnet darum den Tag in der Tagesansicht.
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

    // "Woche" davor, weil eine Spanne allein im Reiter nicht sagt, welche
    // Zoomstufe offen ist — auf der Seite tut das die Ansicht selbst.
    refinePageTitle(() => `Woche ${this.heading()}`);

    setInterval(() => this.now.set(new Date()), 60_000);
  }

  protected readonly days = computed<WeekDay[]>(() => {
    // Hervorgehoben wird der heutige Tag, nicht das dargestellte Datum: beim
    // Blättern wäre sonst in jeder Woche derselbe Wochentag blau, ohne dass
    // daran etwas besonders wäre.
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
   * Der Tag unter dem Zeiger. Hervorgehoben wird die ganze Spalte und nicht nur
   * die Zelle darunter — der Klick öffnet den Tag mit allen Arbeitsplätzen, und
   * genau das zeigt die Spalte an.
   */
  protected readonly hoveredDay = signal<IsoDate | null>(null);

  protected onCellEnter(workplace: Workplace, date: IsoDate): void {
    this.hoveredDay.set(this.isBookable(workplace) ? date : null);
  }

  /** "27. – 31. Juli 2026", über einen Monatswechsel hinweg ausgeschrieben. */
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
   * Die Balken je Arbeitsplatz und Tag, einmal berechnet. Ein Block entsteht
   * genau wie in der Tagesansicht — nur eben siebenmal, je auf seinen Tag
   * beschnitten.
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

  /** Die Jetzt-Linie steht in der Spalte des heutigen Tages — sonst nirgends. */
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

  /** Wie in der Tagesansicht: die Fläche lädt nur dort ein, wo buchbar ist. */
  protected isBookable(workplace: Workplace): boolean {
    return workplace.status === 'OK' && this.store.canManageBookings();
  }

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
