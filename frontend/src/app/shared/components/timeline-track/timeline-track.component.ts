import { Component, Input, OnChanges, SimpleChanges, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimelineEvent } from '../../model/timeline';
import { differenceInMinutes, setHours, setMinutes, startOfDay, isSameDay, addMinutes } from 'date-fns';

@Component({
  selector: 'app-timeline-track',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './timeline-track.component.html',
  styleUrls: ['./timeline-track.component.scss']
})
export class TimelineTrackComponent implements OnInit, OnChanges, OnDestroy {
  @Input() startHour = 8;
  @Input() endHour = 22;
  @Input() intervalMinutes = 15;
  @Input() slotWidth = 20;

  @Input() events: TimelineEvent[] = [];
  @Input() referenceDate: Date = new Date(); // The day this track represents
  @Input() showNowIndicator = true;

  slots: Date[] = [];
  now = new Date();
  private intervalId: any;

  ngOnInit() {
    this.updateSlots();
    if (this.showNowIndicator) {
      this.intervalId = setInterval(() => {
        this.now = new Date();
      }, 60000); // 1 min update
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['startHour'] || changes['endHour'] || changes['intervalMinutes']) {
      this.updateSlots();
    }
  }

  ngOnDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private updateSlots() {
    const slots: Date[] = [];
    // We use referenceDate to ensure we generate slots for the correct day (though usually only time matters for rendering grid)
    // But for isSameDay checks etc it helps to be consistent if we wanted.
    // However, the grid is "just lines".
    let current = setMinutes(setHours(startOfDay(this.referenceDate), this.startHour), 0);
    const endTime = setMinutes(setHours(startOfDay(this.referenceDate), this.endHour), 0);

    while (current <= endTime) {
      slots.push(new Date(current));
      current = addMinutes(current, this.intervalMinutes);
    }
    this.slots = slots;
  }

  get pixelsPerMinute(): number {
    return this.slotWidth / this.intervalMinutes;
  }

  get trackStartTime(): Date {
    return setMinutes(setHours(startOfDay(this.referenceDate), this.startHour), 0);
  }

  getNowStyle() {
    if (!this.showNowIndicator) return { display: 'none' };

    // Check if "now" is on the same day as referenceDate
    if (!isSameDay(this.now, this.referenceDate)) {
      return { display: 'none' };
    }

    const startMinutes = differenceInMinutes(this.now, this.trackStartTime);

    // Check bounds
    if (startMinutes < 0) return { display: 'none' };

    // Max minutes
    const calendarDuration = (this.endHour - this.startHour) * 60 + this.intervalMinutes; // approx
    // strict check:
    const lastSlot = this.slots[this.slots.length - 1];
    if (this.now > addMinutes(lastSlot, this.intervalMinutes)) {
         return { display: 'none' };
    }

    const left = startMinutes * this.pixelsPerMinute;

    return {
      left: `${left}px`,
      display: 'block'
    };
  }

  getEventStyle(event: TimelineEvent) {
    const start = event.start;
    const end = event.end;

    const startMinutes = differenceInMinutes(start, this.trackStartTime);
    const durationMinutes = differenceInMinutes(end, start);

    const left = startMinutes * this.pixelsPerMinute;
    const width = durationMinutes * this.pixelsPerMinute;

    return {
      left: `${left}px`,
      width: `${width}px`,
      backgroundColor: event.color || '#3498db'
    };
  }
}
