import { Component, ElementRef, inject } from '@angular/core';
import { Router } from '@angular/router';

import { Booking } from '../api/models';
import { BlockHover } from './block-hover';
import { CalendarStore } from './calendar-store';

/**
 * Die Detailkarte zu einem Balken. Steht einmal je Ansicht im Template und ist
 * immer im DOM, damit sie jederzeit über showPopover() ansteuerbar ist.
 *
 * Als natives Popover liegt sie im Top Layer. Das ist hier nicht Kosmetik: die
 * Zeitachse scrollt in einem `overflow-x: auto`-Container, ein normal
 * positioniertes Element würde am Rand beschnitten.
 */
@Component({
  selector: 'app-booking-card',
  templateUrl: './booking-card.html',
  styleUrl: './booking-card.scss',
  host: {
    popover: 'auto',
    role: 'tooltip',
    '(mouseleave)': 'hover.hide($event)',
  },
})
export class BookingCard {
  protected readonly hover = inject(BlockHover);
  protected readonly store = inject(CalendarStore);
  private readonly router = inject(Router);

  constructor() {
    this.hover.register(inject(ElementRef<HTMLElement>).nativeElement);
  }

  protected editBooking(booking: Booking): void {
    this.router.navigate(['/buchen'], { queryParams: { booking: booking.id } });
  }
}
