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
    // The card withholds its content until the popover opens — otherwise
    // hundreds of cards nobody looks at would sit in the tree.
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

  it('leads to the series when the role may manage it', () => {
    const text = render(booking(), { manageBookingSeries: true });

    expect(text).toContain('Teil einer Serie');
    expect(text).toContain('Serie bearbeiten');
  });

  // A link that reliably leads to a notice is not a link.
  it('does not offer the route to the series without the permission', () => {
    const text = render(booking(), { manageBookings: true });

    expect(text).toContain('Teil einer Serie');
    expect(text).not.toContain('Serie bearbeiten');
  });

  it('says nothing about a series for a booking without one', () => {
    const text = render(booking({ bookingSeriesId: null }), { manageBookingSeries: true });

    expect(text).not.toContain('Teil einer Serie');
    expect(text).not.toContain('Serie bearbeiten');
  });
});
