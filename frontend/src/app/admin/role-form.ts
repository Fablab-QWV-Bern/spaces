import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { map, of, switchMap } from 'rxjs';

import { ApiConfiguration } from '../api/api-configuration';
import { createRole, listRoles, updateRole } from '../api/functions';
// Umbenannt, damit das generierte Modell das globale Error nicht verdeckt.
import { Error as ApiError, Permissions, Role, RoleWrite } from '../api/models';
import { SessionService } from '../shared/session-service';
import { AdminHeader } from './admin-header';
import { PERMISSION_LABELS, PermissionKey } from './permission-labels';

/** Kürzer nimmt das Backend es nicht an. */
const MIN_PASSWORD_LENGTH = 8;

interface RoleFormValue {
  name: string;
  /** Leer heisst beim Bearbeiten "bleibt, wie es ist". */
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

  /** Gesetzt, wenn eine bestehende Rolle bearbeitet wird. */
  protected readonly editing = signal<Role | null>(null);

  /** Die übrigen Rollen — für die Frage, wer sonst noch verwalten darf. */
  private readonly others = signal<Role[]>([]);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);

  /**
   * Die Berechtigungen stehen neben dem Formularmodell: eine Reihe von
   * Ankreuzfeldern führt sich als Objekt einfacher als als Feld — wie die
   * blockierten Arbeitsplätze im Arbeitsplatzformular.
   */
  protected readonly permissions = signal<Permissions>({ ...NO_PERMISSIONS });

  protected readonly model = signal<RoleFormValue>({ name: '', password: '' });

  /** Wie im Buchungsformular: nur Pflichtfelder hier, alles Weitere im Backend. */
  protected readonly roleForm = form(this.model, (path) => {
    required(path.name, { message: 'Bitte einen Namen angeben.' });
  });

  protected readonly heading = computed(() => (this.editing() ? 'Rolle bearbeiten' : 'Neue Rolle'));

  /** Die anonyme Rolle hat kein Kennwort — sie ist der Zustand vor der Anmeldung. */
  protected readonly isAnonymous = computed(() => this.editing()?.isAnonymous ?? false);

  /**
   * Ob diese Rolle die einzige verwaltende ist. Dann bleibt das Kreuz stehen:
   * ohne eine solche Rolle käme niemand mehr an die Verwaltung.
   */
  protected readonly lastAdmin = computed(
    () =>
      (this.editing()?.permissions.manageRoles ?? false) &&
      !this.others().some((role) => role.permissions.manageRoles),
  );

  /** Ein neues Kennwort braucht es beim Anlegen immer, beim Bearbeiten nie. */
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
    const id = this.route.snapshot.paramMap.get('id');

    // Die ganze Liste statt nur der einen Rolle: für die Frage, ob dies die
    // letzte verwaltende Rolle ist, braucht es ohnehin die anderen.
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

  /** Was sich nicht ändern lässt, steht angekreuzt und stumpf da. */
  protected locked(key: PermissionKey): boolean {
    if (key !== 'manageRoles') {
      return false;
    }

    // Der anonymen Rolle würde das Backend dieses Recht ohnehin verweigern:
    // damit könnte sich jeder ohne Anmeldung selbst zum Verwalter machen.
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
      // Ein leeres Feld heisst "unverändert", nicht "kein Kennwort" — sonst
      // müsste man es bei jeder Umbenennung neu setzen.
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
