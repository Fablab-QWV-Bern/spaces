import { Routes } from '@angular/router';

import { BookingForm } from './booking/booking-form';
import { DayCalendar } from './calendar/day-calendar';

export const routes: Routes = [
  { path: '', component: DayCalendar, title: 'Alle Arbeitsplätze' },
  { path: 'buchen', component: BookingForm, title: 'Buchung' },
];
