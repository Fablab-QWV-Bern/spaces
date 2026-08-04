import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withXsrfConfiguration } from '@angular/common/http';
import { TitleStrategy, provideRouter } from '@angular/router';

import { provideApiConfiguration } from './api/api-configuration';
import { routes } from './app.routes';
import { AppTitleStrategy } from './shared/page-title';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Der Titel der Route ist nur die Hälfte: die Ansichten verfeinern ihn um
    // das, was erst mit den Daten feststeht (siehe `page-title.ts`).
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    provideHttpClient(
      withFetch(),
      // Laravel erwartet das CSRF-Token als X-XSRF-TOKEN, gelesen aus dem
      // XSRF-TOKEN-Cookie. Ohne das scheitert jeder schreibende Aufruf mit 419.
      withXsrfConfiguration({
        cookieName: 'XSRF-TOKEN',
        headerName: 'X-XSRF-TOKEN',
      }),
    ),
    // Gleicher Origin: der Dev-Server leitet /api an Laravel weiter, im Betrieb
    // liegt beides hinter derselben Domain.
    provideApiConfiguration('/api'),
  ],
};
