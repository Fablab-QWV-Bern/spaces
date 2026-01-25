import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DefaultService } from '../../api/api/default.service';
import { Area } from '../../api/model/area';
import { Workplace } from '../../api/model/workplace';
import { Booking } from '../../api/model/booking';
import { Observable, BehaviorSubject, combineLatest, of } from 'rxjs';
import { map, switchMap, shareReplay, catchError } from 'rxjs/operators';
import { addDays, format, startOfDay, endOfDay, setHours, setMinutes, differenceInMinutes, isSameDay } from 'date-fns';

interface CalendarViewModel {
  date: Date;
  areas: (Area & { workplaces: Workplace[] })[];
  bookings: Booking[];
  timeSlots: Date[];
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.scss']
})
export class CalendarComponent implements OnInit, OnDestroy {
  private apiService = inject(DefaultService);
  private now = new Date();
  private intervalId: any;

  private selectedDateSubject = new BehaviorSubject<Date>(new Date());
  selectedDate$ = this.selectedDateSubject.asObservable();

  // Define start and end hours for the calendar view (e.g., 08:00 to 22:00)
  readonly startHour = 8;
  readonly endHour = 22;
  readonly intervalMinutes = 15;
  readonly slotWidth = 30; // Must match SCSS $slot-width

  ngOnInit() {
    // Update 'now' every minute
    this.intervalId = setInterval(() => {
      this.now = new Date();
    }, 60000);
  }

  ngOnDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  vm$: Observable<CalendarViewModel> = combineLatest([
    this.selectedDateSubject,
    this.apiService.areasGet(),
    this.apiService.workplacesGet(true)
  ]).pipe(
    switchMap(([date, areas, workplaces]) => {
      // Fetch bookings for the selected date range
      // Note: The API currently doesn't support date filtering filtering efficiently in the generated client without params
      // I need to check if the generated client supports query params for bookings
      const start = startOfDay(date);
      const end = endOfDay(date);

      // bookingsGet(from?: string, to?: string, workplaceId?: string, ...)
      return this.apiService.bookingsGet(start.toISOString(), end.toISOString()).pipe(
          map(bookings => ({ date, areas, workplaces, bookings })),
          catchError(() => of({ date, areas, workplaces, bookings: [] as Booking[] }))
      );
    }),
    map(({ date, areas, workplaces, bookings }) => {
      // 1. Prepare Time Slots
      const timeSlots: Date[] = [];
      let current = setMinutes(setHours(startOfDay(date), this.startHour), 0);
      const endTime = setMinutes(setHours(startOfDay(date), this.endHour), 0);

      while (current <= endTime) {
        timeSlots.push(new Date(current));
        current = new Date(current.getTime() + this.intervalMinutes * 60000);
      }

      // 2. Group Workplaces by Area
      const workplacesByArea = new Map<string, Workplace[]>();
      workplaces.forEach(wp => {
        const list = workplacesByArea.get(wp.areaId) || [];
        list.push(wp);
        workplacesByArea.set(wp.areaId, list.sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
      });

      const structuredAreas = areas
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .map(area => ({
          ...area,
          workplaces: workplacesByArea.get(area.id) || []
        }));

      return {
        date,
        areas: structuredAreas,
        bookings,
        timeSlots
      };
    }),
    shareReplay(1)
  );

  setDate(delta: number) {
    const newDate = addDays(this.selectedDateSubject.value, delta);
    this.selectedDateSubject.next(newDate);
  }

  isToday(date: Date): boolean {
    return isSameDay(date, new Date());
  }

  getNowStyle(timeSlots: Date[]) {
    if (!timeSlots.length) return { display: 'none' };

    // Check if showing today
    const calendarDate = timeSlots[0]; // Start of calendar view for that day
    if (!isSameDay(this.now, calendarDate)) {
      return { display: 'none' };
    }

    // Check if now is within calendar range (approx check)
    const calendarStart = timeSlots[0];
    // Calendar ends after last slot + intervalMinutes
    const calendarEnd = new Date(timeSlots[timeSlots.length - 1].getTime() + this.intervalMinutes * 60000);

    if (this.now < calendarStart || this.now > calendarEnd) {
      return { display: 'none' };
    }

    const startMinutes = differenceInMinutes(this.now, calendarStart);

    const pixelsPerMinute = this.slotWidth / this.intervalMinutes;
    const left = startMinutes * pixelsPerMinute;

    return {
      left: `${left}px`,
      display: 'block'
    };
  }

  // Helper to calculate position of a booking
  getBookingStyle(booking: Booking, timeSlots: Date[]) {
    if (!booking.startTime || !booking.endTime) return {};

    const start = new Date(booking.startTime);
    const end = new Date(booking.endTime);
    const calendarStart = timeSlots[0];

    // Simple minutes calculation relative to start of calendar
    const startMinutes = differenceInMinutes(start, calendarStart);
    const durationMinutes = differenceInMinutes(end, start);

    const pixelsPerMinute = this.slotWidth / this.intervalMinutes;

    const left = startMinutes * pixelsPerMinute;
    const width = durationMinutes * pixelsPerMinute;

    return {
      left: `${left}px`,
      width: `${width}px`,
      backgroundColor: '#3498db', // simplified color
      position: 'absolute',
      height: '80%',
      top: '10%'
    };
  }
}
