import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { map, of, switchMap } from 'rxjs';

import { ApiConfiguration } from '../api/api-configuration';
import { deleteRole, listRoles } from '../api/functions';
// Renamed so that the generated model does not shadow the global Error.
import { Error as ApiError, Role } from '../api/models';
import { SessionService } from '../shared/session-service';
import { AdminHeader } from './admin-header';
import { PERMISSION_LABELS } from './permission-labels';

@Component({
  selector: 'app-role-list',
  imports: [AdminHeader, RouterLink],
  templateUrl: './role-list.html',
  styleUrl: './role-list.scss',
})
export class RoleList {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = inject(ApiConfiguration).rootUrl;
  protected readonly session = inject(SessionService);

  protected readonly roles = signal<Role[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.load();
  }

  /** The granted permissions as short words, in the order of the spec. */
  protected granted(role: Role): string[] {
    return PERMISSION_LABELS.filter((permission) => role.permissions[permission.key]).map(
      (permission) => permission.short,
    );
  }

  /** How many roles may manage — the last of them is untouchable. */
  private readonly admins = computed(
    () => this.roles().filter((role) => role.permissions.manageRoles).length,
  );

  protected lastAdmin(role: Role): boolean {
    return role.permissions.manageRoles && this.admins() === 1;
  }

  /**
   * The backend refuses both anyway; here the button is greyed out straight away
   * rather than explaining why only after the click.
   */
  protected deletable(role: Role): boolean {
    return !role.isAnonymous && !this.lastAdmin(role);
  }

  protected reason(role: Role): string {
    if (role.isAnonymous) {
      return 'Die anonyme Rolle gibt es immer.';
    }

    if (this.lastAdmin(role)) {
      return 'Es ist die letzte Rolle, die verwalten darf.';
    }

    return 'Rolle löschen';
  }

  /**
   * Unlike areas and workplaces, the list itself is protected — it holds the
   * permissions of all roles. Hence the session first, then the list: without the
   * permission there would only be a 403 instead of the notice.
   */
  private load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.session
      .load()
      .pipe(
        switchMap((session) =>
          session.permissions.manageRoles
            ? listRoles(this.http, this.rootUrl).pipe(map((r) => r.body))
            : of<Role[]>([]),
        ),
      )
      .subscribe({
        next: (roles) => {
          this.roles.set(roles);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Die Rollen liessen sich nicht laden.');
          this.loading.set(false);
        },
      });
  }

  protected remove(role: Role): void {
    if (!confirm(`Rolle „${role.name}“ wirklich löschen?`)) {
      return;
    }

    this.error.set(null);

    deleteRole(this.http, this.rootUrl, { id: role.id }).subscribe({
      next: () => this.load(),
      error: (response: HttpErrorResponse) =>
        this.error.set(
          (response.error as ApiError | null)?.message ?? 'Die Rolle liess sich nicht löschen.',
        ),
    });
  }
}
