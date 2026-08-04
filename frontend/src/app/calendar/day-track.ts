import { Component, computed, input, output, signal } from '@angular/core';

import { Block } from './blocks';
import { CalendarBlock } from './calendar-block';
import { GRID_MINUTES, TimeAxis, gridTemplateColumns, lineName, slotAtOffset } from './time-axis';

/**
 * Der Hinweis für die anonyme Rolle, der an der Stelle der Vorschau erscheint.
 * Er steht hier bei der Zelle, weil ihn jede Ansicht zeigt, in der gebucht
 * wird — als zweites Exemplar ginge er beim Umformulieren in einer davon
 * verloren.
 */
export const SIGN_IN_NOTICE = 'Melde dich an, um eine Buchung zu erstellen';

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
    '(mousemove)': 'onMove($event)',
    '(mouseleave)': 'hoveredSlot.set(null)',
  },
})
export class DayTrack {
  readonly axis = input.required<TimeAxis>();
  readonly blocks = input.required<Block[]>();
  /** Ob auf freie Fläche geklickt werden kann, um zu buchen. */
  readonly clickable = input(false);
  /**
   * Dauer des Vorschaubalkens unter dem Zeiger, in Minuten; 0 schaltet ihn ab.
   *
   * Nur die Tagesansicht setzt ihn: in der Woche legt ein Klick keine Buchung
   * an, sondern öffnet den Tag — ein Balken würde dort etwas anderes
   * versprechen, als der Klick tut.
   */
  readonly previewMinutes = input(0);
  /**
   * Warum hier nichts anzulegen ist, obwohl der Arbeitsplatz es zuliesse —
   * etwa weil der Tag jenseits des Vorlaufs liegt. Der Satz erscheint beim
   * Überfahren an der Stelle, an der sonst die Vorschau läge; über alle Zeilen
   * hinweg stünde er sonst dutzendfach da.
   */
  readonly notice = input<string | null>(null);

  /** Der angeklickte Zeitschlitz, in Minuten seit Mitternacht. */
  readonly slotClick = output<number>();

  /** Der Zeitschlitz unter dem Zeiger, oder null ausserhalb freier Fläche. */
  protected readonly hoveredSlot = signal<number | null>(null);

  protected readonly template = computed(() => gridTemplateColumns(this.axis()));

  /** Breite einer Viertelstunde — für die Rasterlinien im Hintergrund. */
  protected readonly quarterPercent = computed(() => {
    const axis = this.axis();

    return `${(GRID_MINUTES / (axis.closesAt - axis.opensAt)) * 100}%`;
  });

  /**
   * Der Balken, den ein Klick hier anlegen würde: er beginnt auf derselben
   * Rasterlinie, die `onClick` meldet, und ist so lang wie die Standarddauer.
   * Am Tagesende wird er abgeschnitten — weiter reicht die Achse nicht.
   */
  protected readonly preview = computed(() => {
    const slot = this.hoveredSlot();
    const minutes = this.previewMinutes();

    if (slot === null || minutes <= 0) {
      return null;
    }

    const endMinutes = Math.min(slot + minutes, this.axis().closesAt);

    return {
      gridColumn: `${lineName(slot)} / ${lineName(endMinutes)}`,
      label: 'Neue Buchung',
    };
  });

  protected onClick(event: MouseEvent): void {
    if (!this.clickable()) {
      return;
    }

    this.slotClick.emit(this.slotUnder(event));
  }

  protected onMove(event: MouseEvent): void {
    // Nur über freier Fläche: liegt der Zeiger auf einem Balken oder einer
    // aufgeklappten Karte, legt ein Klick dort nichts an.
    if (!this.clickable() || event.target !== event.currentTarget) {
      this.hoveredSlot.set(null);

      return;
    }

    // Bleibt der Zeiger in derselben Viertelstunde, ändert sich das Signal
    // nicht — die Vorschau wird nicht bei jedem Pixel neu gezeichnet.
    this.hoveredSlot.set(this.slotUnder(event));
  }

  private slotUnder(event: MouseEvent): number {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();

    return slotAtOffset(this.axis(), event.clientX - rect.left, rect.width);
  }
}
