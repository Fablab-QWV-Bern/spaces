import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { provideApiConfiguration } from '../api/api-configuration';
import { Permissions } from '../api/models';
import { AdminRouteData, AdminShell } from './admin-shell';

@Component({ selector: 'app-page', template: `<p>Der Inhalt</p>` })
class Page {}

const NOTHING: Permissions = {
  viewBookings: true,
  viewBookingsDetails: false,
  manageBookings: false,
  noTimeRestrictions: false,
  manageBookingSeries: false,
  manageWorkplaces: false,
  manageAreas: false,
  manageRoles: false,
};

/**
 * The permission check for the whole admin area sits here — once, instead of in
 * every page's template. What matters: the page is not activated without the
 * permission, so that it does not fetch anything it may not see.
 */
describe('AdminShell', () => {
  let http: HttpTestingController;

  const open = async (permissions: Permissions, roleName = 'Mitglied') => {
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/verwaltung/bereiche');

    http.expectOne('/api/session').flush({
      roleId: 'r1',
      roleName,
      isAnonymous: roleName === 'Anonym',
      permissions,
    });

    // Twice: the first pass reveals the outlet, and only then does the router
    // activate the page inside it.
    harness.detectChanges();
    harness.detectChanges();

    return harness.fixture.nativeElement as HTMLElement;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'verwaltung',
            component: AdminShell,
            children: [
              {
                path: 'bereiche',
                component: Page,
                data: {
                  permission: 'manageAreas',
                  heading: 'Bereiche',
                  needs: 'Zum Verwalten der Bereiche',
                } satisfies AdminRouteData,
              },
            ],
          },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiConfiguration('/api'),
      ],
    });

    http = TestBed.inject(HttpTestingController);
  });

  it('shows the page when the role is permitted', async () => {
    const element = await open({ ...NOTHING, manageAreas: true });

    expect(element.textContent).toContain('Der Inhalt');
  });

  it('names the role instead of the page when the permission is missing', async () => {
    const element = await open(NOTHING);

    expect(element.textContent).not.toContain('Der Inhalt');
    expect(element.textContent).toContain('Zum Verwalten der Bereiche');
    expect(element.textContent).toContain('Mitglied');
  });

  it('says so when nobody is logged in', async () => {
    const element = await open(NOTHING, 'Anonym');

    expect(element.textContent).toContain('nicht angemeldet');
  });

  it('reads the heading from the route', async () => {
    const element = await open({ ...NOTHING, manageAreas: true });

    expect(element.querySelector('h1')?.textContent).toBe('Bereiche');
  });

  afterEach(() => http.verify());
});
