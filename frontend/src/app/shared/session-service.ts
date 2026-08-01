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
  /** Deckt beides ab: Rollen und die globale Konfiguration. */
  readonly canManageRoles = computed(() => this.session()?.permissions.manageRoles ?? false);
  /** Ob überhaupt eine Verwaltungsansicht offensteht. */
  readonly canManageAnything = computed(
    () => this.canManageAreas() || this.canManageWorkplaces() || this.canManageRoles(),
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

  /** Für die Rollenknöpfe im Anmeldedialog — kein Freitextfeld. */
  loginableRoles(): Observable<string[]> {
    return listLoginableRoles(this.http, this.rootUrl).pipe(map((response) => response.body));
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
