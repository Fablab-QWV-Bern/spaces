import { Component, Signal, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { Permissions } from '../api/models';
import { SessionService } from '../shared/session-service';
import { AdminHeader } from './admin-header';

/**
 * What an admin route says about itself. The permission belongs to the page, not
 * into its template: every one of them would otherwise carry the same twelve
 * lines of notice, differing in one word.
 */
export interface AdminRouteData {
  /** The permission the page needs — a key of the session's permissions. */
  permission: keyof Permissions;
  /** The heading above the page. */
  heading: string;
  /** How the notice starts when the permission is missing. */
  needs: string;
}

/**
 * The frame around every admin page: header, permission check, then the page.
 *
 * This is no guard — a guard would prevent the navigation and would have to
 * redirect somewhere, and precisely the reason would be lost in the process.
 * Which is what someone standing in front of a locked page needs to read. The
 * router only carries the declaration here; the decision keeps being the
 * backend's, which refuses the requests regardless.
 *
 * The session is loaded here rather than in a resolver, for two reasons: a
 * resolver holds up the navigation without anything visible happening, and its
 * error would cancel the navigation instead of naming itself. And because the
 * frame survives the switch between the pages, it is loaded once for the whole
 * area instead of once per page.
 */
@Component({
  selector: 'app-admin-shell',
  imports: [AdminHeader, RouterOutlet],
  template: `
    <app-admin-header [heading]="page().heading" />

    @if (loading()) {
      <p class="hint">Wird geladen …</p>
    } @else if (error(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    } @else if (permitted()) {
      <router-outlet />
    } @else {
      <div class="notice">
        <p>
          {{ page().needs }} braucht es eine Rolle mit dem Recht dazu. Aktuell bist du
          @if (session.isAnonymous()) {
            nicht angemeldet.
          } @else {
            als <strong>{{ session.roleName() }}</strong> angemeldet, diese Rolle darf das nicht.
          }
        </p>
      </div>
    }
  `,
  styleUrl: './admin-shell.scss',
})
export class AdminShell {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly session = inject(SessionService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /**
   * What the active page declares — read anew on every navigation, because
   * switching between the admin pages does not recreate this component.
   */
  protected readonly page: Signal<AdminRouteData> = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.declaration()),
      startWith(this.declaration()),
    ),
    { requireSync: true },
  );

  protected readonly permitted = computed(
    () => this.session.session()?.permissions[this.page().permission] ?? false,
  );

  constructor() {
    this.session.load().subscribe({
      next: () => this.loading.set(false),
      error: () => {
        this.error.set('Die Anmeldung liess sich nicht prüfen.');
        this.loading.set(false);
      },
    });
  }

  private declaration(): AdminRouteData {
    return this.route.snapshot.firstChild?.data as AdminRouteData;
  }
}
