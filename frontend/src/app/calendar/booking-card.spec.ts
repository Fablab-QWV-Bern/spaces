import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { provideApiConfiguration } from '../api/api-configuration';
import { Booking, Permissions } from '../api/models';
import { SessionService } from '../shared/session-service';
import { BookingCard } from './booking-card';

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b1',
    creatorRoleId: null,
    ipAddress: null,
    createdAt: '2026-08-03T06:00:00Z',
    workplaceId: 'holz-1',
    blockedWorkplaceIds: [],
    name: 'Reparaturcafé',
    contact: 'reparatur@example.org',
    usageRulesAcknowledged: true,
    startTime: '2026-08-03T07:00:00Z',
    endTime: '2026-08-03T09:00:00Z',
    chargeableDurationMinutes: 120,
    bookingSeriesId: 's1',
    seriesDetached: false,
    ...overrides,
  };
}

describe('BookingCard', () => {
  let fixture: ComponentFixture<BookingCard>;

  const permissions = (overrides: Partial<Permissions> = {}): Permissions => ({
    viewBookings: true,
    viewBookingsDetails: true,
    manageBookings: false,
    noTimeRestrictions: false,
    manageBookingSeries: false,
    manageWorkplaces: false,
    manageAreas: false,
    manageRoles: false,
    ...overrides,
  });

  const open = () => {
    // Die Karte hält ihren Inhalt zurück, bis das Popover aufgeht — sonst
    // stünden hunderte Karten im Baum, die niemand ansieht.
    const event = Object.assign(new Event('beforetoggle'), { newState: 'open' });
    fixture.nativeElement.dispatchEvent(event);
    fixture.detectChanges();
  };

  const render = (instance: Booking, granted: Partial<Permissions>) => {
    fixture = TestBed.createComponent(BookingCard);

    TestBed.inject(SessionService).session.set({
      roleId: 'r1',
      roleName: 'Test',
      isAnonymous: false,
      permissions: permissions(granted),
    });

    fixture.componentRef.setInput('details', {
      booking: instance,
      workplaceName: 'Holz 1',
      bookedWorkplaceName: 'Holz 1',
      timeRange: '09:00–11:00',
      isBlockage: false,
    });

    fixture.detectChanges();
    open();

    return fixture.nativeElement.textContent as string;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookingCard],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiConfiguration('/api'),
      ],
    }).compileComponents();
  });

  it('führt zur Serie, wenn die Rolle sie verwalten darf', () => {
    const text = render(booking(), { manageBookingSeries: true });

    expect(text).toContain('Teil einer Serie');
    expect(text).toContain('Serie bearbeiten');
  });

  // Ein Link, der zuverlässig auf einen Hinweis führt, ist kein Link.
  it('bietet den Weg zur Serie ohne das Recht nicht an', () => {
    const text = render(booking(), { manageBookings: true });

    expect(text).toContain('Teil einer Serie');
    expect(text).not.toContain('Serie bearbeiten');
  });

  it('sagt bei einer Buchung ohne Serie nichts davon', () => {
    const text = render(booking({ bookingSeriesId: null }), { manageBookingSeries: true });

    expect(text).not.toContain('Teil einer Serie');
    expect(text).not.toContain('Serie bearbeiten');
  });
});
