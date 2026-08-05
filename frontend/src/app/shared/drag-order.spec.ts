import { describe, expect, it } from 'vitest';

import { moved } from './drag-order';

describe('moved', () => {
  const order = ['a', 'b', 'c', 'd'];

  it('puts the dragged entry in front of the target', () => {
    expect(moved(order, 'd', 'b', false)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('puts it behind the target', () => {
    expect(moved(order, 'd', 'b', true)).toEqual(['a', 'b', 'd', 'c']);
  });

  // Counted in the list without the dragged entry: with its own place still in
  // it, dragging downwards would stop one short of the target every time.
  it('reaches the end when dragging downwards', () => {
    expect(moved(order, 'a', 'd', true)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('leaves the order alone when nothing changes', () => {
    expect(moved(order, 'b', 'a', true)).toEqual(order);
  });

  // Everything dragged out of its group ends up here: a group knows only its
  // own ids, and that is what keeps a workplace inside its area.
  it('reports a foreign entry as no move', () => {
    expect(moved(order, 'x', 'b', true)).toBeNull();
    expect(moved(order, 'b', 'x', true)).toBeNull();
  });
});
