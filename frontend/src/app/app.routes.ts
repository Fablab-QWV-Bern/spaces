import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    path: 'calendar',
    loadComponent: () => import('./features/calendar/calendar.component').then(m => m.CalendarComponent)
  },
  {
    path: 'workplace-calendar',
    loadComponent: () => import('./features/workplace-calendar/workplace-calendar.component').then(m => m.WorkplaceCalendarComponent)
  }
];
