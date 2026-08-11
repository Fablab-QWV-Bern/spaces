import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

// Renamed so that the generated model does not shadow the global Error.
import { Error as ApiError } from '../api/models';
import { Icon } from './icon';
import { SessionService } from './session-service';

/**
 * Logging in as a role. There are no users — one picks the role one acts under
 * and shares its password with everyone else.
 *
 * The role stands as a switch next to the password field rather than as a
 * separate step before it: the list is short and familiar, and almost every login
 * means the first one anyway. The first is therefore preselected —
 * `GET /session/roles` returns them in order of creation, and the everyday role is
 * created before the managing ones. Whoever means it only has to type the
 * password.
 */
@Component({
  selector: 'app-session-bar',
  imports: [FormsModule, Icon],
  templateUrl: './session-bar.html',
  styleUrl: './session-bar.scss',
})
export class SessionBar {
  protected readonly session = inject(SessionService);
  private readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly passwordFieldRef = viewChild<ElementRef<HTMLInputElement>>('passwordField');

  protected readonly roles = signal<string[]>([]);
  protected readonly loadingRoles = signal(false);
  protected readonly selectedRole = signal<string | null>(null);
  protected readonly password = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected open(): void {
    this.selectedRole.set(null);
    this.password.set('');
    this.error.set(null);
    this.dialogRef()?.nativeElement.showModal();
    // The focus belongs in the password field and not on the first role button:
    // the role is already selected, the password is the open question. A tick
    // later, because `showModal()` itself still moves focus.
    setTimeout(() => this.passwordFieldRef()?.nativeElement.focus());

    this.loadingRoles.set(true);
    this.session.loginableRoles().subscribe({
      next: (roles) => {
        this.roles.set(roles);
        this.selectedRole.set(roles[0] ?? null);
        this.loadingRoles.set(false);
      },
      error: () => this.loadingRoles.set(false),
    });
  }

  /**
   * The password survives switching. Someone who has typed it and only then
   * realises the other role was meant should not have to type it twice; the
   * earlier error applies to the old role and disappears.
   */
  protected selectRole(role: string): void {
    this.selectedRole.set(role);
    this.error.set(null);
    this.passwordFieldRef()?.nativeElement.focus();
  }

  protected close(): void {
    this.dialogRef()?.nativeElement.close();
  }

  protected submit(): void {
    const role = this.selectedRole();

    if (!role) {
      return;
    }

    this.busy.set(true);
    this.error.set(null);

    this.session.login(role, this.password()).subscribe({
      next: () => {
        this.busy.set(false);
        this.password.set('');
        this.close();
        // The view hangs off the permissions — reload after the switch.
        window.location.reload();
      },
      error: (response: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(
          (response.error as ApiError | null)?.message ??
            (response.status === 429
              ? 'Zu viele Versuche. Bitte kurz warten.'
              : 'Anmeldung fehlgeschlagen.'),
        );
      },
    });
  }

  protected logout(): void {
    this.session.logout().subscribe(() => window.location.reload());
  }
}
