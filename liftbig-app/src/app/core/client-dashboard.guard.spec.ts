import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { AuthService } from './auth.service';
import { fakeToken } from './auth.testing';
import { clientDashboardGuard } from './client-dashboard.guard';

@Component({ template: '' })
class StubPage {}

describe('clientDashboardGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          {
            path: 'dashboard',
            canActivate: [clientDashboardGuard],
            component: StubPage,
          },
          { path: 'coach/dashboard', component: StubPage },
        ]),
      ],
    });
  });

  afterEach(() => {
    localStorage.removeItem('token');
  });

  async function open(role: 'COACH' | 'CLIENT') {
    TestBed.inject(AuthService).setSession(fakeToken(role));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/dashboard');
    return TestBed.inject(Router).url;
  }

  it('sends a COACH to /coach/dashboard', async () => {
    expect(await open('COACH')).toBe('/coach/dashboard');
  });

  it('lets a CLIENT open /dashboard', async () => {
    expect(await open('CLIENT')).toBe('/dashboard');
  });
});
