import { Component, computed, input } from '@angular/core';

import { TimeAxis, gridTemplateColumns, lineName } from './time-axis';

/**
 * The hour labels above a time axis.
 *
 * Stands on its own because two views head the same axis: the day view above the
 * workplace rows, the single-workplace view above the day rows. The only
 * difference is what stands in the rows beneath.
 */
@Component({
  selector: 'app-hour-header',
  host: { '[style.grid-template-columns]': 'template()' },
  template: `
    @for (hour of axis().hours; track hour) {
      <span class="hour" [style.gridColumn]="column(hour)">{{ hour }}:00</span>
    }
  `,
  styles: `
    :host {
      display: grid;
      grid-auto-rows: 1fr;
      height: var(--row-height);
    }

    .hour {
      grid-row: 1;
      display: flex;
      align-items: center;
      padding-left: 0.25rem;
      border-left: 1px solid var(--line);
      font-size: 0.75rem;
      color: var(--text-soft);
    }
  `,
})
export class HourHeader {
  readonly axis = input.required<TimeAxis>();

  protected readonly template = computed(() => gridTemplateColumns(this.axis()));

  /** An hour label spans its four quarter hours. */
  protected column(hour: number): string {
    const axis = this.axis();

    return `${lineName(hour * 60)} / ${lineName(Math.min(hour * 60 + 60, axis.closesAt))}`;
  }
}
