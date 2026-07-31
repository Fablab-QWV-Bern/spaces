import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';

import { SessionBar } from '../shared/session-bar';

import { Booking, Workplace } from '../api/models';
import { CalendarStore } from './calendar-store';
import {
  GRID_MINUTES,
  TimeAxis,
  blockGeometry,
  buildTimeAxis,
  formatTime,
  instantAt,
  minutesOfDay,
  slotAtOffset,
} from './time-axis';

interface Block {
  booking: Booking;
  label: string;
  title: string;
  leftPercent: number;
  widthPercent: number;
  clippedStart: boolean;
  clippedEnd: boolean;
  isSeries: boolean;
  isBlockage: boolean;
}

/** Muss mit dem `position-anchor` im Stylesheet übereinstimmen. */
const ANCHOR_NAME = '--hovered-block';

/** Die aufgeklappte Detailkarte zu einem Block. */
interface HoverCard {
  booking: Booking;
  workplaceName: string;
  bookedWorkplaceName: string;
  timeRange: string;
  isBlockage: boolean;
}

@Component({
  selector: 'app-day-calendar',
  imports: [SessionBar],
  templateUrl: './day-calendar.html',
  styleUrl: './day-calendar.scss',
})
export class DayCalendar {
  protected readonly store = inject(CalendarStore);
  private readonly router = inject(Router);

  protected readonly now = signal(new Date());
  protected readonly hover = signal<HoverCard | null>(null);

  constructor() {
    this.store.load();

    // Die Jetzt-Linie bewegt sich viertelstündlich weiter; häufiger wäre für ein
    // 15-Minuten-Raster ohne Aussage.
    setInterval(() => this.now.set(new Date()), 60_000);
  }

  protected readonly axis = computed<TimeAxis | null>(() => {
    const config = this.store.config();

    return config ? buildTimeAxis(config.opensAt, config.closesAt) : null;
  });

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
    const axis = this.axis();
    const now = this.now();

    if (!axis || this.store.date() !== isoDate(now)) {
      return null;
    }

    const minutes = now.getHours() * 60 + now.getMinutes();

    if (minutes < axis.opensAt || minutes > axis.closesAt) {
      return null;
    }

