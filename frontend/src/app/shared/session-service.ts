import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, switchMap, tap } from 'rxjs';

import { ApiConfiguration } from '../api/api-configuration';
import { getSession, listLoginableRoles, login, logout } from '../api/functions';
import { Session } from '../api/models';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = inject(ApiConfiguration).rootUrl;

  readonly session = signal<Session | null>(null);

  readonly canManageBookings = computed(() => this.session()?.permissions.manageBookings ?? false);
  readonly canManageAreas = computed(() => this.session()?.permissions.manageAreas ?? false);
  readonly canManageWorkplaces = computed(
    () => this.session()?.permissions.manageWorkplaces ?? false,
  );
  /** Covers both: roles and the global configuration. */
  readonly canManageRoles = computed(() => this.session()?.permissions.manageRoles ?? false);
  readonly canManageBookingSeries = computed(
    () => this.session()?.permissions.manageBookingSeries ?? false,
  );
  /** Whether any admin view is available at all. */
  readonly canManageAnything = computed(
    () =>
      this.canManageAreas() ||
      this.canManageWorkplaces() ||
      this.canManageRoles() ||
      this.canManageBookingSeries(),
  );
  readonly noTimeRestrictions = computed(
    () => this.session()?.permissions.noTimeRestrictions ?? false,
  );
  readonly seesDetails = computed(() => this.session()?.permissions.viewBookingsDetails ?? false);
  readonly isAnonymous = computed(() => this.session()?.isAnonymous ?? true);
  readonly roleName = computed(() => this.session()?.roleName ?? '');

  load(): Observable<Session> {
    return getSession(this.http, this.rootUrl).pipe(
      map((response) => response.body),
      tap((session) => this.session.set(session)),
    );
  }

  /** For the role buttons in the login dialog — not a free-text field. */
  loginableRoles(): Observable<string[]> {
    return listLoginableRoles(this.http, this.rootUrl).pipe(map((response) => response.body));
  }

  login(roleName: string, password: string): Observable<Session> {
    return login(this.http, this.rootUrl, { body: { roleName, password } }).pipe(
      map((response) => response.body),
      tap((session) => this.session.set(session)),
    );
  }

  /** After logging out the anonymous role applies again — we fetch it afresh. */
  logout(): Observable<Session> {
    return logout(this.http, this.rootUrl).pipe(switchMap(() => this.load()));
  }
}
