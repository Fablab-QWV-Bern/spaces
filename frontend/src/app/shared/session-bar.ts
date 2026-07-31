import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { SessionService } from './session-service';

/**
 * Anmeldung als Rolle. Es gibt keine Benutzer — man wählt die Rolle, unter der
 * man handelt, und teilt sich deren Kennwort mit allen anderen.
 *
 * Der Dialog zeigt zuerst eine Schaltfläche pro Rolle statt eines
 * Freitextfelds — die Rollen sind eine kleine, bekannte Liste, aus der man
 * auswählt statt sie zu tippen. Erst nach der Auswahl erscheint das Kennwortfeld.
 */
@Component({
  selector: 'app-session-bar',
  imports: [FormsModule],
  template: `
    <div class="bar">
      @if (session.isAnonymous()) {
        <button type="button" (click)="open()">Anmelden</button>
      } @else {
        <span class="role"
          >Angemeldet als <strong>{{ session.roleName() }}</strong></span
        >
        <button type="button" (click)="logout()">Abmelden</button>
      }
    </div>

    <dialog #dialog class="login">
      @if (!selectedRole()) {
        <div class="roles">
          <h2>Anmelden als</h2>

          @if (loadingRoles()) {
            <p class="hint">Wird geladen …</p>
          } @else {
            @for (role of roles(); track role) {
              <button type="button" class="role-choice" (click)="selectRole(role)">
                {{ role }}
              </button>
            }
          }

          <div class="actions">
            <button type="button" (click)="close()">Abbrechen</button>
          </div>
        </div>
      } @else {
        <form method="dialog" (submit)="$event.preventDefault(); submit()">
          <h2>Anmelden als {{ selectedRole() }}</h2>

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
            <button type="submit" class="primary" [disabled]="busy()">Anmelden</button>
            <button type="button" (click)="back()">Andere Rolle</button>
            <button type="button" (click)="close()">Abbrechen</button>
          </div>
        </form>
      }
    </dialog>
  `,
  styles: `
    .bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
      color: #475569;
    }

    button {
      padding: 0.35rem 0.7rem;
      font: inherit;
      font-size: 0.85rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.25rem;
      background: #fff;
      cursor: pointer;

      &:hover {
        background: #f1f5f9;
      }

      &.primary {
        background: #2563eb;
        border-color: #2563eb;
        color: #fff;
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    .login {
      border: 1px solid #cbd5e1;
      border-radius: 0.4rem;
      padding: 1.25rem;
      min-width: 18rem;

      &::backdrop {
        background: rgb(15 23 42 / 0.35);
      }

      h2 {
        margin: 0 0 0.75rem;
        font-size: 1.1rem;
      }

      form,
      .roles {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        font-family: system-ui, sans-serif;
      }

      .role-choice {
        padding: 0.6rem 0.75rem;
        text-align: left;
        font-size: 0.95rem;
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
        border: 1px solid #cbd5e1;
        border-radius: 0.25rem;
      }

      .actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.35rem;
      }

      .error {
        margin: 0;
        color: #b91c1c;
        font-size: 0.85rem;
      }

      .hint {
        margin: 0;
        color: #64748b;
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

    this.loadingRoles.set(true);
    this.session.loginableRoles().subscribe({
      next: (roles) => {
        this.roles.set(roles);
        this.loadingRoles.set(false);
      },
      error: () => this.loadingRoles.set(false),
    });
  }

  protected selectRole(role: string): void {
    this.selectedRole.set(role);
    this.password.set('');
    this.error.set(null);
    // Der Dialog rendert das Kennwortfeld erst in diesem Moment neu — der
    // Fokus muss deshalb einen Tick später gesetzt werden.
    setTimeout(() => this.passwordFieldRef()?.nativeElement.focus());
  }

  protected back(): void {
    this.selectedRole.set(null);
    this.error.set(null);
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
        // Die Ansicht hängt an den Berechtigungen — nach dem Wechsel neu laden.
        window.location.reload();
      },
      error: (response: { status: number; error?: { message?: string } }) => {
        this.busy.set(false);
        this.error.set(
          response.error?.message ??
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
