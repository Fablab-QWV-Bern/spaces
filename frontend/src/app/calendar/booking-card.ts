import { Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { Icon } from '../shared/icon';
import { CardDetails } from './blocks';
import { CalendarStore } from './calendar-store';

/**
 * The detail card for a bar. It is the popover itself; when it appears is decided
 * by the bar it belongs to — see `CalendarBlock`.
 *
 * As a native popover it lives in the top layer. That is not cosmetic here: the
 * time axis scrolls inside an `overflow-x: auto` container, and a normally
 * positioned element would be clipped at the edge.
 *
 * `role="dialog"` rather than `tooltip`: the card is clicked rather than hovered
 * and contains a button. A tooltip is supplementary text that one does not
 * operate.
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

  /** The popover has to be in the DOM for `popovertarget` to find it — its
   *  content does not. `beforetoggle` rather than `toggle`, so that the content
   *  is there before the popover is first painted. */
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
