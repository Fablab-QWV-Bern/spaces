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
    // The route's title is only half of it: the views refine it with what is
    // only settled once the data arrives (see `page-title.ts`).
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    provideHttpClient(
      withFetch(),
      // Laravel expects the CSRF token as X-XSRF-TOKEN, read from the
      // XSRF-TOKEN cookie. Without it every writing call fails with 419.
      withXsrfConfiguration({
        cookieName: 'XSRF-TOKEN',
        headerName: 'X-XSRF-TOKEN',
      }),
    ),
    // Same origin: the dev server proxies /api to Laravel, and in production
    // both live behind the same domain.
    provideApiConfiguration('/api'),
  ],
};
