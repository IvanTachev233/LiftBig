import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Route, Router, RouterOutlet, Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app-routing.module';
import { AuthService } from './core/auth.service';
import { fakeToken } from './core/auth.testing';
import { RoleGuard } from './core/role.guard';
import { AthleteTabsPage } from './pages/tabs/athlete-tabs.page';
import { CoachTabsPage } from './pages/tabs/coach-tabs.page';
import { SignedOutGuard } from './core/signed-out.guard';
import { VerifyEmailPage } from './pages/verify-email/verify-email.page';
import { ForgotPasswordPage } from './pages/forgot-password/forgot-password.page';

/** Every route with its full path, parents before children */
function flatten(rs: Routes, prefix = ''): { path: string; route: Route }[] {
  return rs.reduce<{ path: string; route: Route }[]>((all, route) => {
    const path = [prefix, route.path].filter(Boolean).join('/');
    return [...all, { path, route }, ...flatten(route.children ?? [], path)];
  }, []);
}

@Component({ template: '' })
class StubPage {}

@Component({
  selector: 'app-stub-tabs',
  template: '<nav class="stub-tab-bar"></nav><router-outlet />',
  imports: [RouterOutlet],
})
class StubTabsPage {}

/** The app routes with lazy screens swapped for stubs; guards and redirects kept */
function stubbed(rs: Routes): Routes {
  return rs.map(({ loadComponent, loadChildren, ...route }) => ({
    ...route,
    ...(route.children
      ? { component: StubTabsPage, children: stubbed(route.children) }
      : loadComponent || loadChildren
        ? { component: StubPage }
        : {}),
  }));
}

describe('Premade Programs routes', () => {
  afterEach(() => localStorage.removeItem('token'));

  const programRoutes = flatten(routes).filter(({ path }) => path.startsWith('programs'));

  it('are CLIENT-only', () => {
    expect(programRoutes.map(({ path }) => path).sort()).toEqual([
      'programs',
      'programs/:id',
      'programs/active',
    ]);
    for (const { route } of programRoutes) {
      expect(route.canActivate).toContain(RoleGuard);
      expect(route.data).toEqual({ role: 'CLIENT' });
    }
  });

  it('redirect a COACH to their clients', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideRouter([])],
    });
    TestBed.inject(AuthService).setSession(fakeToken('COACH'));
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    const snapshot = { data: { role: 'CLIENT' } } as unknown as ActivatedRouteSnapshot;

    const allowed = TestBed.inject(RoleGuard).canActivate(snapshot);

    expect(allowed).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/coach/clients', undefined);
  });

  it('let a CLIENT in', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideRouter([])],
    });
    TestBed.inject(AuthService).setSession(fakeToken('CLIENT'));
    const snapshot = { data: { role: 'CLIENT' } } as unknown as ActivatedRouteSnapshot;
    expect(TestBed.inject(RoleGuard).canActivate(snapshot)).toBe(true);
  });
});

describe('Tab shells', () => {
  const shell = (path: string) => flatten(routes).find((r) => r.path === path && r.route.children)!.route;

  it('put the athlete tabs on an empty-path parent', async () => {
    expect(await shell('').loadComponent!()).toBe(AthleteTabsPage);
    expect(shell('').children!.map((r) => r.path)).toEqual(
      jasmine.arrayContaining(['today', 'programs', 'programs/active', 'history', 'profile']),
    );
  });

  it('put the coach tabs under /coach', async () => {
    expect(await shell('coach').loadComponent!()).toBe(CoachTabsPage);
    expect(shell('coach').children!.map((r) => r.path)).toEqual(
      jasmine.arrayContaining(['clients', 'clients/:clientId/workouts', 'profile']),
    );
  });
});

describe('Check your email route', () => {
  const route = () => flatten(routes).find((r) => r.path === 'verify-email')!.route;

  it('loads the Check your email screen for signed-out visitors only', async () => {
    expect(await route().loadComponent!()).toBe(VerifyEmailPage);
    expect(route().canActivate).toEqual([SignedOutGuard]);
  });
});

describe('Reset password route', () => {
  const route = () => flatten(routes).find((r) => r.path === 'forgot-password')!.route;

  it('loads the Reset password screen for signed-out visitors only', async () => {
    expect(await route().loadComponent!()).toBe(ForgotPasswordPage);
    expect(route().canActivate).toEqual([SignedOutGuard]);
  });
});

