import { Component, ElementRef, computed, input, model, signal, viewChild } from '@angular/core';

import { Icon } from '../shared/icon';

/**
 * Eingabe einer Tag-Liste: bereits gesetzte Tags als Marken, dahinter ein Feld
 * für den nächsten.
 *
 * Die Vorschlagsliste ist selbst gebaut, obwohl `<datalist>` genau dafür da wäre.
 * Der Grund ist eine Anforderung, die das Element nicht erfüllt: die Liste soll
 * schon offen sein, bevor etwas getippt ist, damit man sieht, welche Tags es in
 * der Werkstatt überhaupt gibt. Aufklappen lässt sich ein `<datalist>` nur mit
 * `showPicker()`, und das können nur die Chromium-Browser — in Firefox erschiene
 * die Liste erst ab dem ersten Zeichen.
 *
 * Der erste passende Vorschlag wird ausserdem in die Eingabe geschrieben und der
 * ergänzte Teil markiert. Damit reicht Enter, um ihn zu übernehmen, und
 * Weitertippen überschreibt ihn — wie in der Adresszeile des Browsers.
 */
@Component({
  selector: 'app-tag-input',
  imports: [Icon],
  template: `
    <div #root class="tag-input" (focusin)="open.set(true)" (focusout)="onFocusOut($event)">
      <div class="tags">
        @for (tag of value(); track tag) {
          <span class="tag">
            {{ tag }}
            <button type="button" [attr.aria-label]="tag + ' entfernen'" (click)="remove(tag)">
              <app-icon name="remove" />
            </button>
          </span>
        }

        <input
          #field
          type="text"
          [attr.placeholder]="placeholder()"
          autocomplete="off"
          spellcheck="false"
          (input)="onInput($event)"
          (keydown)="onKeydown($event)"
          (blur)="commit()"
        />
      </div>

      @if (open() && matches().length) {
        <div class="suggestions">
          @for (tag of matches(); track tag) {
            <!--
              mousedown statt click zum Verhindern: sonst verlöre das Feld den
              Fokus, bevor der Klick ankommt — und der Blur setzte den halb
              getippten Tag.
            -->
            <!--
              Nicht in der Tab-Reihenfolge: von hier aus führt Tab zum nächsten
              Formularfeld, nicht durch die Vorschläge. Wer tippt, kommt über
              die Vervollständigung schneller ans Ziel.
            -->
            <button
              type="button"
              class="suggestion"
              tabindex="-1"
              (mousedown)="$event.preventDefault()"
              (click)="choose(tag)"
            >
              {{ tag }}
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .tags {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.3rem;
      padding: 0.25rem 0.35rem;
      border: 1px solid var(--line-strong);
      border-radius: 0.25rem;
      background: var(--paper);

      &:focus-within {
        outline: 2px solid var(--accent);
        outline-offset: -1px;
      }
    }

    .tag {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
      padding: 0.1rem 0.2rem 0.1rem 0.4rem;
      border-radius: 0.2rem;
      background: var(--line);
      font-size: 0.8rem;

      button {
        border: 0;
        background: none;
        padding: 0 0.15rem;
        font: inherit;
        font-size: 0.9rem;
        line-height: 1;
        color: var(--text-muted);
        cursor: pointer;

        &:hover {
          color: var(--danger-text);
        }
      }
    }

    input {
      flex: 1 1 6rem;
      min-width: 6rem;
      border: 0;
      padding: 0.15rem;
      font: inherit;
      font-size: 0.9rem;

      &:focus {
        outline: none;
      }
    }

    // Die Vorschläge stehen im Fluss, nicht darüber: sie sind wenige und kurz,
    // und ein schwebendes Feld verdeckte hier nur das nächste Formularfeld.
    .suggestions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
      margin-top: 0.3rem;
    }

    .suggestion {
      padding: 0.1rem 0.4rem;
      border: 1px dashed var(--line-strong);
      border-radius: 0.2rem;
      background: none;
      font: inherit;
      font-size: 0.8rem;
      color: var(--text-muted);
      cursor: pointer;

      &:hover,
      &:focus-visible {
        border-style: solid;
        background: var(--line);
        color: var(--ink);
      }
    }
  `,
})
export class TagInput {
  readonly value = model.required<string[]>();
  /** Alle bisher irgendwo vergebenen Tags. */
  readonly suggestions = input<string[]>([]);
  readonly placeholder = input('');

  protected readonly open = signal(false);

