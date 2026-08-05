import {
  Directive,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

/**
 * Reordering the children of the host element by dragging — on the platform's
 * own drag and drop rather than on pointer handlers of our own, as with the
 * detail card in the calendar. `draggable` brings the drag image, the cursor and
 * the escape key along.
 *
 * The host is given the ids in the order in which its children stand; every
 * draggable child carries its own in `data-drag-id`. The moving happens while
 * dragging over rather than only on dropping: this way what is dragged is the
 * row itself instead of a copy above a gap, and the list under the pointer
 * always already shows the result. Because the `@for` around it tracks by id,
 * Angular moves the existing element rather than creating a new one — the drag
 * therefore survives its own effect.
 *
 * Every host is a closed group: something dragged out of it lands in an element
 * that no instance knows, and nothing happens. That is what keeps a workplace
 * inside its area without a rule of its own.
 *
 * Touch is not served — a finger fires no drag events. Whoever sorts here sits
 * in the admin area at a desk, and rearranging the workshop is not something
 * done on the way to the tram.
 */
@Directive({
  selector: '[appDragOrder]',
  host: {
    '(dragstart)': 'begin($event)',
    '(dragover)': 'over($event)',
    '(drop)': 'drop($event)',
    '(dragend)': 'end()',
  },
})
export class DragOrder {
  /** The ids of the children, in the order they stand in. */
  readonly order = input.required<readonly string[]>({ alias: 'appDragOrder' });

  /** The new order, already while dragging — one event per actual change. */
  readonly reordered = output<string[]>();

  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private readonly injector = inject(Injector);

  private readonly dragged = signal<HTMLElement | null>(null);

  protected begin(event: DragEvent): void {
    const element = itemOf(event.target);

    if (!element || !event.dataTransfer) {
      return;
    }

    this.dragged.set(element);
    element.classList.add('dragging');

    event.dataTransfer.effectAllowed = 'move';
    // Firefox starts no drag at all without a payload; nobody reads it.
    event.dataTransfer.setData('text/plain', element.dataset['dragId'] ?? '');
  }

  protected over(event: DragEvent): void {
    const dragged = this.dragged();

    if (!dragged) {
      return;
    }

    // Only a prevented dragover makes the element a drop target — without it the
    // pointer shows the "forbidden" sign the whole time and no drop follows.
    event.preventDefault();

    const target = itemOf(event.target);

    if (!target || target === dragged) {
      return;
    }

    const id = dragged.dataset['dragId'];
    const targetId = target.dataset['dragId'];

    if (!id || !targetId) {
      return;
    }

    // Past the middle of the target it goes behind it, before that in front —
    // otherwise the row would jump back and forth under a pointer standing
    // still at the edge.
    const box = target.getBoundingClientRect();
    const behind = event.clientY > box.top + box.height / 2;

    const order = moved(this.order(), id, targetId, behind);

    if (order && order.some((entry, position) => entry !== this.order()[position])) {
      this.glide();
      this.reordered.emit(order);
    }
  }

  /**
   * The rows do not jump into their new place, they slide there: measured
   * before, and once Angular has rearranged them they are put back to where
   * they came from and let go. The way back is animated by the stylesheet —
   * only the distance is known here, and how long it takes is a question of
   * appearance like any other.
   *
   * Measuring happens with whatever transform is currently in effect: during a
   * quick drag the next reorder catches the previous slide mid-way, and it is
   * to that visible position that the new one has to tie on.
   */
  private glide(): void {
    const before = new Map(
      this.items().map((item) => [item, item.getBoundingClientRect().top] as const),
    );

    afterNextRender(
      {
        mixedReadWrite: () => {
          for (const item of this.items()) {
            const from = before.get(item);

            if (from === undefined) {
              continue;
            }

            // Without the transform, so the layout position rather than the one
            // a running slide is currently showing.
            item.style.transform = '';
            const distance = from - item.getBoundingClientRect().top;

            if (Math.abs(distance) < 1) {
              continue;
            }

            item.classList.add('settling');
            item.style.transform = `translateY(${distance}px)`;

            // Reading the layout forces the browser to accept the offset as a
            // state of its own; without it, setting and clearing it in the same
            // frame would amount to nothing having happened.
            void item.offsetHeight;

            item.classList.remove('settling');
            item.style.transform = '';
          }
        },
      },
      { injector: this.injector },
    );
  }

  private items(): HTMLElement[] {
    return [...this.host.querySelectorAll<HTMLElement>('[data-drag-id]')];
  }

  protected drop(event: DragEvent): void {
    // The order is already right; what is left to prevent is the browser doing
    // something with the payload of its own accord.
    event.preventDefault();
    this.end();
  }

  protected end(): void {
    this.dragged()?.classList.remove('dragging');
    this.dragged.set(null);
  }
}

/**
 * `id` in front of or behind `targetId`, both taken out of the order first: the
 * position is meant in the list without the dragged entry, otherwise moving
 * downwards would land one place short of where the pointer is.
 *
 * Null when one of the two is not in the list — then something is being dragged
 * that belongs to another group.
 */
export function moved(
  order: readonly string[],
  id: string,
  targetId: string,
  behind: boolean,
): string[] | null {
  if (!order.includes(id)) {
    return null;
  }

  const rest = order.filter((entry) => entry !== id);
  const index = rest.indexOf(targetId);

  if (index < 0) {
    return null;
  }

  rest.splice(behind ? index + 1 : index, 0, id);

  return rest;
}

/** The draggable element the event started from — the handle sits inside it. */
function itemOf(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>('[data-drag-id]') : null;
}
