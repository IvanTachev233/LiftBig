import { fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { environment } from '../../environments/environment';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { fakeToken } from './auth.testing';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let auth: AuthService;
  let navigate: jasmine.Spy;
  const api = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    auth.setSession(fakeToken('CLIENT'));
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.removeItem('token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  });

  const fail = (url: string, status: number) => {
    http.get(url).subscribe({ error: () => undefined });
    httpMock.expectOne(url).flush({}, { status, statusText: 'Error' });
  };

  it('sends the token', () => {
    http.get(`${api}/workouts`).subscribe();
    const req = httpMock.expectOne(`${api}/workouts`);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${auth.getToken()}`);
    req.flush([]);
  });

  it('signs out on a 401 from the API (expired or revoked token)', () => {
    fail(`${api}/workouts`, 401);
    expect(auth.isAuthenticated()).toBeFalse();
    expect(localStorage.getItem('token')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('keeps the session for a 401 from login or sign-up and for a 403', () => {
    fail(`${api}/auth/login`, 401);
    fail(`${api}/auth/register`, 401);
    fail(`${api}/users/me/password`, 403);
    expect(auth.isAuthenticated()).toBeTrue();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores a 401 from another host', () => {
    fail('https://example.com/data', 401);
    expect(auth.isAuthenticated()).toBeTrue();
  });

  describe('with a refresh token', () => {
    const fresh = fakeToken('CLIENT', { name: 'fresh' });
    const refreshUrl = `${api}/auth/refresh`;
    let alertCreate: jasmine.Spy;
    let errors: HttpErrorResponse[];

    const get = (url = `${api}/workouts`) =>
      http.get(url).subscribe({ error: (e: HttpErrorResponse) => errors.push(e) });
    const unauthorized = { status: 401, statusText: 'Unauthorized' };
    // Answers 401 to every pending request still sent with the old token
    const deny = (url = `${api}/workouts`) =>
      httpMock
        .match((r) => r.url === url && r.headers.get('Authorization') !== `Bearer ${fresh}`)
        .forEach((r) => r.flush({}, unauthorized));
    const expectRefresh = () => {
      const req = httpMock.expectOne(refreshUrl);
      expect(req.request.body).toEqual({ refresh_token: 'r1' });
      return req;
    };

    beforeEach(() => {
      errors = [];
      auth.setSession(fakeToken('CLIENT'), 'r1');
      alertCreate = spyOn(TestBed.inject(AlertController), 'create').and.resolveTo({
        present: () => Promise.resolve(),
        onDidDismiss: () => Promise.resolve({}),
      } as unknown as HTMLIonAlertElement);
    });

    it('shares one refresh between parallel 401s and retries each once with the new token', () => {
      get();
      get();
      get();
      deny();
      expectRefresh().flush({ access_token: fresh, refresh_token: 'r2' });
      const retries = httpMock.match(`${api}/workouts`);
      expect(retries.length).toBe(3);
      retries.forEach((r) => {
        expect(r.request.headers.get('Authorization')).toBe(`Bearer ${fresh}`);
        r.flush([]);
      });
      expect(errors).toEqual([]);
      expect(auth.getToken()).toBe(fresh);
      expect(localStorage.getItem('refresh_token')).toBe('r2');
    });

    it('retries with the new token, without refreshing again, when a 401 arrives after a refresh', () => {
      get();
      get();
      const [first, second] = httpMock.match(`${api}/workouts`);
      first.flush({}, unauthorized);
      expectRefresh().flush({ access_token: fresh, refresh_token: 'r2' });
      httpMock.expectOne(`${api}/workouts`).flush([]);
      second.flush({}, unauthorized);
      httpMock.expectNone(refreshUrl);
      const retry = httpMock.expectOne(`${api}/workouts`);
      expect(retry.request.headers.get('Authorization')).toBe(`Bearer ${fresh}`);
      retry.flush([]);
      expect(errors).toEqual([]);
    });

    it('passes a second 401 from the retry through, with no second refresh', () => {
      get();
      deny();
      expectRefresh().flush({ access_token: fresh, refresh_token: 'r2' });
      httpMock.expectOne(`${api}/workouts`).flush({}, unauthorized);
      httpMock.expectNone(refreshUrl);
      expect(errors.map((e) => e.status)).toEqual([401]);
      expect(auth.hasSession()).toBeTrue();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('stays signed in and passes the error through when the refresh hits a network error', () => {
      get();
      deny();
      expectRefresh().error(new ProgressEvent('offline'));
      expect(errors.map((e) => e.status)).toEqual([0]);
      expect(auth.hasSession()).toBeTrue();
      expect(localStorage.getItem('refresh_token')).toBe('r1');
      expect(navigate).not.toHaveBeenCalled();
      expect(alertCreate).not.toHaveBeenCalled();
    });

    it('stays signed in and passes the error through when the refresh answers 5xx', () => {
      get();
      deny();
      expectRefresh().flush({}, { status: 503, statusText: 'Unavailable' });
      expect(errors.map((e) => e.status)).toEqual([503]);
      expect(auth.hasSession()).toBeTrue();
      expect(localStorage.getItem('refresh_token')).toBe('r1');
      expect(navigate).not.toHaveBeenCalled();
      expect(alertCreate).not.toHaveBeenCalled();
    });

    it('stays signed in on a 5xx from a request, without refreshing', () => {
      get();
      httpMock.expectOne(`${api}/workouts`).flush({}, { status: 500, statusText: 'Error' });
      httpMock.expectNone(refreshUrl);
      expect(errors.map((e) => e.status)).toEqual([500]);
      expect(auth.hasSession()).toBeTrue();
    });

    it('ends the session on a 401 from refresh: alert, then Login with the email filled in', fakeAsync(() => {
      get();
      deny();
      expectRefresh().flush({}, unauthorized);
      flushMicrotasks();
      expect(errors.map((e) => e.status)).toEqual([401]);
      expect(auth.hasSession()).toBeFalse();
      expect(localStorage.getItem('refresh_token')).toBeNull();
      expect(alertCreate).toHaveBeenCalledTimes(1);
      expect(alertCreate).toHaveBeenCalledWith(
        jasmine.objectContaining({ header: 'Your session ended', buttons: ['Log in again'], backdropDismiss: false }),
      );
      expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { email: 'u@x.io' }, replaceUrl: true });
      // The API has already ended the session, so there's nothing to log out of
      httpMock.expectNone(`${api}/auth/logout`);
    }));

    it('leaves 401s from the sign-in and account recovery endpoints alone', () => {
      for (const path of ['login', 'register', 'verify-email', 'resend-verification', 'forgot-password', 'reset-password', 'logout']) {
        get(`${api}/auth/${path}`);
        httpMock.expectOne(`${api}/auth/${path}`).flush({}, unauthorized);
      }
      httpMock.expectNone(refreshUrl);
      expect(errors.length).toBe(7);
      expect(auth.hasSession()).toBeTrue();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('treats a sign-in URL with a query string as a sign-in URL', () => {
      get(`${api}/auth/login?source=app`);
      httpMock.expectOne(`${api}/auth/login?source=app`).flush({}, unauthorized);
      httpMock.expectNone(refreshUrl);
      expect(errors.map((e) => e.status)).toEqual([401]);
      expect(auth.hasSession()).toBeTrue();
    });

    it('still refreshes for an API URL that only starts like a sign-in URL', () => {
      get(`${api}/auth/logout-all`);
      deny(`${api}/auth/logout-all`);
      expectRefresh().flush({ access_token: fresh, refresh_token: 'r2' });
      httpMock.expectOne(`${api}/auth/logout-all`).flush(null);
      expect(errors).toEqual([]);
    });

    it("doesn't send a request waiting on a refresh once the user has logged out", () => {
      get();
      deny();
      const refresh = expectRefresh();
      auth.logout();
      httpMock.expectOne(`${api}/auth/logout`).flush(null, { status: 204, statusText: 'No Content' });
      refresh.flush({ access_token: fresh, refresh_token: 'r2' });
      httpMock.expectNone(`${api}/workouts`);
      expect(errors.map((e) => e.status)).toEqual([401]);
      expect(auth.hasSession()).toBeFalse();
    });

    it("doesn't send a request waiting on an early refresh once the user has logged out", () => {
      auth.setSession(fakeToken('CLIENT', { exp: Math.floor(Date.now() / 1000) + 20 }), 'r1');
      let failed = false;
      http.get(`${api}/workouts`).subscribe({ error: () => (failed = true) });
      const refresh = expectRefresh();
      auth.logout();
      httpMock.expectOne(`${api}/auth/logout`).flush(null, { status: 204, statusText: 'No Content' });
      refresh.flush({ access_token: fresh, refresh_token: 'r2' });
      httpMock.expectNone(`${api}/workouts`);
      expect(failed).toBeTrue();
    });

    it('shares one early refresh between requests sent together', () => {
      auth.setSession(fakeToken('CLIENT', { exp: Math.floor(Date.now() / 1000) + 20 }), 'r1');
      get();
      get();
      get();
      expectRefresh().flush({ access_token: fresh, refresh_token: 'r2' });
      const sent = httpMock.match(`${api}/workouts`);
      expect(sent.length).toBe(3);
      sent.forEach((r) => {
        expect(r.request.headers.get('Authorization')).toBe(`Bearer ${fresh}`);
        r.flush([]);
      });
      expect(errors).toEqual([]);
    });

    it('refreshes before sending when the access token expires within 30 seconds', () => {
      auth.setSession(fakeToken('CLIENT', { exp: Math.floor(Date.now() / 1000) + 20 }), 'r1');
      get();
      httpMock.expectNone(`${api}/workouts`);
      expectRefresh().flush({ access_token: fresh, refresh_token: 'r2' });
      const req = httpMock.expectOne(`${api}/workouts`);
      expect(req.request.headers.get('Authorization')).toBe(`Bearer ${fresh}`);
      req.flush([]);
      expect(errors).toEqual([]);
    });

    it('refreshes before sending when there is no access token, only a refresh token', () => {
      auth.setSession('', 'r1');
      get();
      expectRefresh().flush({ access_token: fresh, refresh_token: 'r2' });
      const req = httpMock.expectOne(`${api}/workouts`);
      expect(req.request.headers.get('Authorization')).toBe(`Bearer ${fresh}`);
      req.flush([]);
    });

    it('sends without refreshing while the access token has more than 30 seconds left', () => {
      auth.setSession(fakeToken('CLIENT', { exp: Math.floor(Date.now() / 1000) + 60 }), 'r1');
      get();
      httpMock.expectNone(refreshUrl);
      httpMock.expectOne(`${api}/workouts`).flush([]);
    });

    it('sends with the current token when an early refresh fails on the network', () => {
      const expiring = fakeToken('CLIENT', { exp: Math.floor(Date.now() / 1000) + 20 });
      auth.setSession(expiring, 'r1');
      get();
      expectRefresh().error(new ProgressEvent('offline'));
      const req = httpMock.expectOne(`${api}/workouts`);
      expect(req.request.headers.get('Authorization')).toBe(`Bearer ${expiring}`);
      req.flush({}, unauthorized);
      httpMock.expectNone(refreshUrl);
      expect(errors.map((e) => e.status)).toEqual([401]);
      expect(auth.hasSession()).toBeTrue();
    });
  });
});
