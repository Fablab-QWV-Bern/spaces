import { Routes } from '@angular/router';

import { AreaForm } from './admin/area-form';
import { AreaList } from './admin/area-list';
import { ConfigForm } from './admin/config-form';
import { RoleForm } from './admin/role-form';
import { RoleList } from './admin/role-list';
import { SeriesForm } from './admin/series-form';
import { SeriesList } from './admin/series-list';
import { WorkplaceForm } from './admin/workplace-form';
import { WorkplaceList } from './admin/workplace-list';
import { BookingForm } from './booking/booking-form';
import { DayCalendar } from './calendar/day-calendar';
import { WeekCalendar } from './calendar/week-calendar';
import { WorkplaceCalendar } from './calendar/workplace-calendar';
import { MapView } from './map/map-view';

// Every zoom level is its own route: that keeps a view linkable, and the back
// button leads to the previous level rather than to the previous date. The date
// travels along as the query parameter `datum` (see `date-in-url.ts`).
// The titles here are the information available without data — they say which
// page is open. What is on it, which day and which workplace, is added by the
// views themselves (`shared/page-title.ts`).
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tag' },
  { path: 'tag', component: DayCalendar, title: 'Tagesansicht' },
  { path: 'woche', component: WeekCalendar, title: 'Wochenansicht' },

  // The single-workplace view is not a third zoom level but a view of its own: a
  // fixed month, one day per row. The workplace travels along as `arbeitsplatz`
  // so that it too is linkable.
  { path: 'arbeitsplatz', component: WorkplaceCalendar, title: 'Ein Arbeitsplatz im Monat' },

  // The map carries no date: it shows who is here now and asks for it afresh
  // every minute. The time from its heading nevertheless does not belong in the
  // title — it would rewrite the tab every minute.
  { path: 'karte', component: MapView, title: 'Übersichtskarte — wer jetzt da ist' },
  { path: 'buchen', component: BookingForm, title: 'Neue Buchung' },

  // The admin area is not protected by a guard but by the backend: the views
  // load the session and show a notice when the role is not permitted. A guard
  // could only repeat what the server decides anyway — and would have to guess
  // while the session is still loading.
  { path: 'verwaltung', pathMatch: 'full', redirectTo: 'verwaltung/arbeitsplaetze' },
  { path: 'verwaltung/bereiche', component: AreaList, title: 'Bereiche verwalten' },
  { path: 'verwaltung/bereiche/neu', component: AreaForm, title: 'Neuer Bereich' },
  { path: 'verwaltung/bereiche/:id', component: AreaForm, title: 'Bereich bearbeiten' },
  { path: 'verwaltung/arbeitsplaetze', component: WorkplaceList, title: 'Arbeitsplätze verwalten' },
  {
    path: 'verwaltung/arbeitsplaetze/neu',
    component: WorkplaceForm,
    title: 'Neuer Arbeitsplatz',
  },
  {
    path: 'verwaltung/arbeitsplaetze/:id',
    component: WorkplaceForm,
    title: 'Arbeitsplatz bearbeiten',
  },
  { path: 'verwaltung/serien', component: SeriesList, title: 'Serien verwalten' },
  { path: 'verwaltung/serien/neu', component: SeriesForm, title: 'Neue Serie' },
  { path: 'verwaltung/serien/:id', component: SeriesForm, title: 'Serie bearbeiten' },
  { path: 'verwaltung/rollen', component: RoleList, title: 'Rollen verwalten' },
  { path: 'verwaltung/rollen/neu', component: RoleForm, title: 'Neue Rolle' },
  { path: 'verwaltung/rollen/:id', component: RoleForm, title: 'Rolle bearbeiten' },
  { path: 'verwaltung/konfiguration', component: ConfigForm, title: 'Konfiguration' },
];
