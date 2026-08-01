import { Component, computed, input } from '@angular/core';

import { Workplace } from '../api/models';

/**
 * Die Beschriftung einer Arbeitsplatzzeile: Name, Zustand, Wiki-Link.
 *
 * Der Host trägt die Klasse `label` und wird damit vom Gerüst der Ansicht
 * gestylt (`_calendar-chrome.scss`) — die Zeile sieht gleich aus wie eine
 * Kopf- oder Gruppenbeschriftung. Nur was hier drin steht, gehört hierher.
 */
@Component({
  selector: 'app-workplace-label',
  host: { class: 'label' },
  template: `
    <span class="name" [class.dimmed]="status() !== null">{{ workplace().name }}</span>

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
        >↗</a
      >
    }
  `,
  styles: `
    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dimmed {
      color: #94a3b8;
      text-decoration: line-through;
    }

    .status {
      font-size: 0.7rem;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .wiki {
      color: #64748b;
      text-decoration: none;
    }
  `,
})
export class WorkplaceLabel {
  readonly workplace = input.required<Workplace>();

  /** Null, solange der Platz benutzbar ist — dann steht nur der Name da. */
  protected readonly status = computed(
    () => ({ DEFECT: 'defekt', DISABLED: 'ausgeblendet', OK: null })[this.workplace().status],
  );
}
