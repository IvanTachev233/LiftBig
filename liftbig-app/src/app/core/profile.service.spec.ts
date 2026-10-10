import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from '../../environments/environment';
import { Profile, ProfileService } from './profile.service';
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
});
