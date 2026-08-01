import { Injectable, signal } from '@angular/core';

import { CardDetails } from './blocks';

/** Muss mit dem `position-anchor` in booking-card.scss übereinstimmen. */
const ANCHOR_NAME = '--hovered-block';

/**
 * Die Klammer zwischen den Balken und der einen Detailkarte einer Ansicht.
 *
 * Positioniert wird über CSS Anchor Positioning: der überfahrene Block bekommt
 * den `anchor-name`, die Karte hängt sich daran — keine Koordinatenrechnung,
 * und am Viewport-Rand klappt sie von selbst um. Immer nur ein Block trägt den
 * Namen, darum wird er hier zentral verwaltet.
 */
@Injectable({ providedIn: 'root' })
export class BlockHover {
  readonly details = signal<CardDetails | null>(null);

  private card: HTMLElement | null = null;
  private anchored: HTMLElement | null = null;

  /** Die Karte meldet sich selbst an — nur sie kennt ihr Popover-Element. */
  register(card: HTMLElement): void {
    this.card = card;
  }

  show(details: CardDetails, anchor: HTMLElement): void {
    this.releaseAnchor();
    anchor.style.setProperty('anchor-name', ANCHOR_NAME);
    this.anchored = anchor;

    this.details.set(details);

    // showPopover() wirft, wenn das Popover bereits offen ist — beim Wechsel von
    // einem Block zum nächsten ist es das.
    if (this.card && !this.card.matches(':popover-open')) {
      this.card.showPopover();
    }
  }

  /**
   * Die Karte liegt lückenlos am Block, der Zeiger wechselt also direkt von
   * einem zum anderen. `relatedTarget` sagt, wohin er geht: bleibt er innerhalb
   * des Gespanns aus Block und Karte, bleibt die Karte offen.
   */
  hide(event: MouseEvent | FocusEvent): void {
    const target = event.relatedTarget as Node | null;

    if (target && (this.card?.contains(target) || this.anchored?.contains(target))) {
      return;
    }

    this.card?.hidePopover();
    this.releaseAnchor();
    this.details.set(null);
  }

  private releaseAnchor(): void {
    this.anchored?.style.removeProperty('anchor-name');
    this.anchored = null;
  }
}