describe('App navigation', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideRouter(stubbed(routes))],
    });
  });

  afterEach(() => localStorage.removeItem('token'));

  /** Final URL and whether a tab bar is shown */
  async function open(role: 'COACH' | 'CLIENT', url: string) {
    TestBed.inject(AuthService).setSession(fakeToken(role));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await harness.fixture.whenStable();
    return {
      url: TestBed.inject(Router).url,
      tabs: !!harness.fixture.nativeElement.querySelector('.stub-tab-bar'),
    };
  }

  const cases: [role: 'COACH' | 'CLIENT', from: string, to: string, tabs: boolean][] = [
    // Athlete tabs and the screens pushed inside them
    ['CLIENT', '/today', '/today', true],
    ['CLIENT', '/programs', '/programs', true],
    ['CLIENT', '/programs/active', '/programs/active', true],
    ['CLIENT', '/history', '/history', true],
    ['CLIENT', '/profile', '/profile', true],
    ['CLIENT', '/history/lifts/ex1', '/history/lifts/ex1', true],
    // Full-screen athlete routes
    ['CLIENT', '/workout-logger', '/workout-logger', false],
    ['CLIENT', '/programs/p1', '/programs/p1', false],
    // Old URLs
    ['CLIENT', '/dashboard', '/today', true],
    ['CLIENT', '/stats', '/history', true],
    ['CLIENT', '/coach/dashboard', '/today', true],
    ['CLIENT', '/coach/clients', '/today', true],
    // Coach tabs and pushed screens
    ['COACH', '/coach', '/coach/clients', true],
    ['COACH', '/coach/clients', '/coach/clients', true],
    ['COACH', '/coach/clients/c1/workouts', '/coach/clients/c1/workouts', true],
    ['COACH', '/coach/profile', '/coach/profile', true],
    // Full-screen coach routes
    ['COACH', '/coach/workouts/w1', '/coach/workouts/w1', false],
    ['COACH', '/coach/clients/c1/workouts/new', '/coach/clients/c1/workouts/new', false],
    // Old URLs and athlete screens (D2)
    ['COACH', '/coach/dashboard', '/coach/clients', true],
    ['COACH', '/dashboard', '/coach/clients', true],
    ['COACH', '/today', '/coach/clients', true],
    ['COACH', '/stats', '/coach/clients', true],
    ['COACH', '/history', '/coach/clients', true],
    ['COACH', '/history/lifts/ex1', '/coach/clients', true],
    ['COACH', '/workout-logger', '/coach/clients', true],
    ['COACH', '/programs', '/coach/clients', true],
    ['COACH', '/programs/active', '/coach/clients', true],
    ['COACH', '/programs/p1', '/coach/clients', true],
    ['COACH', '/profile', '/coach/profile', true],
  ];

  for (const [role, from, to, tabs] of cases) {
    it(`takes a ${role} from ${from} to ${to}${tabs ? '' : ' without a tab bar'}`, async () => {
      expect(await open(role, from)).toEqual({ url: to, tabs });
    });
  }

  // A cold start opens the root URL; a valid stored token skips Login
  for (const [role, from, to] of [
    ['CLIENT', '/', '/today'],
    ['CLIENT', '/login', '/today'],
    ['COACH', '/', '/coach/clients'],
    ['COACH', '/login', '/coach/clients'],
  ] as const) {
    it(`takes a signed-in ${role} from ${from} to ${to}`, async () => {
      expect((await open(role, from)).url).toBe(to);
    });
  }

  it('shows Login for an expired token and clears it', async () => {
    const exp = Math.floor(Date.now() / 1000) - 60;
    TestBed.inject(AuthService).setSession(fakeToken('CLIENT', { exp }));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/login');
    await harness.navigateByUrl('/today');
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(localStorage.getItem('token')).toBeNull();
    expect(TestBed.inject(AuthService).isAuthenticated()).toBeFalse();
  });

  it('keeps a token that has not expired yet', async () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    TestBed.inject(AuthService).setSession(fakeToken('CLIENT', { exp }));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/today');
  });

  it('shows Login at the root URL when signed out', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('opens Check your email for a signed-out visitor, keeping the address', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/verify-email?email=a%40b.io');
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/verify-email?email=a@b.io');
  });

  it('takes a signed-in user from Check your email to their tab', async () => {
    expect((await open('COACH', '/verify-email?email=a%40b.io')).url).toBe('/coach/clients');
  });

  it('opens Reset password for a signed-out visitor, keeping the address', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/forgot-password?email=a%40b.io');
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/forgot-password?email=a@b.io');
  });

  it('takes a signed-in user from Reset password to their tab', async () => {
    expect((await open('CLIENT', '/forgot-password')).url).toBe('/today');
  });

  it('sends a signed-out visitor to /login', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/today');
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/login');
  });
});
