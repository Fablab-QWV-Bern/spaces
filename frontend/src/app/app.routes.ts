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

// Jede Zoomstufe ist eine eigene Route: so bleibt eine Ansicht verlinkbar, und
// der Zurück-Knopf führt zur vorigen Stufe statt zum vorigen Datum. Das Datum
// reist als Abfrageparameter `datum` mit (siehe `date-in-url.ts`).
// Die Titel hier sind die Auskunft, die ohne Daten möglich ist — sie sagen,
// welche Seite offen ist. Was auf ihr steht, welcher Tag also und welcher
// Arbeitsplatz, tragen die Ansichten selbst nach (`shared/page-title.ts`).
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tag' },
  { path: 'tag', component: DayCalendar, title: 'Tagesansicht' },
  { path: 'woche', component: WeekCalendar, title: 'Wochenansicht' },

  // Die Einzelansicht ist keine dritte Zoomstufe, sondern eine eigene Sicht:
  // fix ein Monat, ein Tag je Zeile. Der Arbeitsplatz reist als `arbeitsplatz`
  // mit, damit auch sie verlinkbar ist.
  { path: 'arbeitsplatz', component: WorkplaceCalendar, title: 'Ein Arbeitsplatz im Monat' },

  // Die Karte trägt kein Datum: sie zeigt, wer jetzt da ist, und fragt das jede
  // Minute neu nach. Die Uhrzeit aus ihrer Überschrift gehört trotzdem nicht in
  // den Titel — sie schriebe den Reiter jede Minute neu.
  { path: 'karte', component: MapView, title: 'Übersichtskarte — wer jetzt da ist' },
  { path: 'buchen', component: BookingForm, title: 'Neue Buchung' },

  // Die Verwaltung ist nicht durch einen Guard geschützt, sondern durch das
  // Backend: die Ansichten laden die Sitzung und zeigen einen Hinweis, wenn die
  // Rolle nicht darf. Ein Guard könnte nur wiederholen, was der Server ohnehin
  // entscheidet — und müsste dafür raten, solange die Sitzung noch lädt.
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
