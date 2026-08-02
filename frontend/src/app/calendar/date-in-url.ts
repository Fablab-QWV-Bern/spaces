import { effect, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { CalendarStore, IsoDate } from './calendar-store';

/**
 * Verbindet das Datum des Kalenders mit der Adresszeile: beim Betreten wird
 * `?datum=` übernommen, danach schreibt jede Änderung es zurück.
 *
 * Damit ist eine Ansicht verlinkbar, und der Umschalter zwischen den Zoomstufen
 * nimmt den dargestellten Zeitraum mit, obwohl er auf eine andere Route führt.
 * Geschrieben wird mit `replaceUrl`, sonst füllte jeder Blätterschritt den
 * Verlauf und der Zurück-Knopf käme nie zur vorigen Zoomstufe.
 *
 * Aufzurufen im Konstruktor einer Kalenderansicht.
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
      // Ohne `merge` ersetzt jede Datumsänderung die ganze Abfrage — die
      // Einzelansicht verlöre bei jedem Blätterschritt ihren Arbeitsplatz.
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });
}

function isIsoDate(value: string): value is IsoDate {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00`));
}
