import { Component, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { SessionBar } from '../shared/session-bar';
import { SessionService } from '../shared/session-service';

/**
 * The admin header: title, switching between the admin sections, the way back
 * into the calendar, login.
 *
 * A tab only appears when the logged-in role may actually use it — a link that
 * reliably leads to a notice is not a link. The feeds and embeddable views used
 * to hang here too; they have moved into their own "Schnittstellen" section.
 */
@Component({
  selector: 'app-admin-header',
  imports: [RouterLink, RouterLinkActive, SessionBar],
  template: `
    <div class="top">
      <h1>{{ heading() }}</h1>
      <app-session-bar />
    </div>

    <nav class="tabs">
      @if (session.canManageAreas()) {
        <a routerLink="/verwaltung/bereiche" routerLinkActive="active">Bereiche</a>
      }
      @if (session.canManageWorkplaces()) {
        <a routerLink="/verwaltung/arbeitsplaetze" routerLinkActive="active">Arbeitsplätze</a>
        <a routerLink="/verwaltung/karte" routerLinkActive="active">Karte</a>
      }
      @if (session.canManageBookingSeries()) {
        <a routerLink="/verwaltung/serien" routerLinkActive="active">Serien</a>
      }
      @if (session.canManageRoles()) {
        <a routerLink="/verwaltung/rollen" routerLinkActive="active">Rollen</a>
        <a routerLink="/verwaltung/konfiguration" routerLinkActive="active">Konfiguration</a>
        <!-- Feeds, embeddable views and the API contract all live on one page. -->
        <a routerLink="/verwaltung/schnittstellen" routerLinkActive="active">Schnittstellen</a>
      }
      <a class="back" routerLink="/tag">Zurück zum Kalender</a>
    </nav>
  `,
  styles: `
    :host {
      display: block;
      padding: 1rem 1.5rem 0.75rem;
      max-width: 60rem;
    }

    .top {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }

    h1 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
    }

    .tabs {
      display: flex;
      gap: 1rem;
      margin-top: 0.75rem;
      border-bottom: 1px solid var(--line);
      font-size: 0.9rem;

      a {
        padding: 0.4rem 0.1rem;
        color: var(--text-muted);
        text-decoration: none;
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;

        &:hover {
          color: var(--ink);
        }

        &.active {
          color: var(--ink);
          border-bottom-color: var(--accent);
          font-weight: 600;
        }
      }

      // The way out, not a section — pushed to the far side, away from the tabs.
      .back {
        margin-left: auto;
      }
    }
  `,
})
export class AdminHeader {
  readonly heading = input.required<string>();

  protected readonly session = inject(SessionService);
}
