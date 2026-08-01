import { Routes } from '@angular/router';

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
];
