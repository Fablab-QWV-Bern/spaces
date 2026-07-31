import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { SessionService } from './session-service';

/**
 * Anmeldung als Rolle. Es gibt keine Benutzer — man wählt die Rolle, unter der
 * man handelt, und teilt sich deren Kennwort mit allen anderen.
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
      <form method="dialog" (submit)="$event.preventDefault(); submit()">
        <h2>Anmelden</h2>

        <label>
          <span>Rolle</span>
          <input
            type="text"
            [ngModel]="roleName()"
            (ngModelChange)="roleName.set($event)"
            name="roleName"
            autocomplete="username"
            required
          />
        </label>

        <label>
          <span>Kennwort</span>
          <input
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

      form {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        font-family: system-ui, sans-serif;
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
    }
  `,
})
export class SessionBar {
  protected readonly session = inject(SessionService);
  private readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly roleName = signal('');
  protected readonly password = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected open(): void {
    this.error.set(null);
    this.password.set('');
    this.dialogRef()?.nativeElement.showModal();
  }

  protected close(): void {
    this.dialogRef()?.nativeElement.close();
  }

  protected submit(): void {
    this.busy.set(true);
    this.error.set(null);

    this.session.login(this.roleName(), this.password()).subscribe({
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
