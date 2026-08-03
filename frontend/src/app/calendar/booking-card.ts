import { Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { Icon } from '../shared/icon';
import { CardDetails } from './blocks';
import { CalendarStore } from './calendar-store';

/**
 * Die Detailkarte zu einem Balken. Sie ist selbst das Popover; wann sie
 * erscheint, entscheidet der Balken, in dem sie steht — siehe `CalendarBlock`.
 *
 * Als natives Popover liegt sie im Top Layer. Das ist hier nicht Kosmetik: die
 * Zeitachse scrollt in einem `overflow-x: auto`-Container, ein normal
 * positioniertes Element würde am Rand beschnitten.
 *
 * `role="dialog"` und nicht `tooltip`: die Karte wird angeklickt statt
 * überfahren und enthält eine Schaltfläche. Ein Tooltip ist ergänzender Text,
 * den man nicht bedient.
 */
@Component({
  selector: 'app-booking-card',
  imports: [Icon],
  templateUrl: './booking-card.html',
  styleUrl: './booking-card.scss',
  host: {
    popover: 'auto',
    role: 'dialog',
    '[attr.aria-label]': '"Details zu " + details().booking.name',
    '(beforetoggle)': 'onBeforeToggle($event)',
  },
})
export class BookingCard {
  readonly details = input.required<CardDetails>();

  /** Das Popover muss im DOM stehen, damit `popovertarget` es findet — sein
   *  Inhalt nicht. `beforetoggle` statt `toggle`, damit er da ist, bevor das
   *  Popover erstmals gezeichnet wird. */
  protected readonly visible = signal(false);

  protected readonly store = inject(CalendarStore);
  private readonly router = inject(Router);

  protected onBeforeToggle(event: ToggleEvent): void {
    this.visible.set(event.newState === 'open');
  }

  protected editBooking(): void {
    this.router.navigate(['/buchen'], { queryParams: { booking: this.details().booking.id } });
  }

  protected editSeries(seriesId: string): void {
    this.router.navigate(['/verwaltung/serien', seriesId]);
  }
}
