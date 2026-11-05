// This file is required by karma.conf.js and loads recursively all the .spec and framework files

import 'zone.js/testing';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting
} from '@angular/platform-browser-dynamic/testing';

// First, initialize the Angular testing environment.
getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
);

// Specs never open the new tab of a target="_blank" link. In headless Chrome
// that tab hides this page, which then gets no animation frames, so every
// later spec that waits on Ionic rendering or whenStable times out. The click
// itself still reaches the page's handlers.
document.addEventListener(
  'click',
  (event) => {
    if ((event.target as Element | null)?.closest?.('a[target="_blank"]')) event.preventDefault();
  },
  true,
);
