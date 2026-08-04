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
  template: `
    <h1>{{ heading() }}</h1>

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
             width. The field itself stays put and covers the icon transparently —
             so the handle still opens the device's own picker rather than us
             building one. -->
        <label class="date">
          <span #icon class="icon date-icon" aria-hidden="true">
            <app-icon name="calendar" />
          </span>

          <input
            #picker
            type="date"
            [value]="date()"
            (change)="dateSelected.emit($any($event.target).value)"
            (click)="openPicker(icon, picker)"
            aria-label="Datum wählen"
          />
        </label>
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

        <!-- The map sits next to the switch, not in it: it is not a third zoom
             level but a different question — not "when" but "who is here now". An
             icon is enough; spelled out it would stand on a par with the
             periods. -->
        <a
          class="map"
          routerLink="/karte"
          routerLinkActive="active"
          #karte="routerLinkActive"
          [attr.aria-current]="karte.isActive ? 'page' : null"
          title="Übersichtskarte"
          aria-label="Übersichtskarte"
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
    </nav>
  `,
  styles: `
    :host {
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

    .controls {
      display: flex;
      gap: 0.25rem;

      button,
      input,
      .date-icon,
      .overview {
        border: 1px solid var(--line-strong);
        background: var(--paper);
        padding: 0.35rem 0.7rem;
        font: inherit;
        font-size: 0.9rem;
        border-radius: 0.25rem;
        cursor: pointer;

        &:hover {
          background: var(--surface-muted);
        }
      }

      input[type='date'] {
        cursor: text;
      }

      .icon {
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
      align-self: center;
      margin-left: 0.5rem;
      font-size: 0.85rem;
      color: var(--text-muted);

      &:hover {
        color: var(--ink);
      }
    }

    .map {
      display: flex;
      align-items: center;
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
        border: 1px solid var(--line-strong);
        background: var(--paper);
        padding: 0.35rem 0.7rem;
        font-size: 0.9rem;
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
      :host {
        padding: 0.75rem 0.75rem 0.5rem;
      }

      h1 {
        font-size: 1.25rem;
      }

      .controls .icon {
        display: block;
        line-height: 1.2;
      }

      // When narrow, only the cog remains of the route into the admin area — an
      // underlined icon would look like an error.
      .admin {
        text-decoration: none;
        font-size: 1rem;

        .text {
          display: none;
        }
      }

      .date {
        position: relative;
        display: grid;

        // The transparent field lies over the icon and therefore determines the
        // cursor. This is not for typing, this is for looking something up.
        input {
          position: absolute;
          inset: 0;
          width: 100%;
          padding: 0;
          opacity: 0;
          cursor: pointer;
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

  /**
   * Opens the date picker by hand — but only in the narrow state, where the
   * transparent field lies over the icon and a click would otherwise go nowhere.
   * Whether that state applies is revealed by the icon itself: when hidden it has
   * no `offsetParent`. That way the threshold lives only in the stylesheet and
   * not a second time here.
   */
  protected openPicker(icon: HTMLElement, picker: HTMLInputElement): void {
    if (icon.offsetParent) {
      picker.showPicker?.();
    }
  }
}
