import { effect, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { CalendarStore, IsoDate } from './calendar-store';

/**
 * Ties the calendar's date to the address bar: `?datum=` is picked up on entry,
 * and afterwards every change writes it back.
 *
 * That makes a view linkable, and the switch between zoom levels carries the
 * displayed period along even though it leads to a different route. Writing uses
 * `replaceUrl`, otherwise every paging step would fill the history and the back
 * button would never reach the previous zoom level.
 *
 * To be called in the constructor of a calendar view.
 */
export function syncDateWithUrl(): void {
  const store = inject(CalendarStore);
  const route = inject(ActivatedRoute);
  const router = inject(Router);

  const initial = route.snapshot.queryParamMap.get('datum');

  if (initial && isIsoDate(initial)) {
    store.date.set(initial);
  }

  effect(() => {
    void router.navigate([], {
      relativeTo: route,
      queryParams: { datum: store.date() },
      // Without `merge`, every date change replaces the whole query — the
      // single-workplace view would lose its workplace on every paging step.
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });
}

function isIsoDate(value: string): value is IsoDate {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`));
}
