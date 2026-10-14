import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
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
});
