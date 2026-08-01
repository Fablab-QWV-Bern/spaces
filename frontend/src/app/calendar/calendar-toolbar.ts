import { Component, computed, input, output } from '@angular/core';

import { SessionBar } from '../shared/session-bar';

/**
 * Kopfzeile des Kalenders: Zeitraum, Blättern, Datumswahl, Anmeldung.
 *
 * Was "ein Schritt" bedeutet, entscheidet die Ansicht — die Leiste meldet nur
 * Richtungen und beschriftet ihre Pfeile mit der Einheit, die sie bekommt.
 */
@Component({
  selector: 'app-calendar-toolbar',
  imports: [SessionBar],
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
  `,
})
export class CalendarToolbar {
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
