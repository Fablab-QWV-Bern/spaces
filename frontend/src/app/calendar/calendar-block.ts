import { Component, input } from '@angular/core';

import { Icon } from '../shared/icon';
import { Block } from './blocks';
import { BookingCard } from './booking-card';

/** Verknüpft Auslöser und Karte. Aus einem Zähler und nicht aus der Buchung,
 *  weil dieselbe Blockierung in mehreren Zeilen liegen kann — die Kennung des
 *  Blocks wäre im Dokument nicht eindeutig. */
let nextId = 0;

/**
 * Ein Balken im Kalender samt seiner Detailkarte. Ein Klick klappt sie auf, ein
 * zweiter wieder zu.
 *
 * Auf- und Zuklappen macht der Browser: der Balken ist ein `<button>` mit
 * `popovertarget`, die Karte das benannte Popover. Damit kommen Umschalten,
 * Escape, Klick daneben und die Tastaturbedienung von der Plattform.
 *
 * Deshalb steht die Karte *neben* dem Balken und nicht in ihm: ein `<button>`
 * darf keine Schaltfläche enthalten, und die Karte hat eine. Der Host selbst
 * erzeugt keine Box (`display: contents`), damit der Balken das Rasterelement
 * bleibt.
 */
@Component({
  selector: 'app-calendar-block',
  imports: [BookingCard, Icon],
  templateUrl: './calendar-block.html',
  styleUrl: './calendar-block.scss',
  host: {
    // Ein Klick auf den Balken ist kein Klick auf freie Fläche.
    '(click)': '$event.stopPropagation()',
  },
})
export class CalendarBlock {
  readonly block = input.required<Block>();

  protected readonly cardId = `buchungskarte-${nextId++}`;
}
