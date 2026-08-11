import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { Icon } from '../shared/icon';
import { SessionBar } from '../shared/session-bar';
import { SessionService } from '../shared/session-service';

/**
 * The calendar header: period, paging, date picker, zoom level, login.
 *
 * What "one step" means is decided by the view — the bar only reports directions
 * and labels its arrows with the unit it is given.
 *
 * The zoom-level switch is made of links rather than buttons: every level is its
 * own route, so that it stays linkable and the back button does what one expects.
 * The date travels along as a query parameter.
 *
 * The way into the single-workplace view is the name in the workplace row, not
 * the header — whoever means a workplace has it right in front of them there. The
 * way back is a button that only the single-workplace view shows.
 */
@Component({
  selector: 'app-calendar-toolbar',
  imports: [Icon, RouterLink, RouterLinkActive, SessionBar],
  // Whoever cannot page needs no row of their own for it — on the map that is
  // the whole of the controls, and the narrow layout then keeps a single row.
  host: { '[class.no-paging]': '!navigable()' },
  templateUrl: './calendar-toolbar.html',
  styleUrl: './calendar-toolbar.scss',
})
export class CalendarToolbar {
  protected readonly session = inject(SessionService);

  readonly heading = input.required<string>();
  readonly date = input.required<string>();
  /** The unit of one paging step, for labelling the arrows. */
  readonly unit = input<'Tag' | 'Woche' | 'Monat'>('Tag');
  /** Whether the way back to all workplaces is offered. */
  readonly overview = input(false);
  /**
   * Whether paging and date selection are possible. The overview map shows the
   * present moment — there would be no date to pick there and nowhere for a
   * paging step to lead.
   */
  readonly navigable = input(true);
  /**
   * Whether the zoom-level switch appears. The single-workplace view shows a
   * fixed month — there would be nothing to switch there.
   */
  readonly zoomable = input(true);
  /**
   * Whether the map itself is what is on screen. Then its button is marked and
   * leads back to the day — a switch that has been pressed can be released again.
   */
  readonly onMap = input(false);

  readonly shift = output<number>();
  readonly today = output<void>();
  readonly dateSelected = output<string>();

  protected readonly backLabel = computed(
    () =>
      ({ Tag: 'Ein Tag zurück', Woche: 'Eine Woche zurück', Monat: 'Einen Monat zurück' })[
        this.unit()
      ],
  );

  protected readonly forwardLabel = computed(
    () =>
      ({ Tag: 'Ein Tag vorwärts', Woche: 'Eine Woche vorwärts', Monat: 'Einen Monat vorwärts' })[
        this.unit()
      ],
  );
}
