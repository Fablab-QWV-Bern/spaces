import { Component, computed, input } from '@angular/core';

import { TimeAxis, gridTemplateColumns, lineName } from './time-axis';

/**
 * Die Stundenbeschriftung über einer Zeitachse.
 *
 * Steht für sich, weil zwei Ansichten dieselbe Achse überschreiben: die
 * Tagesansicht über den Arbeitsplatzzeilen, die Einzelansicht über den
 * Tageszeilen. Unterschiedlich ist nur, was in den Zeilen darunter steht.
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

  /** Eine Stundenbeschriftung spannt über ihre vier Viertelstunden. */
  protected column(hour: number): string {
    const axis = this.axis();

    return `${lineName(hour * 60)} / ${lineName(Math.min(hour * 60 + 60, axis.closesAt))}`;
  }
}
