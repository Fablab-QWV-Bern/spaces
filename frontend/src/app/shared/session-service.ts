import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, switchMap, tap } from 'rxjs';

import { ApiConfiguration } from '../api/api-configuration';
import { getSession, login, logout } from '../api/functions';
import { Session } from '../api/models';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = inject(ApiConfiguration).rootUrl;

  readonly session = signal<Session | null>(null);

  readonly canManageBookings = computed(() => this.session()?.permissions.manageBookings ?? false);
  readonly seesDetails = computed(() => this.session()?.permissions.viewBookingsDetails ?? false);
  readonly isAnonymous = computed(() => this.session()?.isAnonymous ?? true);
  readonly roleName = computed(() => this.session()?.roleName ?? '');

  load(): Observable<Session> {
    return getSession(this.http, this.rootUrl).pipe(
      map((response) => response.body),
      tap((session) => this.session.set(session)),
    );
  }

  login(roleName: string, password: string): Observable<Session> {
    return login(this.http, this.rootUrl, { body: { roleName, password } }).pipe(
      map((response) => response.body),
      tap((session) => this.session.set(session)),
    );
  }

  /** Nach dem Abmelden gilt wieder die anonyme Rolle — die holen wir uns frisch. */
  logout(): Observable<Session> {
    return logout(this.http, this.rootUrl).pipe(switchMap(() => this.load()));
  }
}
