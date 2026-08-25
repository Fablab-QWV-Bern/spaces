import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { provideApiConfiguration } from '../api/api-configuration';
import { Workplace } from '../api/models';
import { MapAdmin } from './map-admin';

const PLAN = `
  <svg xmlns="http://www.w3.org/2000/svg">
    <g id="Arbeitsplätze">
      <path id="holz-1"/>
      <path id="_3d-drucker-4"/>
    </g>
  </svg>
`;

function workplace(id: string, name: string): Workplace {
  return {
    id,
    name,
    areaId: 'holz',
    status: 'OK',
    sortOrder: 0,
    tags: [],
    blocksWorkplaceIds: [],
    blocksWorkplacesWithTag: [],
    maxBookingDurationMinutes: null,
    location: null,
    description: null,
    usageRules: null,
    wikiUrl: null,
  };
}

/**
 * The page exists for the comparison, so that is what is tested: both directions
 * of a mismatch have to be readable, and the two requests behind them — where
 * the plan lies, and what is in it — have to be one path.
 */
describe('MapAdmin', () => {
  let fixture: ComponentFixture<MapAdmin>;
  let http: HttpTestingController;

  const text = () => fixture.nativeElement.textContent as string;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapAdmin],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiConfiguration('/api'),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MapAdmin);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    // Asked once, although two things on this page depend on it: where the plan
    // lies, and — from that answer — what is drawn in it.
    http
      .expectOne('/api/floor-plan')
      .flush({ url: '/storage/karte.svg', isDefault: false, updatedAt: '2026-08-24T09:00:00Z' });

    http
      .expectOne('/api/workplaces')
      .flush([workplace('holz-1', 'Hobelbank'), workplace('loeten-1', 'Lötplatz')]);

    http.expectOne('/storage/karte.svg').flush(PLAN);

    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('names what is configured but not drawn', () => {
    expect(text()).toContain('Konfiguriert, aber nicht gezeichnet');
    expect(text()).toContain('Lötplatz');
  });

  it('names what is drawn but not configured', () => {
    expect(text()).toContain('Gezeichnet, aber nicht konfiguriert');
    expect(text()).toContain('_3d-drucker-4');
  });

  it('says which plan is in use', () => {
    expect(text()).toContain('Hochgeladen am');
  });
});
