import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Workplace } from '../api/models';
import { Icon } from '../shared/icon';
import { CalendarStore } from './calendar-store';

/**
 * The label of a workplace row: name, status, wiki link.
 *
 * The host carries the class `label` and is therefore styled by the view's
 * chrome (`_calendar-chrome.scss`) — the row looks the same as a header or group
 * label. Only what is written inside belongs here.
 *
 * The name leads into the single-workplace view: the row shows one day or week of
 * this workplace, the click shows the whole month. The displayed date comes from
 * the store rather than as an input — the label only appears in views that have
 * filled it anyway, and two views would otherwise have to pass it through without
 * doing anything with it themselves.
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
      ><bdi>{{ workplace().name }}</bdi></a
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
    // A link, but not styled like one: the column is a label, not a list of
    // links. Only on hover does it reveal itself.
    //
    // The label column is narrow. When the name does not fit, the ellipsis
    // should clip its front so the telling end (XL, 2, gross) stays visible:
    // direction rtl moves the clip to the inline start. The bdi element in the
    // template then keeps the bidi algorithm from reordering the Latin name
    // around its digits and hyphens.
    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: inherit;
      text-decoration: none;
      direction: rtl;

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

    @media (width < 48rem) {
      a.wiki {
        display: none;
      }
    }
  `,
})
export class WorkplaceLabel {
  protected readonly store = inject(CalendarStore);

  readonly workplace = input.required<Workplace>();

  /** Null while the workplace is usable — then only the name is shown. */
  protected readonly status = computed(
    () => ({ DEFECT: 'defekt', DISABLED: 'ausgeblendet', OK: null })[this.workplace().status],
  );
}
