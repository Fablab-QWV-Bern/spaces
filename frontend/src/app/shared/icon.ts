import { Component, computed, input } from '@angular/core';

import { ICON_PATHS, IconName } from './icon-paths';

export type { IconName };

/**
 * Ein Symbol als eingebettetes SVG.
 *
 * Keine Icon-Font: die brauchte entweder einen Request zu Google oder mehrere
 * Megabyte im Auslieferungsgepäck, und bis sie da ist, steht der Ligaturname im
 * Klartext in der Leiste. Auch nicht `lucide-angular` — dessen Peer-Bereich
 * endet bei Angular 21. Die Pfade kommen stattdessen beim Bauen aus
 * `lucide-static`, siehe `scripts/generate-icons.mjs`.
 *
 * Gezeichnet wird in `currentColor` — damit gilt für Symbole dieselbe Regel wie
 * für alles andere: die Farbe kommt aus der Palette und steht nirgends als Wert
 * im Code. Ein farbiges Emoji konnte das nicht.
 *
 * Die Grösse hängt an der Schrift (`1em`), nicht an einer Eingabe. Ein Symbol
 * steht immer neben oder anstelle von Text und soll mit ihm wachsen.
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
      // Rückt das Symbol auf die optische Mitte der Zeile statt auf die
      // Grundlinie, auf der ein inline-Kasten sonst sässe.
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
   * Leer, wenn das Symbol nur wiederholt, was daneben steht — dann bleibt es
   * für Vorlesegeräte unsichtbar. Steht es allein, gehört seine Bedeutung
   * hierher.
   */
  readonly label = input('');

  protected readonly paths = computed(() => ICON_PATHS[this.name()]);
}
