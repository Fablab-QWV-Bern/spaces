import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TagInput } from './tag-input';

@Component({
  imports: [TagInput],
  template: `<app-tag-input [(value)]="tags" [suggestions]="['laut', 'leise', 'staubig']" />`,
})
class Host {
  readonly tags = signal<string[]>([]);
}

describe('TagInput', () => {
  let fixture: ComponentFixture<Host>;

  const field = () => fixture.nativeElement.querySelector('input') as HTMLInputElement;
  const suggestions = () =>
    [...fixture.nativeElement.querySelectorAll('.suggestion')].map((node) =>
      (node as HTMLElement).textContent?.trim(),
    );

  const type = (text: string) => {
    const input = field();
    input.value = text;
    input.dispatchEvent(new InputEvent('input', { inputType: 'insertText' }));
    fixture.detectChanges();
  };

  const press = (key: string) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    field().dispatchEvent(event);
    fixture.detectChanges();

    return event;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    field().focus();
    field().dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    fixture.detectChanges();
  });

  it('shows all suggestions on focus and filters them while typing', () => {
    expect(suggestions()).toEqual(['laut', 'leise', 'staubig']);

    type('la');

    expect(suggestions()).toEqual(['laut']);
  });

  it('completes to the first match and selects the completed part', () => {
    type('la');

    expect(field().value).toBe('laut');
    expect([field().selectionStart, field().selectionEnd]).toEqual([2, 4]);
  });

  it('commits the tag with Enter and keeps the focus in the field', () => {
    type('la');
    press('Enter');

    expect(fixture.componentInstance.tags()).toEqual(['laut']);
    expect(field().value).toBe('');
    expect(document.activeElement).toBe(field());
    expect(suggestions()).toEqual(['leise', 'staubig']);
  });

  it('accepts the tag with Tab instead of jumping to the next field', () => {
    type('la');

    expect(press('Tab').defaultPrevented).toBe(true);
    expect(fixture.componentInstance.tags()).toEqual(['laut']);
    expect(document.activeElement).toBe(field());
  });

  it('lets Tab move on out of the empty field', () => {
    expect(press('Tab').defaultPrevented).toBe(false);
    expect(fixture.componentInstance.tags()).toEqual([]);
  });
});
