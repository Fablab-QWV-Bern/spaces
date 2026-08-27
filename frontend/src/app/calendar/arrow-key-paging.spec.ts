import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pageWithArrowKeys } from './arrow-key-paging';
import { CalendarStore } from './calendar-store';

describe('pageWithArrowKeys', () => {
  const shift = vi.fn();

  beforeEach(() => {
    shift.mockClear();
    TestBed.configureTestingModule({
      providers: [{ provide: CalendarStore, useValue: { shift } }],
    });
    TestBed.runInInjectionContext(() => pageWithArrowKeys());
  });

  afterEach(() => TestBed.resetTestingModule());

  function press(init: KeyboardEventInit, target: EventTarget = document.body): void {
    const event = new KeyboardEvent('keydown', { ...init, cancelable: true, bubbles: true });
    target.dispatchEvent(event);
  }

  it('pages back on ArrowLeft', () => {
    press({ key: 'ArrowLeft' });
    expect(shift).toHaveBeenCalledWith(-1);
  });

  it('pages forward on ArrowRight', () => {
    press({ key: 'ArrowRight' });
    expect(shift).toHaveBeenCalledWith(1);
  });

  it('ignores other keys', () => {
    press({ key: 'ArrowUp' });
    press({ key: 'a' });
    expect(shift).not.toHaveBeenCalled();
  });

  it('leaves the keys to a held modifier', () => {
    press({ key: 'ArrowLeft', ctrlKey: true });
    press({ key: 'ArrowRight', metaKey: true });
    expect(shift).not.toHaveBeenCalled();
  });

  it('does not steal the arrows from a text field', () => {
    const input = document.createElement('input');
    document.body.append(input);

    press({ key: 'ArrowLeft' }, input);
    expect(shift).not.toHaveBeenCalled();

    input.remove();
  });

  it('stops listening once the view is gone', () => {
    TestBed.resetTestingModule();
    press({ key: 'ArrowLeft' });
    expect(shift).not.toHaveBeenCalled();
  });
});
