import { Routes } from '@angular/router';

import { AdminRouteData, AdminShell } from './admin/admin-shell';
import { AreaForm } from './admin/area-form';
import { AreaList } from './admin/area-list';
import { ConfigForm } from './admin/config-form';
import { MapAdmin } from './admin/map-admin';
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

// What the admin pages have in common: the permission they need and how the
// notice reads without it. The heading differs from page to page and is added
// below.
const areas = { permission: 'manageAreas', needs: 'Zum Verwalten der Bereiche' } as const;
const workplaces = {
  permission: 'manageWorkplaces',
  needs: 'Zum Verwalten der Arbeitsplätze',
} as const;
const series = { permission: 'manageBookingSeries', needs: 'Zum Verwalten der Serien' } as const;
const roles = { permission: 'manageRoles', needs: 'Zum Verwalten der Rollen' } as const;

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

  // The admin area is still not protected by a guard but by the backend — a
  // guard would prevent the navigation and would have to redirect somewhere,
  // and the notice explaining why is exactly what should stay. What the route
  // does carry is the declaration: which permission a page needs and how its
  // notice reads. `AdminShell` reads it, loads the session once for the whole
  // area and only then activates the page — so no page fetches data it may not
  // see.
  {
    path: 'verwaltung',
    component: AdminShell,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'arbeitsplaetze' },
      {
        path: 'bereiche',
        component: AreaList,
        title: 'Bereiche verwalten',
        data: { ...areas, heading: 'Bereiche' } satisfies AdminRouteData,
      },
      {
        path: 'bereiche/neu',
        component: AreaForm,
        title: 'Neuer Bereich',
        data: { ...areas, heading: 'Neuer Bereich' } satisfies AdminRouteData,
      },
      {
        path: 'bereiche/:id',
        component: AreaForm,
        title: 'Bereich bearbeiten',
        data: { ...areas, heading: 'Bereich bearbeiten' } satisfies AdminRouteData,
      },
      {
        path: 'arbeitsplaetze',
        component: WorkplaceList,
        title: 'Arbeitsplätze verwalten',
        data: { ...workplaces, heading: 'Arbeitsplätze' } satisfies AdminRouteData,
      },
      {
        path: 'arbeitsplaetze/neu',
        component: WorkplaceForm,
        title: 'Neuer Arbeitsplatz',
        data: { ...workplaces, heading: 'Neuer Arbeitsplatz' } satisfies AdminRouteData,
      },
      {
        path: 'arbeitsplaetze/:id',
        component: WorkplaceForm,
        title: 'Arbeitsplatz bearbeiten',
        data: { ...workplaces, heading: 'Arbeitsplatz bearbeiten' } satisfies AdminRouteData,
      },
      {
        // The plan hangs off the workplaces' permission: whoever configures
        // benches configures the drawing they stand on.
        path: 'karte',
        component: MapAdmin,
        title: 'Karte verwalten',
        data: {
          ...workplaces,
          heading: 'Karte',
          needs: 'Zum Verwalten der Karte',
        } satisfies AdminRouteData,
      },
      {
        path: 'serien',
        component: SeriesList,
        title: 'Serien verwalten',
        data: { ...series, heading: 'Serien' } satisfies AdminRouteData,
      },
      {
        path: 'serien/neu',
        component: SeriesForm,
        title: 'Neue Serie',
        data: { ...series, heading: 'Neue Serie' } satisfies AdminRouteData,
      },
      {
        path: 'serien/:id',
        component: SeriesForm,
        title: 'Serie bearbeiten',
        data: { ...series, heading: 'Serie bearbeiten' } satisfies AdminRouteData,
      },
      {
        path: 'rollen',
        component: RoleList,
        title: 'Rollen verwalten',
        data: { ...roles, heading: 'Rollen' } satisfies AdminRouteData,
      },
      {
        path: 'rollen/neu',
        component: RoleForm,
        title: 'Neue Rolle',
        data: { ...roles, heading: 'Neue Rolle' } satisfies AdminRouteData,
      },
      {
        path: 'rollen/:id',
        component: RoleForm,
        title: 'Rolle bearbeiten',
        data: { ...roles, heading: 'Rolle bearbeiten' } satisfies AdminRouteData,
      },
      {
        // The global configuration hangs off the same permission as the roles.
        path: 'konfiguration',
        component: ConfigForm,
        title: 'Konfiguration',
        data: {
          ...roles,
          heading: 'Konfiguration',
          needs: 'Zum Ändern der globalen Konfiguration',
        } satisfies AdminRouteData,
      },
    ],
  },
];