    return ((minutes - axis.opensAt) / (axis.closesAt - axis.opensAt)) * 100;
  });

  protected bookingBlocks(workplace: Workplace): Block[] {
    return this.blocksFor(this.store.bookingsByWorkplace().get(workplace.id) ?? [], false);
  }

  /** Graue Blöcke: Buchungen auf anderen Plätzen, die diesen mitbelegen. */
  protected blockageBlocks(workplace: Workplace): Block[] {
    return this.blocksFor(this.store.blockagesByWorkplace().get(workplace.id) ?? [], true);
  }

  protected areaColor(areaId: string): string {
    return this.store.areas().find((area) => area.id === areaId)?.color ?? '#94a3b8';
  }

  private blocksFor(bookings: Booking[], blockage: boolean): Block[] {
    const axis = this.axis();

    if (!axis) {
      return [];
    }

    const day = new Date(`${this.store.date()}T12:00:00`);

    return bookings
      .map((booking) => {
        const start = new Date(booking.startTime);
        const end = new Date(booking.endTime);
        const geometry = blockGeometry(axis, start, end, day);

        if (!geometry) {
          return null;
        }

        // Ohne viewBookingsDetails liefert die API null statt eines Namens.
        const who = booking.name ?? 'Belegt';
        const time = `${formatTime(start)}–${formatTime(end)}`;

        return {
          booking,
          label: blockage ? '' : who,
          title: blockage ? `Blockiert durch ${who}, ${time}` : `${who}, ${time}`,
          isSeries: booking.bookingSeriesId !== null,
          isBlockage: blockage,
          ...geometry,
        } satisfies Block;
      })
      .filter((block): block is Block => block !== null);
  }

  protected hourLeftPercent(hour: number): number {
    const axis = this.axis();

    if (!axis) {
      return 0;
    }

    return ((hour * 60 - axis.opensAt) / (axis.closesAt - axis.opensAt)) * 100;
  }

  protected readonly quarterHourPercent = computed(() => {
    const axis = this.axis();

    return axis ? (15 / (axis.closesAt - axis.opensAt)) * 100 : 0;
  });

  protected statusLabel(workplace: Workplace): string | null {
    return { DEFECT: 'defekt', DISABLED: 'deaktiviert', OK: null }[workplace.status];
  }

  // --- Hover-Details --------------------------------------------------------
  //
  // Die Karte ist ein natives Popover und liegt damit im Top Layer. Das ist hier
  // nicht Kosmetik: die Zeitachse scrollt in einem `overflow-x: auto`-Container,
  // ein normal positioniertes Element würde am Rand beschnitten.
  //
  // Positioniert wird über CSS Anchor Positioning. Der überfahrene Block bekommt
  // den `anchor-name`, die Karte hängt sich daran — keine Koordinatenrechnung,
  // und am Viewport-Rand klappt sie von selbst um.

  private readonly cardRef = viewChild<ElementRef<HTMLElement>>('card');

  private anchoredBlock: HTMLElement | null = null;

  protected showCard(block: Block, workplace: Workplace, event: Event): void {
    this.anchorTo(event.currentTarget as HTMLElement);

    const start = new Date(block.booking.startTime);
    const end = new Date(block.booking.endTime);

    this.hover.set({
      booking: block.booking,
      workplaceName: workplace.name,
      // Bei einer Blockierung liegt die Buchung auf einem anderen Arbeitsplatz.
      bookedWorkplaceName:
        this.store.workplaceById().get(block.booking.workplaceId)?.name ??
        block.booking.workplaceId,
      timeRange: `${formatTime(start)}–${formatTime(end)}`,
      isBlockage: block.isBlockage,
    });

    const card = this.cardRef()?.nativeElement;

    // showPopover() wirft, wenn das Popover bereits offen ist — beim Wechsel von
    // einem Block zum nächsten ist es das.
    if (card && !card.matches(':popover-open')) {
      card.showPopover();
    }
  }

  /**
   * Die Karte liegt lückenlos am Block, der Zeiger wechselt also direkt von
   * einem zum anderen. `relatedTarget` sagt, wohin er geht: bleibt er innerhalb
   * des Gespanns aus Block und Karte, bleibt die Karte offen.
   */
  protected hideCard(event: MouseEvent | FocusEvent): void {
    const target = event.relatedTarget as Node | null;
    const card = this.cardRef()?.nativeElement;

    if (target && (card?.contains(target) || this.anchoredBlock?.contains(target))) {
      return;
    }

    card?.hidePopover();
    this.releaseAnchor();
    this.hover.set(null);
  }

  /** Immer nur ein Block trägt den Ankernamen. */
  private anchorTo(element: HTMLElement): void {
    this.releaseAnchor();
    element.style.setProperty('anchor-name', ANCHOR_NAME);
    this.anchoredBlock = element;
  }

  private releaseAnchor(): void {
    this.anchoredBlock?.style.removeProperty('anchor-name');
    this.anchoredBlock = null;
  }

  protected editBooking(booking: Booking): void {
    this.router.navigate(['/buchen'], { queryParams: { booking: booking.id } });
  }

  // --- Klick auf freie Fläche ----------------------------------------------

  /** Nur wo tatsächlich gebucht werden kann, ist die Fläche anklickbar. */
  protected isBookable(workplace: Workplace): boolean {
    return workplace.status === 'OK' && this.store.canManageBookings();
  }

  protected onTrackClick(workplace: Workplace, event: MouseEvent): void {
    if (!this.isBookable(workplace)) {
      return;
    }

    const axis = this.axis();
    const track = event.currentTarget as HTMLElement;

    if (!axis) {
      return;
    }

    const rect = track.getBoundingClientRect();
    const minutes = slotAtOffset(axis, event.clientX - rect.left, rect.width);

    this.router.navigate(['/buchen'], {
      queryParams: {
        workplace: workplace.id,
        // Lokale Zeit ohne Zone: das Formular arbeitet in Anzeige-Zeit, die
        // Umrechnung nach UTC passiert erst beim Speichern.
        start: toLocalIso(instantAt(this.store.date(), minutes)),
        // Die kürzeste erlaubte Dauer, wie in der Spec vorgegeben.
        durationMinutes: GRID_MINUTES,
      },
    });
  }

  protected shift(days: number): void {
    this.store.shiftDays(days);
  }

  protected today(): void {
    this.store.goToToday();
  }

  protected tomorrow(): void {
    this.store.goToTomorrow();
  }

  protected onDateChange(value: string): void {
    this.store.date.set(value);
    this.store.load();
  }

  protected readonly minutesOfDay = minutesOfDay;
}

function isoDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

/** "2026-07-31T14:00" — lokale Wanduhrzeit, bewusst ohne Zonenangabe. */
function toLocalIso(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
