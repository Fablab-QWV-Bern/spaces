import { Component, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { SessionBar } from '../shared/session-bar';
import { SessionService } from '../shared/session-service';

/**
 * Kopfzeile der Verwaltung: Titel, Wechsel zwischen den Bereichen der
 * Verwaltung, Weg zurück in den Kalender, Anmeldung.
 *
 * Ein Reiter erscheint nur, wenn die angemeldete Rolle ihn auch benutzen darf —
 * ein Link, der zuverlässig auf einen Hinweis führt, ist kein Link.
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
      }
      @if (session.canManageRoles()) {
        <a routerLink="/verwaltung/rollen" routerLinkActive="active">Rollen</a>
        <a routerLink="/verwaltung/konfiguration" routerLinkActive="active">Konfiguration</a>
      }
      <a class="feed" [href]="feedUrl" [title]="feedHint">iCal-Feed</a>
      <a routerLink="/tag">Zurück zur Übersicht</a>
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

      .feed {
        margin-left: auto;
      }
    }
  `,
})
export class AdminHeader {
  readonly heading = input.required<string>();

  protected readonly session = inject(SessionService);

  /**
   * `webcal:` statt `https:`, damit ein Klick den Kalender abonniert statt eine
   * einmalige Datei herunterzuladen — das Schema ist der ganze Unterschied
   * zwischen Abo und Momentaufnahme. Wer die Adresse zum Einfügen braucht,
   * findet sie im Titel des Links.
   */
  protected readonly feedUrl = `webcal://${location.host}/api/calendar.ics`;

  protected readonly feedHint =
    `Buchungen im eigenen Kalender abonnieren: ` + `${location.origin}/api/calendar.ics`;
}
