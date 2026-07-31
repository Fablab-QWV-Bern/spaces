import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withXsrfConfiguration } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { provideApiConfiguration } from './api/api-configuration';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
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
