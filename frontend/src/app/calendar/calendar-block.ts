import { Component, input } from '@angular/core';

import { Icon } from '../shared/icon';
import { Block } from './blocks';
import { BookingCard } from './booking-card';

/** Links trigger and card. From a counter rather than from the booking, because
 *  the same blockage can sit in several rows — the block's identifier would not
 *  be unique within the document. */
let nextId = 0;

/**
 * A bar in the calendar together with its detail card. One click opens it, a
 * second closes it again.
 *
 * Opening and closing is the browser's job: the bar is a `<button>` with
 * `popovertarget`, the card the named popover. Toggling, Escape, clicking outside
 * and keyboard handling therefore come from the platform.
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

  protected readonly cardId = `buchungskarte-${nextId++}`;
}
