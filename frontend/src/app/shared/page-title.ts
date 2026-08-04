import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

/** Appended to every window title — a tab would otherwise name only a date. */
export const APP_NAME = 'Quartierwerkstatt';

/**
 * The window title, in two stages: the route knows which page is open, the view
 * knows what is on it — "Arbeitsplatz im Monat" versus "Werkbank / August 2026".
 * Only whoever has the data can name the second; the first is settled at
 * navigation time and carries until then.
 *
 * Both converge here rather than in two writers, because otherwise the order
 * would decide: the strategy writes on navigation, a view in an effect some time
 * afterwards — whoever writes last wins, and that is not reliably the same one.
 * So only the source is registered; writing happens in one place.
 */
@Injectable({ providedIn: 'root' })
export class PageTitle {
  private readonly title = inject(Title);

  /** What the route knows. */
  private readonly routeTitle = signal<string | undefined>(undefined);

  /** What the visible view knows, for as long as it exists. */
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
   * The view registers its title and deregisters it on destruction. Registration
   * and deregistration happen when the route activates, and therefore before the
   * route's title — so a replaced view can no longer overwrite the next one's
   * title.
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
 * Refines the route's title with what only the view knows. If the function
 * returns null, the route's title stays in place.
 *
 * To be called in the constructor of a view.
 */
export function refinePageTitle(part: () => string | null): void {
  inject(PageTitle).refine(part);
}
