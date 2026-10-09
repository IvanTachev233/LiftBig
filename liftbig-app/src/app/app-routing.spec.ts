import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app-routing.module';
import { AuthService } from './core/auth.service';
import { fakeToken } from './core/auth.testing';
import { RoleGuard } from './core/role.guard';

describe('Premade Programs routes', () => {
  afterEach(() => localStorage.removeItem('token'));

  const programRoutes = routes.filter((r) => r.path?.startsWith('programs'));

  it('are CLIENT-only', () => {
    expect(programRoutes.map((r) => r.path)).toEqual([
      'programs',
      'programs/active',
      'programs/:id',
    ]);
    for (const route of programRoutes) {
      expect(route.canActivate).toContain(RoleGuard);
      expect(route.data).toEqual({ role: 'CLIENT' });
    }
  });

  it('redirect a COACH to their dashboard', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideRouter([])],
    });
    TestBed.inject(AuthService).setSession(fakeToken('COACH'));
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    const snapshot = { data: { role: 'CLIENT' } } as unknown as ActivatedRouteSnapshot;

    const allowed = TestBed.inject(RoleGuard).canActivate(snapshot);

    expect(allowed).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/coach/dashboard', undefined);
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
