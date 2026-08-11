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
  templateUrl: './tag-input.html',
  styleUrl: './tag-input.scss',
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
