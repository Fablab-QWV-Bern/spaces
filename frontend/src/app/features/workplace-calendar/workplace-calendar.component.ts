import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DefaultService } from '../../api/api/default.service';
import { Area } from '../../api/model/area';
import { Workplace } from '../../api/model/workplace';
import { Booking } from '../../api/model/booking';
import { Observable, BehaviorSubject, combineLatest, of } from 'rxjs';
import { map, switchMap, shareReplay, catchError, startWith, tap } from 'rxjs/operators';
import { addDays, startOfDay, endOfDay, setHours, setMinutes, differenceInMinutes, isSameDay, startOfMonth, endOfMonth, addMonths, eachDayOfInterval, format } from 'date-fns';

interface WorkplaceCalendarViewModel {
  workplaceId: string | null;
  startDate: Date;
  days: Date[];
  areas: (Area & { workplaces: Workplace[] })[];
  bookings: Booking[];
  timeSlots: Date[];
}

@Component({
  selector: 'app-workplace-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
  readonly startHour = 8;
  readonly endHour = 22;
  readonly intervalMinutes = 15;
  readonly slotWidth = 20; // px
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
        // Find a default active one preference? or just first.
        const first = workplaces.find(w => w.status !== 'DISABLED') || workplaces[0];
        this.selectedWorkplaceIdSubject.next(first.id);
        // switchMap will restart this stream, so return empty for now to avoid race conditions
        return of({
          workplaceId: null,
          startDate: viewDate,
          days: [],
          areas: [], // we will reprocess this in next emission
          bookings: [],
          timeSlots: []
        });
      }

      if (!workplaceId) return of({
          workplaceId: null,
          startDate: viewDate,
          days: [],
          areas: [],
          bookings: [],
          timeSlots: []
      });

      const start = startOfDay(viewDate);
      const end = endOfDay(addDays(viewDate, this.daysToShow - 1));

      return this.apiService.bookingsGet(start.toISOString(), end.toISOString(), workplaceId).pipe(
        map(bookings => ({ workplaceId, startDate: viewDate, areas, workplaces, bookings })),
        catchError(() => of({ workplaceId, startDate: viewDate, areas, workplaces, bookings: [] as Booking[] }))
      );
    }),
    map(data => {
      // Re-check just in case we are in the "not yet selected" state
      if (!data.workplaceId) {
         // Should largely be handled by the switchMap logic above, but strictly typing:
         return {
           workplaceId: null,
           startDate: data.startDate,
           days: [],
           areas: [],
           bookings: [],
           timeSlots: []
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
      const days: Date[] = [];
      for (let i = 0; i < this.daysToShow; i++) {
        days.push(addDays(data.startDate, i));
      }

      // Generate Time Slots (Columns) - only for header calculation mostly
      const timeSlots: Date[] = [];
      // Use startDate for calculating timeSlots simply for hours/minutes
      let current = setMinutes(setHours(startOfDay(data.startDate), this.startHour), 0);
      const endTime = setMinutes(setHours(startOfDay(data.startDate), this.endHour), 0);

      while (current <= endTime) {
        timeSlots.push(new Date(current));
        current = new Date(current.getTime() + this.intervalMinutes * 60000);
      }

      return {
        workplaceId: data.workplaceId,
        startDate: data.startDate,
        days,
        areas: structuredAreas,
        bookings: data.bookings,
        timeSlots
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

  getBookingStyle(booking: Booking, day: Date, timeSlots: Date[]) {
    // Check if booking belongs to this day
    const bookingStart = new Date(booking.startTime);
    if (!isSameDay(bookingStart, day)) {
        return { display: 'none' };
    }

    // Reuse logic from CalendarComponent but relative to 'day'
    // Start of the visible timeline for *this* day
    const calendarStart = setMinutes(setHours(startOfDay(day), this.startHour), 0);
    const calendarEnd = new Date(timeSlots[timeSlots.length - 1].getTime() + this.intervalMinutes * 60000); // approx

    const bookingEnd = new Date(booking.endTime);

    const startMinutes = differenceInMinutes(bookingStart, calendarStart);
    const durationMinutes = differenceInMinutes(bookingEnd, bookingStart);

    const pixelsPerMinute = this.slotWidth / this.intervalMinutes;

    const left = startMinutes * pixelsPerMinute;
    const width = durationMinutes * pixelsPerMinute;

    return {
      left: `${left}px`,
      width: `${width}px`,
      backgroundColor: '#3498db',
      position: 'absolute',
      height: '80%',
      top: '10%'
    };
  }
}
