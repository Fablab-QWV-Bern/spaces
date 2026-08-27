import { DestroyRef, inject } from '@angular/core';

import { CalendarStore } from './calendar-store';

/**
 * Left and right arrow keys page the calendar by one step — a day, a week or a
 * month, whichever the view's zoom level makes of it. `store.shift()` already
 * knows that unit, so this only translates the key press into a direction, the
 * same one the toolbar's arrows emit.
 *
 * The keys are left alone wherever text is being entered: the toolbar's date
 * field, the booking form, anything `contenteditable`. There the arrows move a
 * caret, and paging the calendar underneath would be a surprise. A held
 * modifier is a browser or OS shortcut and is not ours to take either.
 *
 * To be called in the constructor of a calendar view.
 */
export function pageWithArrowKeys(): void {
  const store = inject(CalendarStore);

  const onKeydown = (event: KeyboardEvent): void => {
    if (
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey
    ) {
      return;
    }

    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }

    if (isTyping(event.target)) {
      return;
    }

    event.preventDefault();
    store.shift(event.key === 'ArrowLeft' ? -1 : 1);
  };

  window.addEventListener('keydown', onKeydown);
  inject(DestroyRef).onDestroy(() => window.removeEventListener('keydown', onKeydown));
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
