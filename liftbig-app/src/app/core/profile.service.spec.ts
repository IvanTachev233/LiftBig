import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { fakeToken } from './auth.testing';
import { Profile, ProfileService } from './profile.service';
import { RestTimeService } from './rest-time';
import { WeightUnitService } from './weight-unit.service';

describe('ProfileService', () => {
  let service: ProfileService;
  let units: WeightUnitService;
  let http: HttpTestingController;
  const url = `${environment.apiUrl}/users/me`;
  const profile: Profile = {
    id: 'u1',
    email: 'u@x.io',
    name: 'Una',
    role: 'CLIENT',
    weightUnit: 'lb',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProfileService);
    units = TestBed.inject(WeightUnitService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads /users/me and applies its unit', () => {
    let loaded: Profile | undefined;
    service.getMe().subscribe((p) => (loaded = p));
    http.expectOne(url).flush(profile);
    expect(loaded).toEqual(profile);
    expect(units.unit()).toBe('lb');
  });

  it('saves the unit with PATCH /users/me and applies the answer', () => {
    service.updateWeightUnit('lb').subscribe();
    const req = http.expectOne(url);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ weightUnit: 'lb' });
    req.flush(profile);
    expect(units.unit()).toBe('lb');
  });

  it('keeps the current unit when loading fails', () => {
    service.load();
    http.expectOne(url).flush('', { status: 500, statusText: 'Error' });
    expect(units.unit()).toBe('kg');
  });

  describe('rest time', () => {
    it('applies the rest time from /users/me', () => {
      service.getMe().subscribe();
      http.expectOne(url).flush({ ...profile, restSeconds: 90 });
      expect(TestBed.inject(RestTimeService).seconds()).toBe(90);
    });

    it('uses 120 s when the API sends no rest time', () => {
      const rest = TestBed.inject(RestTimeService);
      rest.set(45);
      service.getMe().subscribe();
      http.expectOne(url).flush(profile);
      expect(rest.seconds()).toBe(120);
    });

    it('saves the rest time alone with PATCH /users/me and applies the answer', () => {
      service.updateRestSeconds(0).subscribe();
      const req = http.expectOne(url);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ restSeconds: 0 });
      req.flush({ ...profile, restSeconds: 0 });
      expect(TestBed.inject(RestTimeService).seconds()).toBe(0);
      expect(units.unit()).toBe('lb');
    });
  });

  describe('account', () => {
    it('saves the name alone with PATCH /users/me and applies the answer', () => {
      let saved: Profile | undefined;
      service.updateName('Una Lifter').subscribe((p) => (saved = p));
      const req = http.expectOne(url);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ name: 'Una Lifter' });
      req.flush({ ...profile, name: 'Una Lifter', restSeconds: 60 });
      expect(saved?.name).toBe('Una Lifter');
      expect(TestBed.inject(RestTimeService).seconds()).toBe(60);
    });

    it('changes the password with POST /users/me/password and keeps this device signed in', () => {
      let done = false;
      service.changePassword('old-secret', 'new-secret').subscribe(() => (done = true));
      const req = http.expectOne(`${url}/password`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        currentPassword: 'old-secret',
        newPassword: 'new-secret',
      });
      const token = fakeToken('CLIENT', { id: 'u1' });
      req.flush({ access_token: token, refresh_token: 'r1' });
      expect(done).toBeTrue();
      expect(TestBed.inject(AuthService).getToken()).toBe(token);
      expect(localStorage.getItem('access_token')).toBe(token);
      expect(localStorage.getItem('refresh_token')).toBe('r1');
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    });

    it('deletes the account with DELETE /users/me and the password in the body', () => {
      let done = false;
      service.deleteAccount('my-secret').subscribe(() => (done = true));
      const req = http.expectOne(url);
      expect(req.request.method).toBe('DELETE');
      expect(req.request.body).toEqual({ password: 'my-secret' });
      req.flush(null, { status: 204, statusText: 'No Content' });
      expect(done).toBeTrue();
    });
  });
});
