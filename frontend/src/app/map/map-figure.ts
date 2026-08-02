import { Component, computed, input } from '@angular/core';

import { BookingCard } from '../calendar/booking-card';
import { CardDetails } from '../calendar/blocks';
import { FIGURE_ID, Box, Placement, figureViewBox } from './map-geometry';

/** Verknüpft Auslöser und Karte — wie im Kalender aus einem Zähler, damit die
 *  Kennung im Dokument eindeutig bleibt. */
let nextId = 0;

/**
 * Eine Figur auf der Übersichtskarte samt ihrer Detailkarte. Sie steht dort,
 * wo gerade jemand arbeitet; ein Klick klappt die Karte auf.
 *
 * Aufbau wie `CalendarBlock`, und aus demselben Grund: der Auslöser ist ein
 * `<button popovertarget>`, die Karte das benannte Popover daneben — Umschalten,
 * Escape, Klick daneben und Tastatur kommen von der Plattform. Der Host erzeugt
 * keine eigene Box, damit der Knopf direkt auf der Kartenfläche liegt und seine
 * Prozentwerte sich auf sie beziehen.
 *
 * Gezeichnet wird die Figur nicht hier: `<use>` holt sie aus dem eingefügten
 * Plan, wo sie der Gestalter im richtigen Massstab und in der Farbe der Karte
 * hinterlegt hat. Ein eigener Pfad wäre eine zweite Wahrheit — und würde beim
 * nächsten Austausch der Datei nicht mitwandern.
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

      // Beschränkt den Ankernamen auf dieses Paar aus Figur und Karte — wie es
      // calendar-block.scss für Balken und Karte tut.
      anchor-scope: --block;
    }

    .figure {
      position: absolute;
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;

      // Gegenstück zum position-anchor in booking-card.scss. Der Name gehört
      // zur Karte, nicht zum Kalender — beide Auslöser tragen ihn.
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
  /** Der Kasten der Figur im Plan — er wird zur `viewBox` dieses Ausschnitts. */
  readonly figure = input.required<Box>();

  protected readonly cardId = `kartenkarte-${nextId++}`;
  protected readonly reference = `#${FIGURE_ID}`;

  protected readonly viewBox = computed(() => figureViewBox(this.figure()));

  protected readonly label = computed(() => {
    const details = this.details();

    return `${details.workplaceName}: ${details.booking.name}, ${details.timeRange}`;
  });
}
