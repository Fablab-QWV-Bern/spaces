import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

// Umbenannt, damit das generierte Modell das globale Error nicht verdeckt.
import { Error as ApiError } from '../api/models';
import { Icon } from './icon';
import { SessionService } from './session-service';

/**
 * Anmeldung als Rolle. Es gibt keine Benutzer — man wählt die Rolle, unter der
 * man handelt, und teilt sich deren Kennwort mit allen anderen.
 *
 * Die Rolle steht als Umschalter neben dem Kennwortfeld und nicht als eigener
 * Schritt davor: die Liste ist kurz und bekannt, und fast jede Anmeldung meint
 * ohnehin die erste. Voreingestellt ist darum die erste — `GET /session/roles`
 * gibt sie in der Reihenfolge ihrer Entstehung zurück, und angelegt wird die
 * alltägliche Rolle vor den verwaltenden. Wer sie meint, tippt nur noch das
 * Kennwort.
 */
@Component({
  selector: 'app-session-bar',
  imports: [FormsModule, Icon],
  template: `
    <!-- Der Rollenname steht für sich: neben einem Abmelden-Knopf sagt "Angemeldet
         als" nichts, was nicht schon dasteht. Schmal bleibt von den Knöpfen nur je
         ein Zeichen übrig; beschriftet sind sie trotzdem — über aria-label und
         title, nicht über sichtbaren Text. -->
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

        <!-- Der Kennwortverwalter des Browsers braucht neben dem Kennwort einen
             Benutzernamen, sonst weiss er nicht, wozu er das Gemerkte ablegen
             und wann er es anbieten soll. Sichtbar ist er hier nicht — die
             Rolle steht schon als Umschalter darüber. Aus dem Layout genommen
             wird er per Zuschnitt und nicht über hidden oder display: none —
             was der Browser gar nicht darstellt, zählt er auch nicht als Feld. -->
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

      .icon {
        display: none;
      }
    }

    // Dieselbe Schwelle wie im Kalendergerüst.
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

      // Ein zusammenhängender Umschalter und keine Reihe einzelner Knöpfe: es
      // ist eine Wahl und nicht mehrere Angebote. Gebaut wie der Zoomumschalter
      // in der Kopfleiste — geteilte Kante, Rundung nur aussen, ausgezeichnet
      // in --text-muted. Der Akzent bleibt dem Anmelden-Knopf: was gewählt
      // ist, ist etwas anderes als was der Klick tut.
      .roles {
        display: flex;
      }

      .role-choice {
        flex: 1;
        padding: 0.5rem 0.75rem;
        font-size: 0.95rem;
        border-radius: 0;

        // Die Innenkanten liegen aufeinander; sonst stünde dort ein doppelter
        // Strich.
        &:not(:first-child) {
          margin-left: -1px;
        }

        &:first-child {
          border-radius: 0.25rem 0 0 0.25rem;
        }

        &:last-child {
          border-radius: 0 0.25rem 0.25rem 0;
        }

        // Nach vorn geholt, damit die dunkle Kante der gewählten Rolle nicht
        // unter der ihres Nachbarn verschwindet.
        &.selected {
          position: relative;
          background: var(--text-muted);
          border-color: var(--text-muted);
          color: var(--paper);
        }
      }

      // Zugeschnitten statt versteckt — warum, steht an der Stelle selbst.
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
    // Der Fokus gehört ins Kennwortfeld und nicht auf den ersten Rollenknopf:
    // die Rolle ist schon gewählt, das Kennwort ist die offene Frage. Einen
    // Tick später, weil `showModal()` selbst noch fokussiert.
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
   * Das Kennwort bleibt beim Umschalten stehen. Wer es getippt hat und erst
   * dann merkt, dass die andere Rolle gemeint war, soll es nicht zweimal
   * tippen; der Fehler von vorhin gilt der alten Rolle und verschwindet.
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
        // Die Ansicht hängt an den Berechtigungen — nach dem Wechsel neu laden.
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
