import { Component, computed, input } from '@angular/core';

import { ICON_PATHS, IconName } from './icon-paths';

export type { IconName };

/**
 * An icon as inline SVG.
 *
 * No icon font: that would need either a request to Google or several megabytes
 * of payload, and until it arrives the ligature name stands in plain text in the
 * bar. Nor `lucide-angular` — its peer range ends at Angular 21. The paths come
 * from `lucide-static` at build time instead, see `scripts/generate-icons.mjs`.
 *
 * Drawing happens in `currentColor` — so the same rule applies to icons as to
 * everything else: the colour comes from the palette and appears nowhere as a
 * value in the code. A coloured emoji could not do that.
 *
 * The size hangs off the font (`1em`), not off an input. An icon always stands
 * beside or in place of text and should grow with it.
 */
@Component({
  selector: 'app-icon',
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      focusable="false"
      [attr.role]="label() ? 'img' : null"
      [attr.aria-label]="label() || null"
      [attr.aria-hidden]="label() ? null : 'true'"
    >
      @for (d of paths(); track d) {
        <path [attr.d]="d"></path>
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      // Moves the icon to the optical middle of the line rather than the
      // baseline an inline box would otherwise sit on.
      vertical-align: -0.125em;
    }

    svg {
      display: block;
      width: 1em;
      height: 1em;
    }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();

  /**
   * Empty when the icon merely repeats what stands next to it — then it stays
   * invisible to screen readers. When it stands alone, its meaning belongs here.
   */
  readonly label = input('');

  protected readonly paths = computed(() => ICON_PATHS[this.name()]);
}
