import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { Booking } from '../api/models';
import { Icon } from '../shared/icon';
import { CardDetails } from './blocks';
import { CalendarStore } from './calendar-store';

/**
 * The detail card for a bar. It is the popover itself; when it appears is decided
 * by whoever triggers it — see `CalendarBlock` in the calendar and `MapView` on
 * the overview map.
 *
 * As a native popover it lives in the top layer. That is not cosmetic here: the
 * time axis scrolls inside an `overflow-x: auto` container, and a normally
 * positioned element would be clipped at the edge.
 *
 * `role="dialog"` rather than `tooltip`: the card is clicked rather than hovered
 * and contains a button. A tooltip is supplementary text that one does not
 * operate.
 *
 * Without a booking it shows `heading` and whatever is projected into it. That
 * case exists only on the map, where a click on a free workplace has to answer
 * something too — and it lives here rather than in a card of its own so that the
 * booking half is not written a second time, including its routes into the form.
 */
@Component({
  selector: 'app-booking-card',
  imports: [Icon],
  templateUrl: './booking-card.html',
  styleUrl: './booking-card.scss',
  host: {
    popover: 'auto',
    role: 'dialog',
    '[attr.aria-label]': 'label()',
    '(beforetoggle)': 'onBeforeToggle($event)',
  },
})
export class BookingCard {
  /** Null when nothing is on the workplace — then `heading` carries the card. */
  readonly details = input<CardDetails | null>(null);
  /** The heading for that case: the workplace whose free space was clicked. */
  readonly heading = input<string | null>(null);

  /** The popover host has to be in the DOM so its opener can call `showPopover()`
   *  on it — its content does not. `beforetoggle` rather than `toggle`, so that
   *  the content is there before the popover is first painted. */
  protected readonly visible = signal(false);

  protected readonly store = inject(CalendarStore);
  private readonly router = inject(Router);

  protected readonly label = computed(() => {
    const details = this.details();

    return details ? `Details zu ${details.booking.name}` : (this.heading() ?? 'Details');
  });

  protected onBeforeToggle(event: ToggleEvent): void {
    this.visible.set(event.newState === 'open');
  }

  /** The booking comes from the template rather than from the input: there it is
   *  already narrowed to non-null, here it would have to be asserted. */
  protected editBooking(booking: Booking): void {
    // `from` so the form returns to this view rather than always to the day.
    this.router.navigate(['/buchen'], {
      queryParams: { booking: booking.id, from: this.router.url },
    });
  }

  protected editSeries(seriesId: string): void {
    this.router.navigate(['/verwaltung/serien', seriesId]);
  }
}
