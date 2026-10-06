import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { startupMark, startupProfileEnabled } from './app/core/utils/startup-profile';

startupMark('angular-bootstrap-start');
bootstrapApplication(App, appConfig)
  .then((application) => {
    startupMark('angular-bootstrap-end');
    if (startupProfileEnabled)
      void application.whenStable().then(() => startupMark('initial-angular-stable'));
  })
  .catch((err) => console.error(err));
