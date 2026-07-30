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
import { addDays, format, startOfDay, endOfDay, isSameDay } from 'date-fns';
import { CALENDAR_CONFIG } from './calendar.constants';
import { TimelineHeaderComponent } from '../../shared/components/timeline-header/timeline-header.component';
import { TimelineTrackComponent } from '../../shared/components/timeline-track/timeline-track.component';
import { TimelineEvent } from '../../shared/model/timeline';

interface WorkplaceViewModel {
  id: string;
  name: string;
  maxBookingDurationMinutes?: number;
  events: TimelineEvent[];
}

interface AreaViewModel {
  id: string;
  name: string;
  color: string;
  workplaces: WorkplaceViewModel[];
}

interface CalendarViewModel {
  date: Date;
  areas: AreaViewModel[];
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, TimelineHeaderComponent, TimelineTrackComponent],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.scss']
})
export class CalendarComponent implements OnInit {
  private apiService = inject(DefaultService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  private selectedDateSubject = new BehaviorSubject<Date>(new Date());
  selectedDate$ = this.selectedDateSubject.asObservable();

  // Define start and end hours for the calendar view (e.g., 08:00 to 22:00)
  readonly startHour = CALENDAR_CONFIG.startHour;
  readonly endHour = CALENDAR_CONFIG.endHour;
  readonly intervalMinutes = CALENDAR_CONFIG.intervalMinutes;
  readonly slotWidth = CALENDAR_CONFIG.slotWidth;

  ngOnInit() {
    // Watch for query params
    this.route.queryParams.subscribe(params => {
      if (params['date']) {
        this.selectedDateSubject.next(new Date(params['date']));
      }
    });
  }

  vm$: Observable<CalendarViewModel> = combineLatest([
    this.selectedDateSubject,
    this.apiService.areasGet(),
    this.apiService.workplacesGet(true)
  ]).pipe(
    switchMap(([date, areas, workplaces]) => {
      const start = startOfDay(date);
      const end = endOfDay(date);

      return this.apiService.bookingsGet(start.toISOString(), end.toISOString()).pipe(
          map(bookings => ({ date, areas, workplaces, bookings })),
          catchError(() => of({ date, areas, workplaces, bookings: [] as Booking[] }))
      );
    }),
    map(({ date, areas, workplaces, bookings }) => {
      // Group bookings by workplaceId
      const bookingsByWorkplace = new Map<string, Booking[]>();
      bookings.forEach(b => {
         const list = bookingsByWorkplace.get(b.workplaceId) || [];
         list.push(b);
         bookingsByWorkplace.set(b.workplaceId, list);
      });

      // Group Workplaces by Area
      const workplacesByArea = new Map<string, Workplace[]>();
      workplaces.forEach(wp => {
        const list = workplacesByArea.get(wp.areaId) || [];
        list.push(wp);
        workplacesByArea.set(wp.areaId, list.sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
      });

      const structuredAreas: AreaViewModel[] = areas
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .map(area => ({
          id: area.id,
          name: area.name,
          color: area.color || '#ccc',
          workplaces: (workplacesByArea.get(area.id) || []).map(wp => ({
              id: wp.id,
              name: wp.name,
              maxBookingDurationMinutes: wp.maxBookingDurationMinutes ? wp.maxBookingDurationMinutes : undefined,
              events: (bookingsByWorkplace.get(wp.id) || []).map(b => ({
                  id: b.id,
                  start: new Date(b.startTime),
                  end: new Date(b.endTime),
                  title: b.name,
                  subtitle: b.contact,
                  color: '#3498db',
                  data: b
              } as TimelineEvent))
          }))
        }));

      return {
        date,
        areas: structuredAreas
      };
    }),
    shareReplay(1)
  );

  setDate(delta: number) {
    let newDate: Date;
    if (delta === 0) {
      newDate = new Date();
    } else {
      newDate = addDays(this.selectedDateSubject.value, delta);
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { date: format(newDate, 'yyyy-MM-dd') },
      queryParamsHandling: 'merge'
    });
  }

  navigateToWorkplace(workplaceId: string) {
    this.router.navigate(['/workplace-calendar'], {
      queryParams: {
        workplaceId,
        date: format(this.selectedDateSubject.value, 'yyyy-MM-dd')
      }
    });
  }

  isToday(date: Date): boolean {
    return isSameDay(date, new Date());
  }
}
