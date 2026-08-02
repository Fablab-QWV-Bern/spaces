import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { SessionBar } from '../shared/session-bar';
import { SessionService } from '../shared/session-service';

/**
 * Kopfzeile des Kalenders: Zeitraum, Blättern, Datumswahl, Zoomstufe,
 * Anmeldung.
 *
 * Was "ein Schritt" bedeutet, entscheidet die Ansicht — die Leiste meldet nur
 * Richtungen und beschriftet ihre Pfeile mit der Einheit, die sie bekommt.
 *
 * Der Umschalter der Zoomstufe sind Links und keine Schaltflächen: jede Stufe
 * ist eine eigene Route, damit sie verlinkbar bleibt und der Zurück-Knopf tut,
 * was man erwartet. Das Datum reist als Abfrageparameter mit.
 *
 * In die Einzelansicht führt der Name in der Arbeitsplatzzeile, nicht die
 * Kopfleiste — wer einen Arbeitsplatz meint, hat ihn dort vor sich. Zurück
 * führt hier ein Knopf, den nur die Einzelansicht zeigt.
 */
@Component({
  selector: 'app-calendar-toolbar',
  imports: [RouterLink, RouterLinkActive, SessionBar],
  template: `
    <h1>{{ heading() }}</h1>

    <nav class="controls">
      @if (overview()) {
        <a class="overview" routerLink="/tag" [queryParams]="{ datum: date() }"
          >Zurück zur Übersicht</a
        >
      }

      <button type="button" (click)="shift.emit(-1)" [attr.aria-label]="backLabel()">‹</button>
      <button type="button" (click)="today.emit()">Heute</button>
      <button type="button" (click)="shift.emit(1)" [attr.aria-label]="forwardLabel()">›</button>

      <input
        type="date"
        [value]="date()"
        (change)="dateSelected.emit($any($event.target).value)"
        aria-label="Datum wählen"
      />

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

      <!-- Die anonyme Rolle kann Rechte tragen, ohne dass jemand angemeldet
           wäre; der Zugang zur Verwaltung gehört trotzdem hinter die Anmeldung. -->
      @if (!session.isAnonymous() && session.canManageAnything()) {
        <a class="admin" routerLink="/verwaltung">Verwaltung</a>
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
  `,
})
export class CalendarToolbar {
  protected readonly session = inject(SessionService);

  readonly heading = input.required<string>();
  readonly date = input.required<string>();
  /** Die Einheit eines Blätterschritts, für die Beschriftung der Pfeile. */
  readonly unit = input<'Tag' | 'Woche' | 'Monat'>('Tag');
  /** Ob der Weg zurück zu allen Arbeitsplätzen angeboten wird. */
  readonly overview = input(false);
  /**
   * Ob der Umschalter der Zoomstufe erscheint. Die Einzelansicht zeigt fix
   * einen Monat — dort gäbe es nichts umzuschalten.
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
}
