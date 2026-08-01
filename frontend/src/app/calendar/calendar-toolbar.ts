import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { SessionBar } from '../shared/session-bar';
import { SessionService } from '../shared/session-service';

/**
 * Kopfzeile des Kalenders: Zeitraum, Blättern, Datumswahl, Zoomstufe, Anmeldung.
 *
 * Was "ein Schritt" bedeutet, entscheidet die Ansicht — die Leiste meldet nur
 * Richtungen und beschriftet ihre Pfeile mit der Einheit, die sie bekommt.
 *
 * Der Umschalter der Zoomstufe sind Links und keine Schaltflächen: jede Stufe
 * ist eine eigene Route, damit sie verlinkbar bleibt und der Zurück-Knopf tut,
 * was man erwartet. Das Datum reist als Abfrageparameter mit.
 */
@Component({
  selector: 'app-calendar-toolbar',
  imports: [RouterLink, RouterLinkActive, SessionBar],
  template: `
    <h1>{{ heading() }}</h1>

    <nav class="controls">
      <button type="button" (click)="shift.emit(-1)" [attr.aria-label]="backLabel()">‹</button>
      <button type="button" (click)="today.emit()">Heute</button>
      <button type="button" (click)="tomorrow.emit()">Morgen</button>
      <button type="button" (click)="shift.emit(1)" [attr.aria-label]="forwardLabel()">›</button>

      <input
        type="date"
        [value]="date()"
        (change)="dateSelected.emit($any($event.target).value)"
        aria-label="Datum wählen"
      />

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

      @if (session.canManageAnything()) {
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
      input {
        border: 1px solid #cbd5e1;
        background: #fff;
        padding: 0.35rem 0.7rem;
        font: inherit;
        font-size: 0.9rem;
        border-radius: 0.25rem;
        cursor: pointer;

        &:hover {
          background: #f1f5f9;
        }
      }

      input {
        cursor: text;
      }
    }

    .admin {
      align-self: center;
      margin-left: 0.5rem;
      font-size: 0.85rem;
      color: #475569;

      &:hover {
        color: #0f172a;
      }
    }

    .spans {
      display: flex;
      margin-left: 0.5rem;

      a {
        border: 1px solid #cbd5e1;
        background: #fff;
        padding: 0.35rem 0.7rem;
        font-size: 0.9rem;
        color: inherit;
        text-decoration: none;

        &:hover {
          background: #f1f5f9;
        }

        &:first-child {
          border-radius: 0.25rem 0 0 0.25rem;
        }

        &:last-child {
          border-radius: 0 0.25rem 0.25rem 0;
          margin-left: -1px;
        }

        &.active {
          background: #475569;
          border-color: #475569;
          color: #fff;
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

  readonly shift = output<number>();
  readonly today = output<void>();
  readonly tomorrow = output<void>();
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
