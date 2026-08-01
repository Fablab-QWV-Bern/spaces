import { Routes } from '@angular/router';

import { AreaForm } from './admin/area-form';
import { AreaList } from './admin/area-list';
import { ConfigForm } from './admin/config-form';
import { RoleForm } from './admin/role-form';
import { RoleList } from './admin/role-list';
import { WorkplaceForm } from './admin/workplace-form';
import { WorkplaceList } from './admin/workplace-list';
import { BookingForm } from './booking/booking-form';
import { DayCalendar } from './calendar/day-calendar';
import { WeekCalendar } from './calendar/week-calendar';

// Jede Zoomstufe ist eine eigene Route: so bleibt eine Ansicht verlinkbar, und
// der Zurück-Knopf führt zur vorigen Stufe statt zum vorigen Datum. Das Datum
// reist als Abfrageparameter `datum` mit (siehe `date-in-url.ts`).
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tag' },
  { path: 'tag', component: DayCalendar, title: 'Alle Arbeitsplätze — Tag' },
  { path: 'woche', component: WeekCalendar, title: 'Alle Arbeitsplätze — Woche' },
  { path: 'buchen', component: BookingForm, title: 'Buchung' },

  // Die Verwaltung ist nicht durch einen Guard geschützt, sondern durch das
  // Backend: die Ansichten laden die Sitzung und zeigen einen Hinweis, wenn die
  // Rolle nicht darf. Ein Guard könnte nur wiederholen, was der Server ohnehin
  // entscheidet — und müsste dafür raten, solange die Sitzung noch lädt.
  { path: 'verwaltung', pathMatch: 'full', redirectTo: 'verwaltung/arbeitsplaetze' },
  { path: 'verwaltung/bereiche', component: AreaList, title: 'Bereiche' },
  { path: 'verwaltung/bereiche/neu', component: AreaForm, title: 'Neuer Bereich' },
  { path: 'verwaltung/bereiche/:id', component: AreaForm, title: 'Bereich bearbeiten' },
  { path: 'verwaltung/arbeitsplaetze', component: WorkplaceList, title: 'Arbeitsplätze' },
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
  { path: 'verwaltung/rollen', component: RoleList, title: 'Rollen' },
  { path: 'verwaltung/rollen/neu', component: RoleForm, title: 'Neue Rolle' },
  { path: 'verwaltung/rollen/:id', component: RoleForm, title: 'Rolle bearbeiten' },
  { path: 'verwaltung/konfiguration', component: ConfigForm, title: 'Konfiguration' },
];