  /**
   * Was im Feld angefangen ist. Steht doppelt da — im Feld selbst und hier —,
   * weil eine `[value]`-Bindung bei jedem Tastendruck den Wert neu setzte und
   * damit die Markierung der Vervollständigung ans Ende schöbe. Das Signal
   * trägt darum nur das *Getippte*, nicht das Ergänzte: sonst filterte sich die
   * Liste nach einem Vorschlag sofort auf ihn allein zusammen.
   */
  private readonly typed = signal('');
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private readonly root = viewChild.required<ElementRef<HTMLElement>>('root');

  /** Was schon gesetzt ist, muss nicht mehr vorgeschlagen werden. */
  private readonly unused = computed(() => {
    const taken = new Set(this.value().map((tag) => tag.toLowerCase()));

    return this.suggestions().filter((tag) => !taken.has(tag.toLowerCase()));
  });

  protected readonly matches = computed(() => {
    const typed = this.typed().toLowerCase();

    return this.unused().filter((tag) => tag.toLowerCase().startsWith(typed));
  });

  protected onInput(event: Event): void {
    const input = this.field().nativeElement;

    // Ein Komma trennt, statt im Tag zu landen — so kann man eine Liste am
    // Stück tippen, wie man es von solchen Feldern kennt.
    if (input.value.includes(',')) {
      const parts = input.value.split(',');
      input.value = parts.pop() ?? '';
      parts.forEach((part) => this.add(part));
      this.typed.set(input.value);

      return;
    }

    this.typed.set(input.value);

    // Nur beim Schreiben ergänzen: beim Löschen wüchse das Feld sonst sofort
    // wieder auf den Vorschlag zurück.
    if ((event as InputEvent).inputType?.startsWith('insert')) {
      this.suggest(input);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      // Sonst schickte Enter das ganze Formular ab.
      event.preventDefault();
      this.commit();
    }

    // Tab nimmt den angefangenen Tag an, statt weiterzuspringen: wer gerade
    // tippt, will den nächsten Tag setzen und nicht das nächste Feld. Ist das
    // Feld leer, gibt es nichts anzunehmen und Tab führt wie überall weiter.
    if (event.key === 'Tab' && !event.shiftKey && this.field().nativeElement.value !== '') {
      event.preventDefault();
      this.commit();
    }

    if (event.key === 'Escape' && this.open()) {
      // Solange die Liste offen ist, schliesst Escape nur sie — erst danach
      // darf es weiterreichen, etwa an einen Dialog darum herum.
      event.stopPropagation();
      this.open.set(false);
    }

    if (event.key === 'Backspace' && this.field().nativeElement.value === '') {
      this.value.update((tags) => tags.slice(0, -1));
    }
  }

  /** Schliesst die Liste, sobald der Fokus die ganze Komponente verlässt. */
  protected onFocusOut(event: FocusEvent): void {
    if (!this.root().nativeElement.contains(event.relatedTarget as Node | null)) {
      this.open.set(false);
    }
  }

  protected choose(tag: string): void {
    this.add(tag);
    this.clear();
    this.field().nativeElement.focus();
  }

  protected commit(): void {
    this.add(this.field().nativeElement.value);
    this.clear();
  }

  protected remove(tag: string): void {
    this.value.update((tags) => tags.filter((other) => other !== tag));
  }

  /**
   * Schreibt den Rest des ersten passenden Vorschlags hinter das Getippte und
   * markiert ihn. Die getippte Schreibweise bleibt stehen — wer "Laut" tippt,
   * soll nicht plötzlich "laut" vor sich haben.
   */
  private suggest(input: HTMLInputElement): void {
    const typed = input.value;

    if (typed === '') {
      return;
    }

    const match = this.matches()[0];

    if (!match || match.length === typed.length) {
      return;
    }

    input.value = typed + match.slice(typed.length);
    input.setSelectionRange(typed.length, match.length);
  }

  private clear(): void {
    this.field().nativeElement.value = '';
    this.typed.set('');
  }

  private add(raw: string): void {
    const tag = raw.trim().replace(/^#/, '');

    if (tag === '') {
      return;
    }

    // Gross- und Kleinschreibung unterscheidet die Datenbank nicht; ein zweites
    // "Laut" neben "laut" wäre derselbe Tag.
    this.value.update((tags) =>
      tags.some((other) => other.toLowerCase() === tag.toLowerCase()) ? tags : [...tags, tag],
    );
  }
}
