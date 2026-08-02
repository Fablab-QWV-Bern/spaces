import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Workplace } from '../api/models';
import { Icon } from '../shared/icon';
import { CalendarStore } from './calendar-store';

/**
 * Die Beschriftung einer Arbeitsplatzzeile: Name, Zustand, Wiki-Link.
 *
 * Der Host trägt die Klasse `label` und wird damit vom Gerüst der Ansicht
 * gestylt (`_calendar-chrome.scss`) — die Zeile sieht gleich aus wie eine
 * Kopf- oder Gruppenbeschriftung. Nur was hier drin steht, gehört hierher.
 *
 * Der Name führt in die Einzelansicht: die Zeile zeigt einen Tag bzw. eine
 * Woche dieses Arbeitsplatzes, der Klick den ganzen Monat. Das dargestellte
 * Datum kommt aus dem Store und nicht als Eingabe — die Beschriftung steht
 * ohnehin nur in Ansichten, die ihn gefüllt haben, und zwei Ansichten müssten
 * es sonst durchreichen, ohne selbst etwas damit zu tun.
 */
@Component({
  selector: 'app-workplace-label',
  imports: [Icon, RouterLink],
  host: { class: 'label' },
  template: `
    <a
      class="name"
      [class.dimmed]="status() !== null"
      routerLink="/arbeitsplatz"
      [queryParams]="{ arbeitsplatz: workplace().id, datum: store.date() }"
      [title]="'Monat von ' + workplace().name"
      >{{ workplace().name }}</a
    >

    @if (status(); as label) {
      <span class="status">{{ label }}</span>
    }

    @if (workplace().wikiUrl; as wikiUrl) {
      <a
        class="wiki"
        [href]="wikiUrl"
        target="_blank"
        rel="noopener"
        [attr.aria-label]="'Wiki zu ' + workplace().name"
      >
        <app-icon name="external" />
      </a>
    }
  `,
  styles: `
    // Als Link, aber nicht wie einer gesetzt: die Spalte ist eine Beschriftung
    // und keine Linkliste. Erst beim Überfahren gibt sie sich zu erkennen.
    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: inherit;
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }

    .dimmed {
      color: var(--text-faint);
      text-decoration: line-through;
    }

    .status {
      font-size: 0.7rem;
      color: var(--text-soft);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .wiki {
      color: var(--text-soft);
      text-decoration: none;
    }
  `,
})
export class WorkplaceLabel {
  protected readonly store = inject(CalendarStore);

  readonly workplace = input.required<Workplace>();

  /** Null, solange der Platz benutzbar ist — dann steht nur der Name da. */
  protected readonly status = computed(
    () => ({ DEFECT: 'defekt', DISABLED: 'ausgeblendet', OK: null })[this.workplace().status],
  );
}
