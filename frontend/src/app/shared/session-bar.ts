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
  template: `
    <!-- The role name stands on its own: next to a logout button, "Angemeldet
         als" says nothing that is not already there. When narrow, only one glyph
         each remains of the buttons; they are labelled nonetheless — via
         aria-label and title, not via visible text. -->
    <div class="bar">
      @if (session.isAnonymous()) {
        <button type="button" (click)="open()" title="Anmelden" aria-label="Anmelden">
          <app-icon class="icon" name="login" />
          <span class="text">Anmelden</span>
        </button>
      } @else {
        <strong class="role">{{ session.roleName() }}</strong>
        <button type="button" (click)="logout()" title="Abmelden" aria-label="Abmelden">
          <app-icon class="icon" name="logout" />
          <span class="text">Abmelden</span>
        </button>
      }
    </div>

    <dialog #dialog class="login">
      <form method="dialog" (submit)="$event.preventDefault(); submit()">
        <h2>Anmelden</h2>

        @if (loadingRoles()) {
          <p class="hint">Wird geladen …</p>
        } @else {
          <div class="roles" role="group" aria-label="Rolle">
            @for (role of roles(); track role) {
              <button
                type="button"
                class="role-choice"
                [class.selected]="selectedRole() === role"
                [attr.aria-pressed]="selectedRole() === role"
                (click)="selectRole(role)"
              >
                {{ role }}
              </button>
            }
          </div>
        }

        <!-- The browser's password manager needs a username alongside the
             password, otherwise it does not know what to file the saved entry
             under and when to offer it. It is not visible here — the role is
             already above as a switch. It is taken out of the layout by clipping
             rather than via hidden or display: none — what the browser does not
             render at all, it does not count as a field either. -->
        <input
          class="username"
          type="text"
          name="username"
          autocomplete="username"
          [value]="selectedRole() ?? ''"
          readonly
          tabindex="-1"
          aria-hidden="true"
        />

        <label>
          <span>Kennwort</span>
          <input
            #passwordField
            type="password"
            [ngModel]="password()"
            (ngModelChange)="password.set($event)"
            name="password"
            autocomplete="current-password"
            required
          />
        </label>

        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }

        <div class="actions">
          <button type="submit" class="primary" [disabled]="busy() || !selectedRole()">
            Anmelden
          </button>
          <button type="button" (click)="close()">Abbrechen</button>
        </div>
      </form>
    </dialog>
  `,
  styles: `
    .bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
      color: var(--text-muted);

      // Wherever a bar states a height for its controls, this button joins in;
      // where none is stated it keeps its own. The fallback is what makes that
      // difference — without it the declaration would fall away instead, which
      // amounts to the same thing but only by accident.
      button {
        display: inline-flex;
        align-items: center;
        min-height: var(--control-height, 0);
      }

      .icon {
        display: none;
      }
    }

    // The same threshold as in the calendar chrome.
    @media (width < 48rem) {
      .bar {
        .icon {
          display: inline-flex;
          font-size: 1rem;
        }

        .text {
          display: none;
        }
      }
    }

    button {
      padding: 0.35rem 0.7rem;
      font: inherit;
      font-size: 0.85rem;
      line-height: 1.2;
      border: 1px solid var(--line-strong);
      border-radius: 0.25rem;
      background: var(--paper);
      cursor: pointer;

      &:hover {
        background: var(--surface-muted);
      }

      &.primary {
        background: var(--accent);
        border-color: var(--accent);
        color: var(--paper);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    .login {
      border: 1px solid var(--line-strong);
      border-radius: 0.4rem;
      padding: 1.25rem;
      min-width: 18rem;

      &::backdrop {
        background: var(--scrim);
      }

      h2 {
        margin: 0 0 0.75rem;
        font-size: 1.1rem;
      }

      form {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        font-family: system-ui, sans-serif;
      }

      // One connected switch rather than a row of separate buttons: it is one
      // choice and not several offers. Built like the zoom switch in the header —
      // shared edge, rounding only on the outside, marked in --text-muted. The
      // accent stays with the login button: what is selected is something other
      // than what the click does.
      .roles {
        display: flex;
      }

      .role-choice {
        flex: 1;
        padding: 0.5rem 0.75rem;
        font-size: 0.95rem;
        border-radius: 0;

        // The inner edges lie on top of each other; otherwise there would be a
        // double line.
        &:not(:first-child) {
          margin-left: -1px;
        }

        &:first-child {
          border-radius: 0.25rem 0 0 0.25rem;
        }

        &:last-child {
          border-radius: 0 0.25rem 0.25rem 0;
        }

        // Brought forward so that the selected role's dark edge does not
        // disappear beneath its neighbour's.
        &.selected {
          position: relative;
          background: var(--text-muted);
          border-color: var(--text-muted);
          color: var(--paper);
        }
      }

      // Clipped rather than hidden — why is explained at the spot itself.
      .username {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        border: 0;
        clip-path: inset(50%);
        overflow: hidden;
      }

      label {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        font-size: 0.85rem;
      }

      input {
        padding: 0.4rem 0.5rem;
        font: inherit;
        border: 1px solid var(--line-strong);
        border-radius: 0.25rem;
      }

      .actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.35rem;
      }

      .error {
        margin: 0;
        color: var(--danger-text);
        font-size: 0.85rem;
      }

      .hint {
        margin: 0;
        color: var(--text-soft);
        font-size: 0.85rem;
      }
    }
  `,
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
