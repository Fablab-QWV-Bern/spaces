import { Component, ElementRef, computed, input, model, signal, viewChild } from '@angular/core';

import { Icon } from '../shared/icon';

/**
 * Entering a list of tags: tags already set as chips, followed by a field for the
 * next one.
 *
 * The suggestion list is hand-built even though `<datalist>` exists for exactly
 * this. The reason is a requirement the element does not meet: the list should
 * already be open before anything is typed, so that one can see which tags exist
 * in the workshop at all. A `<datalist>` can only be opened with `showPicker()`,
 * and only the Chromium browsers support that — in Firefox the list would appear
 * only from the first character.
 *
 * The first matching suggestion is also written into the input and the completed
 * part selected. That way Enter is enough to accept it, and typing on overwrites
 * it — as in the browser's address bar.
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
              mousedown rather than click to prevent: otherwise the field would
              lose focus before the click arrives — and the blur would commit the
              half-typed tag.
            -->
            <!--
              Not in the tab order: from here Tab leads to the next form field,
              not through the suggestions. Whoever is typing gets there faster via
              the completion.
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

    // The suggestions sit in the flow rather than above it: they are few and
    // short, and a floating panel would only cover the next form field here.
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
  /** All tags assigned anywhere so far. */
  readonly suggestions = input<string[]>([]);
  readonly placeholder = input('');

  protected readonly open = signal(false);

  /**
   * What has been started in the field. It exists twice — in the field itself and
   * here — because a `[value]` binding would reset the value on every keystroke
   * and thereby push the completion's selection to the end. The signal therefore
   * carries only what was *typed*, not what was completed: otherwise the list
   * would immediately narrow to a single suggestion once one appeared.
   */
  private readonly typed = signal('');
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private readonly root = viewChild.required<ElementRef<HTMLElement>>('root');

  /** What is already set need not be suggested again. */
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

    // A comma separates rather than ending up in the tag — so a list can be typed
    // in one go, as one expects from such fields.
    if (input.value.includes(',')) {
      const parts = input.value.split(',');
      input.value = parts.pop() ?? '';
      parts.forEach((part) => this.add(part));
      this.typed.set(input.value);

      return;
    }

    this.typed.set(input.value);

    // Complete only while writing: when deleting, the field would otherwise
    // immediately grow back to the suggestion.
    if ((event as InputEvent).inputType?.startsWith('insert')) {
      this.suggest(input);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      // Otherwise Enter would submit the whole form.
      event.preventDefault();
      this.commit();
    }

    // Tab accepts the tag being typed rather than moving on: whoever is typing
    // wants to set the next tag and not the next field. If the field is empty
    // there is nothing to accept and Tab moves on as it does everywhere.
    if (event.key === 'Tab' && !event.shiftKey && this.field().nativeElement.value !== '') {
      event.preventDefault();
      this.commit();
    }

    if (event.key === 'Escape' && this.open()) {
      // While the list is open, Escape only closes it — only afterwards may it
      // propagate, for instance to a dialog around it.
      event.stopPropagation();
      this.open.set(false);
    }

    if (event.key === 'Backspace' && this.field().nativeElement.value === '') {
      this.value.update((tags) => tags.slice(0, -1));
    }
  }

  /** Closes the list as soon as focus leaves the whole component. */
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
   * Writes the remainder of the first matching suggestion after what was typed and
   * selects it. The typed spelling stays — someone who types "Laut" should not
   * suddenly be looking at "laut".
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

    // The database does not distinguish case; a second "Laut" next to "laut"
    // would be the same tag.
    this.value.update((tags) =>
      tags.some((other) => other.toLowerCase() === tag.toLowerCase()) ? tags : [...tags, tag],
    );
  }
}
