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
  template: `
    <h1>{{ heading() }}</h1>

    <!-- Two groups, so that the narrow layout can pull the second one up next to
         the heading: what is about this date belongs together with the paging,
         everything that leads elsewhere does not. Wide, the wrapper puts them
         back into one row. -->
    <div class="right">
      <nav class="controls">
        @if (overview()) {
          <a class="overview" routerLink="/tag" [queryParams]="{ datum: date() }"
            >Zurück zur Übersicht</a
          >
        }

        @if (navigable()) {
          <button type="button" (click)="shift.emit(-1)" [attr.aria-label]="backLabel()">
            <app-icon name="back" />
          </button>
          <button type="button" (click)="today.emit()">Heute</button>
          <button type="button" (click)="shift.emit(1)" [attr.aria-label]="forwardLabel()">
            <app-icon name="forward" />
          </button>

          <!-- When narrow, the field shrinks to its icon: the date is already
               there as a heading, and spelling it out a second time only costs
               width. The field stays where it is, transparent behind the icon —
               it remains the control, only its display disappears.

               Who opens the picker depends on what one points with, because the
               browsers disagree: Chrome opens it only from its own handle, which
               is not visible here, Firefox from a click anywhere in the field —
               and there our showPicker() and the browser's own cancelled each
               other out within the same click. With a mouse the icon is
               therefore a button and the field beneath it takes no clicks at
               all. Under a finger it is the other way round: the field takes the
               tap and the browser opens its own picker, because iOS Safari
               ignores showPicker() for dates — without an error, without
               anything happening. Either way exactly one place opens it.

               No label around the two: it would have nothing to say that the
               field's aria-label does not already say, and a click on a button
               inside a label is a case one has to look up. -->
          <span class="date">
            <input
              #picker
              type="date"
              [value]="date()"
              (change)="dateSelected.emit($any($event.target).value)"
              aria-label="Datum wählen"
            />

            <button
              type="button"
              class="date-icon"
              (click)="picker.showPicker()"
              tabindex="-1"
              aria-hidden="true"
            >
              <app-icon name="calendar" />
            </button>
          </span>
        }

        @if (zoomable()) {
          <span class="spans">
            <a
              routerLink="/tag"
              [queryParams]="{ datum: date() }"
              routerLinkActive="active"
              #tag="routerLinkActive"
              [attr.aria-current]="tag.isActive ? 'page' : null"
              >Tag</a
            >
            <a
              routerLink="/woche"
              [queryParams]="{ datum: date() }"
              routerLinkActive="active"
              #woche="routerLinkActive"
              [attr.aria-current]="woche.isActive ? 'page' : null"
              >Woche</a
            >
          </span>
        }
      </nav>

      <div class="extras">
        @if (zoomable()) {
          <!-- The map sits next to the switch, not in it: it is not a third zoom
               level but a different question — not "when" but "who is here now".
               An icon is enough; spelled out it would stand on a par with the
               periods.

               It behaves like a switch and therefore leads back too: pressed
               again it returns to the day. Which is why it does not ask
               routerLinkActive where it is — its target depends on the answer,
               and the directive would then keep measuring against the target it
               has just changed. -->
          <a
            class="map"
            [routerLink]="onMap() ? '/tag' : '/karte'"
            [queryParams]="onMap() ? { datum: date() } : null"
            [class.active]="onMap()"
            [attr.aria-current]="onMap() ? 'page' : null"
            [title]="onMap() ? 'Zurück zum Kalender' : 'Übersichtskarte'"
            [attr.aria-label]="onMap() ? 'Zurück zum Kalender' : 'Übersichtskarte'"
          >
            <app-icon name="map" />
          </a>
        }

        <!-- The anonymous role can carry permissions without anybody being logged
             in; access to the admin area still belongs behind the login. -->
        @if (!session.isAnonymous() && session.canManageAnything()) {
          <a class="admin" routerLink="/verwaltung" title="Verwaltung" aria-label="Verwaltung">
            <app-icon class="icon" name="settings" />
            <span class="text">Verwaltung</span>
          </a>
        }

        <app-session-bar />
      </div>
    </div>
  `,
  styles: `
    :host {
      // One height for everything in the bar. Left to the boxes, it is the date
      // field that decides: a date input is taller than a button with the same
      // padding and font — barely in Chrome, noticeably in Safari — and since a
      // flex row stretches its items, that surplus went to every control beside
      // it. Named once here, the row no longer depends on what an engine thinks
      // a date field is.
      --control-height: 2rem;

      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      padding: 1rem 1.5rem 0.5rem;
    }

    h1 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
    }

    // Centred rather than stretched: a control that turns out taller than the
    // others should stand out on its own instead of pulling its neighbours up
    // with it.
    .right,
    .controls,
    .extras {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .controls {
      button,
      input,
      .date-icon,
      .overview {
        border: 1px solid var(--line-strong);
        background: var(--paper);
        padding: 0.35rem 0.7rem;
        font: inherit;
        font-size: 0.9rem;
        // Spelled out rather than left to the default, so that the text inside
        // sets the same height everywhere and not one height per engine.
        line-height: 1.2;
        border-radius: 0.25rem;
        cursor: pointer;

        &:hover {
          background: var(--surface-muted);
        }
      }

      // The height is a floor, not a measurement: whatever a browser's font
      // makes of the text may still grow beyond it, nothing gets cut off.
      button,
      .date-icon,
      .overview {
        display: inline-flex;
        align-items: center;
        min-height: var(--control-height);
      }

      // The one control given its height instead of allowed to find it — its
      // box is the one the engines disagree about.
      input[type='date'] {
        height: var(--control-height);
        cursor: text;
      }

      // Without this the span would wrap the field in a line box of its own and
      // add its leading on top of the height just fixed.
      .date {
        display: inline-flex;
      }

      .date-icon {
        display: none;
      }

      .overview {
        margin-right: 0.5rem;
        color: inherit;
        text-decoration: none;
        white-space: nowrap;
      }
    }

    .admin {
      margin-left: 0.5rem;
      font-size: 0.85rem;
      color: var(--text-muted);

      &:hover {
        color: var(--ink);
      }

      .icon {
        display: none;
      }
    }

    .map {
      display: flex;
      align-items: center;
      min-height: var(--control-height);
      margin-left: 0.25rem;
      border: 1px solid var(--line-strong);
      background: var(--paper);
      border-radius: 0.25rem;
      padding: 0.35rem 0.6rem;
      color: inherit;

      &:hover {
        background: var(--surface-muted);
      }

      &.active {
        background: var(--text-muted);
        border-color: var(--text-muted);
        color: var(--paper);
      }
    }

    .spans {
      display: flex;
      margin-left: 0.5rem;

      a {
        display: inline-flex;
        align-items: center;
        min-height: var(--control-height);
        border: 1px solid var(--line-strong);
        background: var(--paper);
        padding: 0.35rem 0.7rem;
        font-size: 0.9rem;
        line-height: 1.2;
        color: inherit;
        text-decoration: none;

        &:hover {
          background: var(--surface-muted);
        }

        &:first-child {
          border-radius: 0.25rem 0 0 0.25rem;
        }

        &:last-child {
          border-radius: 0 0.25rem 0.25rem 0;
          margin-left: -1px;
        }

        &.active {
          background: var(--text-muted);
          border-color: var(--text-muted);
          color: var(--paper);
        }
      }
    }

    // The same threshold as in the calendar chrome: below the grid's minimum
    // width it scrolls, and the bar gives up whatever it can spare.
    @media (width < 48rem) {
      // Two rows instead of one: the heading gets what leads out of the calendar
      // as its company, the paging keeps the row below to itself. Nothing here
      // needs to know its neighbours' widths, so nothing has to be cut off.
      :host {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem 0.75rem 0.5rem;
      }

      // Dissolved, so that its two halves can go into different rows.
      .right {
        display: contents;
      }

      h1 {
        grid-area: 1 / 1;
        font-size: 1.25rem;
      }

      .extras {
        grid-area: 1 / 2;
      }

      // Wrapping instead of overflowing: with the way back to the overview the
      // row can become longer than the screen, and a button that lies outside is
      // worse than one a line further down.
      .controls {
        grid-area: 2 / 1 / auto / -1;
        flex-wrap: wrap;
      }

      // Without paging, the controls are only the zoom switch — that fits next to
      // the heading, and the wrapper stays whole for it.
      :host(.no-paging) .right {
        display: flex;
        grid-area: 1 / 2;
      }

      // Out of hiding, and back into the row's shared height along with it.
      .controls .date-icon {
        display: inline-flex;
      }

      // When narrow, only the cog remains of the route into the admin area — an
      // underlined icon would look like an error.
      .admin {
        text-decoration: none;
        font-size: 1rem;

        .icon {
          display: block;
        }

        .text {
          display: none;
        }
      }

      .date {
        position: relative;
        display: grid;

        // The field lies over the button, invisible and unclickable — the button
        // opens the picker, the field only holds the value and stays reachable by
        // keyboard. This is not for typing, this is for looking something up.
        input {
          position: absolute;
          inset: 0;
          width: 100%;
          padding: 0;
          opacity: 0;
          pointer-events: none;
        }

        // Under a finger the invisible field takes the tap after all: on a touch
        // device every browser opens its picker from the field itself, and iOS
        // Safari opens it from nowhere else — showPicker() returns there without
        // an error and without a picker. It lies over the icon anyway, so the tap
        // target stays the one you can see.
        @media (pointer: coarse) {
          input {
            pointer-events: auto;
          }
        }
      }
    }
  `,
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
