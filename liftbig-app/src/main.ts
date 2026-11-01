import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { captureException } from '@sentry/capacitor';

import { AppModule } from './app/app.module';
import { initSentry } from './app/core/sentry';

// Before Angular boots, so start-up errors are reported too (a no-op without a DSN)
initSentry();

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => {
    captureException(err);
    console.log(err);
  });
