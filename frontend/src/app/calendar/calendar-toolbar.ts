import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { Icon } from '../shared/icon';
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
  imports: [Icon, RouterLink, RouterLinkActive, SessionBar],
  template: `
    <h1>{{ heading() }}</h1>

    <nav class="controls">
      @if (overview()) {
        <a class="overview" routerLink="/tag" [queryParams]="{ datum: date() }"
          >Zurück zur Übersicht</a
        >
      }

      <button type="button" (click)="shift.emit(-1)" [attr.aria-label]="backLabel()">
        <app-icon name="back" />
      </button>
      <button type="button" (click)="today.emit()">Heute</button>
      <button type="button" (click)="shift.emit(1)" [attr.aria-label]="forwardLabel()">
        <app-icon name="forward" />
      </button>

      <!-- Schmal schrumpft das Feld auf sein Symbol: das Datum steht als
           Überschrift schon da, ein zweites Mal ausgeschrieben kostet nur
           Breite. Das Feld selbst bleibt liegen und deckt das Symbol
           durchsichtig zu — so öffnet der Griff weiterhin den Auswähler des
           Geräts, statt dass wir einen nachbauen. -->
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

    // Dieselbe Schwelle wie im Kalendergerüst: unterhalb der Mindestbreite des
    // Rasters wird gescrollt, und die Leiste gibt her, was sie entbehren kann.
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

      // Schmal bleibt vom Weg in die Verwaltung nur das Zahnrad — ein
      // unterstrichenes Symbol sähe nach Fehler aus.
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

        // Das durchsichtige Feld liegt über dem Symbol und bestimmt damit den
        // Zeiger. Hier tippt man nicht, hier schlägt man auf.
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

  /**
   * Öffnet den Datumsauswähler von Hand — aber nur im schmalen Zustand, wo das
   * durchsichtige Feld über dem Symbol liegt und ein Klick sonst ins Leere
   * ginge. Ob dieser Zustand gilt, verrät das Symbol selbst: ausgeblendet hat
   * es kein `offsetParent`. So steht die Schwelle nur im Stylesheet und nicht
   * ein zweites Mal hier.
   */
  protected openPicker(icon: HTMLElement, picker: HTMLInputElement): void {
    if (icon.offsetParent) {
      picker.showPicker?.();
    }
  }
}
