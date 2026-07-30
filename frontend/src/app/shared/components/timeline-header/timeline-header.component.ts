import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { addMinutes, setHours, setMinutes, startOfDay } from 'date-fns';

@Component({
  selector: 'app-timeline-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './timeline-header.component.html',
  styleUrls: ['./timeline-header.component.scss']
})
export class TimelineHeaderComponent implements OnInit, OnChanges {
  @Input() startHour = 8;
  @Input() endHour = 22;
  @Input() intervalMinutes = 15;
  @Input() slotWidth = 20;

  timeSlots: Date[] = [];

  ngOnInit() {
    this.generateTimeSlots();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['startHour'] || changes['endHour'] || changes['intervalMinutes']) {
      this.generateTimeSlots();
    }
  }

  private generateTimeSlots() {
    const slots: Date[] = [];
    const baseDate = startOfDay(new Date()); // Date doesn't matter for header labels
    let current = setMinutes(setHours(baseDate, this.startHour), 0);
    const endTime = setMinutes(setHours(baseDate, this.endHour), 0);

    while (current <= endTime) {
      slots.push(new Date(current));
      current = addMinutes(current, this.intervalMinutes);
    }
    this.timeSlots = slots; // Trigger update
  }
}
