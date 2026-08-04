import { Component, computed, input, output, signal } from '@angular/core';

import { Block } from './blocks';
import { CalendarBlock } from './calendar-block';
import { GRID_MINUTES, TimeAxis, gridTemplateColumns, lineName, slotAtOffset } from './time-axis';

/**
 * The notice for the anonymous role that appears where the preview would be. It
 * lives here with the cell because every view in which booking happens shows it —
 * as a second copy it would get lost when reworded in one of them.
 */
export const SIGN_IN_NOTICE = 'Melde dich an, um eine Buchung zu erstellen';

/**
 * A timeline across the opening hours of one day, with the bars on it.
 *
 * This is the cell every zoom level is made of: the day view has one per row, the
 * week view seven, the month correspondingly more. Because every cell brings its
 * own grid, the line `t0900` means the same thing in every column — the names
 * need no day component.
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
  /** Whether empty space can be clicked to book. */
  readonly clickable = input(false);
  /**
   * Length of the preview bar under the pointer, in minutes; 0 turns it off.
   *
   * Only the day view sets it: in the week a click creates no booking but opens
   * the day — a bar would promise something other than what the click does.
   */
  readonly previewMinutes = input(0);
  /**
   * Why nothing can be created here even though the workplace would allow it —
   * for instance because the day lies beyond the booking horizon. The sentence
   * appears on hover where the preview would otherwise be; across all rows it
   * would otherwise stand there dozens of times.
   */
  readonly notice = input<string | null>(null);

  /** The clicked time slot, in minutes since midnight. */
  readonly slotClick = output<number>();

  /** The time slot under the pointer, or null outside empty space. */
  protected readonly hoveredSlot = signal<number | null>(null);

  protected readonly template = computed(() => gridTemplateColumns(this.axis()));

  /** The width of a quarter hour — for the grid lines in the background. */
  protected readonly quarterPercent = computed(() => {
    const axis = this.axis();

    return `${(GRID_MINUTES / (axis.closesAt - axis.opensAt)) * 100}%`;
  });

  /**
   * The bar a click here would create: it starts on the same grid line that
   * `onClick` reports and is as long as the default duration. At the end of the
   * day it gets cut off — the axis reaches no further.
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
    // Only over empty space: if the pointer is on a bar or an expanded card, a
    // click there creates nothing.
    if (!this.clickable() || event.target !== event.currentTarget) {
      this.hoveredSlot.set(null);

      return;
    }

    // As long as the pointer stays in the same quarter hour the signal does not
    // change — the preview is not redrawn at every pixel.
    this.hoveredSlot.set(this.slotUnder(event));
  }

  private slotUnder(event: MouseEvent): number {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();

    return slotAtOffset(this.axis(), event.clientX - rect.left, rect.width);
  }
}
