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
            path: 'today',
            canActivate: [clientDashboardGuard],
            component: StubPage,
          },
          {
            path: 'profile',
            canActivate: [clientDashboardGuard],
            data: { coachUrl: '/coach/profile' },
            component: StubPage,
          },
          { path: 'coach/clients', component: StubPage },
          { path: 'coach/profile', component: StubPage },
        ]),
      ],
    });
  });

  afterEach(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  });

  async function open(role: 'COACH' | 'CLIENT', url = '/today') {
    TestBed.inject(AuthService).setSession(fakeToken(role));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return TestBed.inject(Router).url;
  }

  it('sends a COACH to /coach/clients', async () => {
    expect(await open('COACH')).toBe('/coach/clients');
  });

  it("sends a COACH to the route's coachUrl when it has one", async () => {
    expect(await open('COACH', '/profile')).toBe('/coach/profile');
  });

  it('lets a CLIENT open /today', async () => {
    expect(await open('CLIENT')).toBe('/today');
  });
});
