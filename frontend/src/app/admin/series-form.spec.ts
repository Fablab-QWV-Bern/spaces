import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { provideApiConfiguration } from '../api/api-configuration';
import { BookingSeriesWrite } from '../api/models';
import { SeriesForm } from './series-form';

/**
 * Der Weg vom Formular zur Anfrage — die einzige Stelle, an der das Frontend
 * etwas über Serien rechnet. Vor allem: die Wanduhrzeit geht ohne Zonenangabe
 * hinaus. Ein `toISOString()` verschöbe sie um den Zonenversatz, und die Serie
 * fände fortan zur falschen Stunde statt.
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

  it('schickt die Wanduhrzeit ohne Zonenangabe', () => {
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

  it('macht aus „alle zwei Wochen" WEEKLY mit intervalCount 2', () => {
    set('Erster Termin am', '2026-08-03');
    set('Name', 'Kurs');
    set('Kontakt', 'kurs@example.org');
    set('Wiederholung', 'biweekly');

    save();

    const body = http.expectOne('/api/booking-series').request.body as BookingSeriesWrite;

    expect(body.interval).toBe('WEEKLY');
    expect(body.intervalCount).toBe(2);
  });

  // Eine Dauer über die Schliesszeit hinaus lässt das Ende auf den Folgetag
  // rutschen — ohne eigenes Kreuz für "über Nacht". Ob der Bereich das darf,
  // entscheidet das Backend.
  it('lässt das Ende auf den Folgetag rutschen', () => {
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

  it('zeigt die ausgelassenen Termine, statt weiterzuleiten', () => {
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
