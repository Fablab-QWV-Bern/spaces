import { Component, ElementRef, input, viewChild } from '@angular/core';

import { Icon } from '../shared/icon';
import { Block } from './blocks';
import { BookingCard } from './booking-card';

/**
 * A bar in the calendar together with its detail card. A click opens the card;
 * it closes on Escape, on a click outside, or on a second click on the bar —
 * that click light-dismisses it before this handler runs, so a re-click reopens
 * rather than toggles.
 *
 * Opening is ours, closing is the platform's. The declarative route would be
 * `popovertarget` on the bar, and it was taken once, but Safari's invoker
 * bookkeeping is unreliable when the button carries child nodes inside a
 * `display: contents` host: the card opened and then light-dismissed itself in
 * the same click, so nothing appeared. `showPopover()` from a plain listener, as
 * on the map, is not exposed to that.
 *
 * That is why the card sits *next to* the bar and not inside it: a `<button>` may
 * not contain a button, and the card has one. The host itself creates no box
 * (`display: contents`) so that the bar remains the grid item.
 */
@Component({
  selector: 'app-calendar-block',
  imports: [BookingCard, Icon],
  templateUrl: './calendar-block.html',
  styleUrl: './calendar-block.scss',
  host: {
    // A click on the bar is not a click on empty space.
    '(click)': '$event.stopPropagation()',
  },
})
export class CalendarBlock {
  readonly block = input.required<Block>();

  private readonly card = viewChild.required('card', { read: ElementRef<HTMLElement> });

  /** A click beside the card has already light-dismissed it by the time we get
   *  here — the guard is for the rare case where it has not, because
   *  `showPopover()` throws on an already open popover. Mirrors `MapView`. */
  protected openCard(): void {
    const card = this.card().nativeElement;

    if (!card.matches(':popover-open')) {
      card.showPopover();
    }
  }
}
