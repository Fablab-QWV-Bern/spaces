import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { provideApiConfiguration } from '../api/api-configuration';
import { BookingSeriesWrite } from '../api/models';
import { SeriesForm } from './series-form';

/**
 * The path from form to request — the only place where the frontend computes
 * anything about series. Above all: the wall-clock time goes out without a zone.
 * A `toISOString()` would shift it by the zone offset, and the series would take
 * place at the wrong hour from then on.
 */
describe('SeriesForm', () => {
  let fixture: ComponentFixture<SeriesForm>;
  let http: HttpTestingController;

  const select = (label: string) =>
    [...fixture.nativeElement.querySelectorAll('label.field')]
      .find((node) => (node as HTMLElement).querySelector('span')?.textContent?.trim() === label)
      ?.querySelector('select, input') as HTMLSelectElement | HTMLInputElement;

  const set = (label: string, value: string) => {
    const control = select(label);
    control.value = value;
    control.dispatchEvent(new Event('input'));
    control.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  const save = () => {
    const button = [...fixture.nativeElement.querySelectorAll('button')].find((node) =>
      (node as HTMLElement).textContent?.includes('Speichern'),
    ) as HTMLButtonElement;

    button.click();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SeriesForm],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiConfiguration('/api'),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SeriesForm);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    http.expectOne('/api/session').flush({
      roleId: 'r1',
      roleName: 'Admin',
      isAnonymous: false,
      permissions: {
        viewBookings: true,
        viewBookingsDetails: true,
        manageBookings: true,
        noTimeRestrictions: false,
        manageBookingSeries: true,
        manageWorkplaces: true,
        manageAreas: true,
        manageRoles: true,
      },
    });

    http.expectOne('/api/config').flush({
      opensAt: '08:00',
      closesAt: '21:00',
      maxBookingEndOffsetDays: 90,
      timezone: 'Europe/Zurich',
    });

    http.expectOne('/api/areas').flush([
      {
        id: 'holz',
        name: 'Holzwerkstatt',
        color: 'oklch(0.8 0.1 70)',
        maxBookingDurationMinutes: 480,
        maxBookingEndOffsetDays: null,
        allowNightlyActivities: false,
        sortOrder: 0,
      },
    ]);

    http.expectOne('/api/workplaces').flush([
      {
        id: 'holz-1',
        areaId: 'holz',
        name: 'Holz 1',
        status: 'OK',
        sortOrder: 0,
        tags: [],
        blocksWorkplaceIds: [],
        blocksTags: [],
        maxBookingDurationMinutes: 240,
        location: null,
        description: null,
        usageRules: null,
        wikiUrl: null,
        photoUrl: null,
        thumbnailUrl: null,
      },
    ]);

    fixture.detectChanges();
  });

  it('sends the wall-clock time without a zone', () => {
    set('Erster Termin am', '2026-08-03');
    set('Beginn', '540');
    set('Dauer', '120');
    set('Name', 'Reparaturcafé');
    set('Kontakt', 'reparatur@example.org');

    save();

    const request = http.expectOne('/api/booking-series');
    const body = request.request.body as BookingSeriesWrite;

    expect(body.firstInstanceStart).toBe('2026-08-03T09:00');
    expect(body.firstInstanceEnd).toBe('2026-08-03T11:00');
    expect(body.endDate).toBeNull();
  });

  it('turns "alle zwei Wochen" into WEEKLY with intervalCount 2', () => {
    set('Erster Termin am', '2026-08-03');
    set('Name', 'Kurs');
    set('Kontakt', 'kurs@example.org');
    set('Wiederholung', 'biweekly');

    save();

    const body = http.expectOne('/api/booking-series').request.body as BookingSeriesWrite;

    expect(body.interval).toBe('WEEKLY');
    expect(body.intervalCount).toBe(2);
  });

  // A duration reaching past closing time lets the end slide onto the following
  // day — without a checkbox of its own for "overnight". Whether the area is
  // allowed that is decided by the backend.
  it('lets the end slide onto the following day', () => {
    set('Erster Termin am', '2026-08-03');
    set('Beginn', '1200');
    set('Dauer', '240');
    set('Name', 'Nachtschicht');
    set('Kontakt', 'nacht@example.org');

    save();

    const body = http.expectOne('/api/booking-series').request.body as BookingSeriesWrite;

    expect(body.firstInstanceStart).toBe('2026-08-03T20:00');
    expect(body.firstInstanceEnd).toBe('2026-08-04T00:00');
  });

  it('shows the skipped occurrences instead of redirecting', () => {
    set('Erster Termin am', '2026-08-03');
    set('Name', 'Reparaturcafé');
    set('Kontakt', 'reparatur@example.org');

    save();

    http.expectOne('/api/booking-series').flush({
      series: {
        id: 's1',
        workplaceId: 'holz-1',
        name: 'Reparaturcafé',
        contact: 'reparatur@example.org',
        interval: 'WEEKLY',
        intervalCount: 1,
        firstInstanceStart: '2026-08-03T09:00',
        firstInstanceEnd: '2026-08-03T11:00',
        endDate: null,
        instantiatedUntil: '2027-08-03',
      },
      skippedInstances: [
        {
          startTime: '2026-08-17T07:00:00Z',
          endTime: '2026-08-17T09:00:00Z',
          conflictingBookingIds: ['b1'],
        },
      ],
    });

    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Serie gespeichert');
    expect(text).toContain('Termin ist ausgefallen');
    expect(fixture.nativeElement.querySelectorAll('.skipped li')).toHaveLength(1);
  });

  afterEach(() => http.verify());
});
