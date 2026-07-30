import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DefaultService } from '../../api/api/default.service';
import { Area } from '../../api/model/area';
import { Workplace } from '../../api/model/workplace';
import { Booking } from '../../api/model/booking';
import { Observable, BehaviorSubject, combineLatest, of } from 'rxjs';
import { map, switchMap, shareReplay, catchError } from 'rxjs/operators';
import { addDays, startOfDay, endOfDay, isSameDay, format } from 'date-fns';
import { CALENDAR_CONFIG } from '../calendar/calendar.constants';
import { TimelineHeaderComponent } from '../../shared/components/timeline-header/timeline-header.component';
import { TimelineTrackComponent } from '../../shared/components/timeline-track/timeline-track.component';
import { TimelineEvent } from '../../shared/model/timeline';

interface DayViewModel {
  date: Date;
  events: TimelineEvent[];
}

interface WorkplaceCalendarViewModel {
  workplaceId: string | null;
  startDate: Date;
  days: DayViewModel[];
  areas: (Area & { workplaces: Workplace[] })[];
  bookings: Booking[];
}

@Component({
  selector: 'app-workplace-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, TimelineHeaderComponent, TimelineTrackComponent],
  templateUrl: './workplace-calendar.component.html',
  styleUrls: ['./workplace-calendar.component.scss']
})
export class WorkplaceCalendarComponent implements OnInit {
  private apiService = inject(DefaultService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  private selectedWorkplaceIdSubject = new BehaviorSubject<string | null>(null);
  private startDateSubject = new BehaviorSubject<Date>(new Date());

  // Configuration
  readonly startHour = CALENDAR_CONFIG.startHour;
  readonly endHour = CALENDAR_CONFIG.endHour;
  readonly intervalMinutes = CALENDAR_CONFIG.intervalMinutes;
  readonly slotWidth = CALENDAR_CONFIG.slotWidth;
  readonly daysToShow = 14;

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['workplaceId']) {
        this.selectedWorkplaceIdSubject.next(params['workplaceId']);
      }
      if (params['date']) {
        this.startDateSubject.next(new Date(params['date']));
      }
    });
  }

  vm$: Observable<WorkplaceCalendarViewModel> = combineLatest([
    this.selectedWorkplaceIdSubject,
    this.startDateSubject,
    this.apiService.areasGet(),
    this.apiService.workplacesGet(true)
  ]).pipe(
    switchMap(([workplaceId, viewDate, areas, workplaces]) => {
      // Logic to auto-select first workplace if none selected
      if (!workplaceId && workplaces.length > 0) {
        const first = workplaces.find(w => w.status !== 'DISABLED') || workplaces[0];
        this.selectedWorkplaceIdSubject.next(first.id);
        return of({
          workplaceId: null,
          startDate: viewDate,
          days: [],
          areas: [],
          bookings: []
        });
      }

      if (!workplaceId) return of({
          workplaceId: null,
          startDate: viewDate,
          days: [],
          areas: [],
          bookings: []
      });

      const start = startOfDay(viewDate);
      const end = endOfDay(addDays(viewDate, this.daysToShow - 1));

      return this.apiService.bookingsGet(start.toISOString(), end.toISOString(), workplaceId).pipe(
        map(bookings => ({ workplaceId, startDate: viewDate, areas, workplaces, bookings })),
        catchError(() => of({ workplaceId, startDate: viewDate, areas, workplaces, bookings: [] as Booking[] }))
      );
    }),
    map(data => {
      if (!data.workplaceId) {
         return {
           workplaceId: null,
           startDate: data.startDate,
           days: [],
           areas: [],
           bookings: []
         } as WorkplaceCalendarViewModel;
      }

      // Group workplaces for dropdown
      const workplacesByArea = new Map<string, Workplace[]>();
      data.workplaces.forEach(wp => {
        const list = workplacesByArea.get(wp.areaId) || [];
        list.push(wp);
        workplacesByArea.set(wp.areaId, list.sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
      });

      const structuredAreas = data.areas
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .map(area => ({
          ...area,
          workplaces: workplacesByArea.get(area.id) || []
        }));

      // Generate Days (Rows)
      const days: DayViewModel[] = [];
      for (let i = 0; i < this.daysToShow; i++) {
        const d = addDays(data.startDate, i);
        const dayEvents = data.bookings
            .filter(b => isSameDay(new Date(b.startTime), d))
            .map(b => ({
                  id: b.id,
                  start: new Date(b.startTime),
                  end: new Date(b.endTime),
                  title: b.name,
                  subtitle: b.contact,
                  color: '#3498db',
                  data: b
            } as TimelineEvent));

        days.push({ date: d, events: dayEvents });
      }

      return {
        workplaceId: data.workplaceId,
        startDate: data.startDate,
        days,
        areas: structuredAreas,
        bookings: data.bookings
      } as WorkplaceCalendarViewModel;
    }),
    shareReplay(1)
  );

  onWorkplaceChange(workplaceId: string) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { workplaceId },
      queryParamsHandling: 'merge'
    });
  }

  navigateToCalendar(day: Date) {
    this.router.navigate(['/calendar'], {
      queryParams: {
        date: format(day, 'yyyy-MM-dd')
      }
    });
  }

  setDate(delta: number) {
    let newDate: Date;
    if (delta === 0) {
      newDate = new Date();
    } else {
      newDate = addDays(this.startDateSubject.value, delta);
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { date: format(newDate, 'yyyy-MM-dd') },
      queryParamsHandling: 'merge'
    });
  }

  isToday(date: Date): boolean {
    return isSameDay(date, new Date());
  }
}
