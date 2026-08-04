import { Component, computed, input } from '@angular/core';

import { BookingCard } from '../calendar/booking-card';
import { CardDetails } from '../calendar/blocks';
import { FIGURE_ID, Box, Placement, figureViewBox } from './map-geometry';

/** Links trigger and card — from a counter as in the calendar, so that the
 *  identifier stays unique within the document. */
let nextId = 0;

/**
 * A figure on the overview map together with its detail card. It stands where
 * somebody is working right now; a click opens the card.
 *
 * Built like `CalendarBlock`, and for the same reason: the trigger is a
 * `<button popovertarget>`, the card the named popover next to it — toggling,
 * Escape, clicking outside and keyboard handling come from the platform. The host
 * creates no box of its own so that the button sits directly on the map surface
 * and its percentages relate to it.
 *
 * The figure is not drawn here: `<use>` fetches it from the grafted-in plan,
 * where the designer deposited it at the right scale and in the map's colour. A
 * path of our own would be a second source of truth — and would not travel along
 * the next time the file is swapped.
 */
@Component({
  selector: 'app-map-figure',
  imports: [BookingCard],
  template: `
    <button
      type="button"
      class="figure"
      [attr.popovertarget]="cardId"
      [attr.aria-label]="label()"
      [style.left.%]="placement().leftPercent"
      [style.top.%]="placement().topPercent"
      [style.width.%]="placement().widthPercent"
      [style.height.%]="placement().heightPercent"
    >
      <svg [attr.viewBox]="viewBox()" focusable="false" aria-hidden="true">
        <use [attr.href]="reference" />
      </svg>
    </button>

    <app-booking-card [id]="cardId" [details]="details()" />
  `,
  styles: `
    :host {
      display: contents;

      // Scopes the anchor name to this pair of figure and card — as
      // calendar-block.scss does for bar and card.
      anchor-scope: --block;
    }

    .figure {
      position: absolute;
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;

      // Counterpart to the position-anchor in booking-card.scss. The name
      // belongs to the card, not to the calendar — both triggers carry it.
      anchor-name: --block;

      &:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
        border-radius: 0.2rem;
      }
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class MapFigure {
  readonly placement = input.required<Placement>();
  readonly details = input.required<CardDetails>();
  /** The figure's box in the plan — it becomes the `viewBox` of this excerpt. */
  readonly figure = input.required<Box>();

  protected readonly cardId = `kartenkarte-${nextId++}`;
  protected readonly reference = `#${FIGURE_ID}`;

  protected readonly viewBox = computed(() => figureViewBox(this.figure()));

  protected readonly label = computed(() => {
    const details = this.details();

    return `${details.workplaceName}: ${details.booking.name}, ${details.timeRange}`;
  });
}
