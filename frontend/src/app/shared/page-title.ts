import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

/** Steht hinten in jedem Fenstertitel — ein Reiter nennt sonst nur ein Datum. */
export const APP_NAME = 'Quartierwerkstatt';

/**
 * Der Fenstertitel, zweistufig: die Route weiss, welche Seite offen ist, die
 * Ansicht weiss, was auf ihr steht — "Arbeitsplatz im Monat" gegen "Werkbank /
 * August 2026". Das Zweite kann erst nennen, wer die Daten hat; das Erste steht
 * schon beim Navigieren fest und trägt so lange.
 *
 * Beides läuft hier zusammen und nicht in zwei Schreibern, weil sonst die
 * Reihenfolge entschiede: die Strategie schreibt beim Navigieren, eine Ansicht
 * in einem Effekt irgendwann danach — wer zuletzt schreibt, gewinnt, und das
 * ist nicht verlässlich derselbe. Angemeldet wird darum nur die Quelle,
 * geschrieben wird an einer Stelle.
 */
@Injectable({ providedIn: 'root' })
export class PageTitle {
  private readonly title = inject(Title);

  /** Was die Route weiss. */
  private readonly routeTitle = signal<string | undefined>(undefined);

  /** Was die sichtbare Ansicht weiss, solange es sie gibt. */
  private readonly detail = signal<(() => string | null) | null>(null);

  constructor() {
    effect(() => {
      const detail = this.detail();
      const text = (detail ? detail() : null) ?? this.routeTitle();

      this.title.setTitle(text ? `${text} — ${APP_NAME}` : APP_NAME);
    });
  }

  setRouteTitle(value: string | undefined): void {
    this.routeTitle.set(value);
  }

  /**
   * Die Ansicht meldet ihren Titel an und beim Zerstören wieder ab. An- und
   * Abmeldung geschehen beim Aktivieren der Route und damit vor dem Titel der
   * Route — eine abgelöste Ansicht kann den Titel der nächsten also nicht mehr
   * überschreiben.
   */
  refine(part: () => string | null): void {
    const destroyRef = inject(DestroyRef);

    this.detail.set(part);

    destroyRef.onDestroy(() => {
      if (this.detail() === part) {
        this.detail.set(null);
      }
    });
  }
}

@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private readonly page = inject(PageTitle);

  override updateTitle(state: RouterStateSnapshot): void {
    this.page.setRouteTitle(this.buildTitle(state));
  }
}

/**
 * Verfeinert den Titel der Route um das, was nur die Ansicht weiss. Gibt die
 * Funktion null zurück, bleibt der Titel der Route stehen.
 *
 * Aufzurufen im Konstruktor einer Ansicht.
 */
export function refinePageTitle(part: () => string | null): void {
  inject(PageTitle).refine(part);
}
