import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { mockApiInterceptor } from './core/api/mock-api';
import { routes } from './app.routes';

/**
 * `false` = the app talks to the REAL API (SmartHomeIoT.Api) through the dev
 * server's proxy (`proxy.conf.json` → http://localhost:5080).
 * Set it to `true` to run without a backend against the mock data in
 * `core/api/mock-api.ts` — same contract, no database.
 */
const USE_MOCK_API = false;

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(...(USE_MOCK_API ? [withInterceptors([mockApiInterceptor])] : [])),
  ],
};
