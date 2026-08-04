import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { map, of, switchMap } from 'rxjs';

import { ApiConfiguration } from '../api/api-configuration';
import { createRole, listRoles, updateRole } from '../api/functions';
// Renamed so that the generated model does not shadow the global Error.
import { Error as ApiError, Permissions, Role, RoleWrite } from '../api/models';
import { refinePageTitle } from '../shared/page-title';
import { SessionService } from '../shared/session-service';
import { AdminHeader } from './admin-header';
import { PERMISSION_LABELS, PermissionKey } from './permission-labels';

/** The backend will not accept anything shorter. */
const MIN_PASSWORD_LENGTH = 8;

interface RoleFormValue {
  name: string;
  /** When editing, empty means "stays as it is". */
  password: string;
}

const NO_PERMISSIONS: Permissions = {
  viewBookings: false,
  viewBookingsDetails: false,
  manageBookings: false,
  noTimeRestrictions: false,
  manageBookingSeries: false,
  manageWorkplaces: false,
  manageAreas: false,
  manageRoles: false,
};

@Component({
  selector: 'app-role-form',
  imports: [AdminHeader, FormField],
  templateUrl: './role-form.html',
  styleUrl: './role-form.scss',
})
export class RoleForm {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = inject(ApiConfiguration).rootUrl;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly session = inject(SessionService);

  protected readonly labels = PERMISSION_LABELS;

  /** Set when an existing role is being edited. */
  protected readonly editing = signal<Role | null>(null);

  /** The other roles — for the question of who else may manage. */
  private readonly others = signal<Role[]>([]);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);

  /**
   * The permissions live beside the form model: a row of checkboxes is easier to
   * carry as an object than as a field — like the blocked workplaces in the
   * workplace form.
   */
  protected readonly permissions = signal<Permissions>({ ...NO_PERMISSIONS });

  protected readonly model = signal<RoleFormValue>({ name: '', password: '' });

  /** As in the booking form: only required fields here, everything else in the backend. */
  protected readonly roleForm = form(this.model, (path) => {
    required(path.name, { message: 'Bitte einen Namen angeben.' });
  });

  protected readonly heading = computed(() => (this.editing() ? 'Rolle bearbeiten' : 'Neue Rolle'));

  /** The anonymous role has no password — it is the state before logging in. */
  protected readonly isAnonymous = computed(() => this.editing()?.isAnonymous ?? false);

  /**
   * Whether this role is the only managing one. Then the checkbox stays put:
   * without such a role nobody could reach the admin area any more.
   */
  protected readonly lastAdmin = computed(
    () =>
      (this.editing()?.permissions.manageRoles ?? false) &&
      !this.others().some((role) => role.permissions.manageRoles),
  );

  /** A new password is always needed when creating, never when editing. */
  protected readonly passwordRequired = computed(() => this.editing() === null);

  protected readonly passwordTooShort = computed(() => {
    const password = this.model().password;

    return password !== '' && password.length < MIN_PASSWORD_LENGTH;
  });

  protected readonly canSubmit = computed(
    () =>
      !this.saving() &&
      this.roleForm().valid() &&
      !this.passwordTooShort() &&
      (!this.passwordRequired() || this.model().password !== ''),
  );

  constructor() {
    // The name first: which role is being edited is the real information in the
    // tab. When creating there is none, and then the route's title stays.
    refinePageTitle(() => {
      const editing = this.editing();

      return editing ? `Rolle ${editing.name} bearbeiten` : null;
    });

    const id = this.route.snapshot.paramMap.get('id');

    // The whole list rather than just the one role: answering whether this is the
    // last managing role needs the others anyway.
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
          this.others.set(roles.filter((role) => role.id !== id));

          if (id) {
            const role = roles.find((candidate) => candidate.id === id);

            if (!role) {
              this.loadError.set('Die Rolle gibt es nicht (mehr).');
              this.loading.set(false);

              return;
            }

            this.editing.set(role);
            this.model.set({ name: role.name, password: '' });
            this.permissions.set({ ...role.permissions });
          }

          this.loading.set(false);
        },
        error: () => {
          this.loadError.set('Die Rolle liess sich nicht laden.');
          this.loading.set(false);
        },
      });
  }

  protected granted(key: PermissionKey): boolean {
    return this.permissions()[key];
  }

  /** What cannot be changed stands there checked and greyed out. */
  protected locked(key: PermissionKey): boolean {
    if (key !== 'manageRoles') {
      return false;
    }

    // The backend would refuse this permission to the anonymous role anyway: with
    // it, anyone could make themselves an administrator without logging in.
    return this.isAnonymous() || this.lastAdmin();
  }

  protected lockedReason(key: PermissionKey): string | null {
    if (!this.locked(key)) {
      return null;
    }

    return this.isAnonymous()
      ? 'Sonst dürfte jeder ohne Anmeldung verwalten.'
      : 'Es ist die letzte Rolle, die verwalten darf.';
  }

  protected toggle(key: PermissionKey, granted: boolean): void {
    this.permissions.update((permissions) => ({ ...permissions, [key]: granted }));
  }

  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }

    const role = this.editing();
    const value = this.model();

    const body: RoleWrite = {
      name: value.name.trim(),
      permissions: this.permissions(),
      // An empty field means "unchanged", not "no password" — otherwise it would
      // have to be set again on every rename.
      ...(value.password === '' ? {} : { password: value.password }),
    };

    this.saving.set(true);
    this.saveError.set(null);

    const request = role
      ? updateRole(this.http, this.rootUrl, { id: role.id, body })
      : createRole(this.http, this.rootUrl, { body });

    request.subscribe({
      next: () => this.router.navigate(['/verwaltung/rollen']),
      error: (response: HttpErrorResponse) => {
        this.saving.set(false);
        this.saveError.set(
          (response.error as ApiError | null)?.message ?? 'Speichern fehlgeschlagen.',
        );
      },
    });
  }

  protected cancel(): void {
    this.router.navigate(['/verwaltung/rollen']);
  }
}
