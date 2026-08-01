import { Component, computed, input, output } from '@angular/core';

import { Block } from './blocks';
import { CalendarBlock } from './calendar-block';
import { GRID_MINUTES, TimeAxis, gridTemplateColumns, slotAtOffset } from './time-axis';

/**
 * Ein Zeitstrahl über die Öffnungszeiten eines Tages, mit den Balken darauf.
 *
 * Das ist die Zelle, aus der alle Zoomstufen bestehen: die Tagesansicht hat
 * eine davon je Zeile, die Wochenansicht sieben, der Monat entsprechend mehr.
 * Weil jede Zelle ihr eigenes Raster mitbringt, bedeutet die Linie `t0900` in
 * jeder Spalte dasselbe — die Namen brauchen keine Tagesangabe.
 */
@Component({
  selector: 'app-day-track',
  imports: [CalendarBlock],
  templateUrl: './day-track.html',
  styleUrl: './day-track.scss',
  host: {
    '[style.grid-template-columns]': 'template()',
    '[style.--quarter]': 'quarterPercent()',
    '[class.clickable]': 'clickable()',
    '(click)': 'onClick($event)',
  },
})
export class DayTrack {
  readonly axis = input.required<TimeAxis>();
  readonly blocks = input.required<Block[]>();
  /** Ob auf freie Fläche geklickt werden kann, um zu buchen. */
  readonly clickable = input(false);

  /** Der angeklickte Zeitschlitz, in Minuten seit Mitternacht. */
  readonly slotClick = output<number>();

  protected readonly template = computed(() => gridTemplateColumns(this.axis()));

  /** Breite einer Viertelstunde — für die Rasterlinien im Hintergrund. */
  protected readonly quarterPercent = computed(() => {
    const axis = this.axis();

    return `${(GRID_MINUTES / (axis.closesAt - axis.opensAt)) * 100}%`;
  });

  protected onClick(event: MouseEvent): void {
    if (!this.clickable()) {
      return;
    }

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();

    this.slotClick.emit(slotAtOffset(this.axis(), event.clientX - rect.left, rect.width));
  }
}
