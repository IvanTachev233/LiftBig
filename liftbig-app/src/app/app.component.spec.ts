import { Component, CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';

import { AppComponent } from './app.component';
import { AgreementsService } from './core/agreements.service';
import { AGREED } from './core/agreements.testing';
import { AppUpdate, AppUpdateService } from './core/app-update.service';
import { AuthService } from './core/auth.service';
import { fakeToken } from './core/auth.testing';
import { OUTBOX_PLATFORM, OutboxService } from './core/outbox.service';
import { FakeOutboxPlatform } from './core/outbox.testing';
import { RestTimeService } from './core/rest-time';
import { WeightUnitService } from './core/weight-unit.service';
import { environment } from '../environments/environment';

@Component({ template: '' })
class StubPage {}

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AppComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'today', component: StubPage }]),
      ],
    }).compileComponents();
  });

  afterEach(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('renders no side menu', () => {
    TestBed.inject(AuthService).setSession(fakeToken('CLIENT'));
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('ion-menu')).toBeNull();
    expect(fixture.nativeElement.querySelector('ion-router-outlet')).toBeTruthy();
  });

  it('makes the pages unreachable while Update LiftBig is shown', () => {
    const state = signal<AppUpdate>('required');
    TestBed.overrideProvider(AppUpdateService, { useValue: { state } });
    const fixture = TestBed.createComponent(AppComponent);
    const outlet = () => fixture.nativeElement.querySelector('ion-router-outlet') as HTMLElement;
    fixture.detectChanges();
    expect(outlet().hasAttribute('inert')).toBeTrue();
    expect(fixture.nativeElement.querySelector('app-update-screen')).toBeTruthy();

    state.set('none');
    fixture.detectChanges();
    expect(outlet().hasAttribute('inert')).toBeFalse();
  });

  it('applies the signed-in user\'s unit and rest time, and resets both on sign-out', () => {
    TestBed.inject(AuthService).setSession(fakeToken('CLIENT'));
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne(`${environment.apiUrl}/users/me`)
      .flush({ id: 'u1', email: 'u@x.io', name: null, role: 'CLIENT', weightUnit: 'lb', restSeconds: 45 });
    const units = TestBed.inject(WeightUnitService);
    const rest = TestBed.inject(RestTimeService);
    expect(units.unit()).toBe('lb');
    expect(rest.seconds()).toBe(45);

    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    TestBed.inject(AuthService).logout();
    fixture.detectChanges();
    expect(units.unit()).toBe('kg');
    expect(rest.seconds()).toBe(120);
  });

  describe('We\'ve updated our terms', () => {
    const me = `${environment.apiUrl}/users/me`;
    const profile = { id: 'u1', email: 'u@x.io', name: null, role: 'CLIENT', weightUnit: 'kg' };
    const pendingAll = { ...AGREED, needsAcceptance: ['terms', 'privacy', 'health_data'] };

    const start = () => {
      TestBed.inject(AuthService).setSession(fakeToken('CLIENT', { id: 'u1' }), 'r1');
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      return fixture;
    };
    const outlet = (fixture: ReturnType<typeof start>) =>
      fixture.nativeElement.querySelector('ion-router-outlet') as HTMLElement;

    it('covers the pages while the payload lists something to accept, and goes once accepted', () => {
      const fixture = start();
      TestBed.inject(HttpTestingController).expectOne(me).flush({ ...profile, ...pendingAll });
      fixture.detectChanges();
      expect(fixture.componentInstance.termsShown()).toBeTrue();
      expect(outlet(fixture).hasAttribute('inert')).toBeTrue();
      expect(fixture.nativeElement.querySelector('app-terms-update-screen')).toBeTruthy();

      TestBed.inject(AgreementsService).apply(AGREED);
      fixture.detectChanges();
      expect(fixture.componentInstance.termsShown()).toBeFalse();
      expect(outlet(fixture).hasAttribute('inert')).toBeFalse();
    });

    it('shows nothing for a user with nothing to accept', () => {
      const fixture = start();
      TestBed.inject(HttpTestingController).expectOne(me).flush({ ...profile, ...AGREED });
      fixture.detectChanges();
      expect(fixture.componentInstance.termsShown()).toBeFalse();
    });

    it('goes on sign-out', () => {
      const fixture = start();
      TestBed.inject(HttpTestingController).expectOne(me).flush({ ...profile, ...pendingAll });
      spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      TestBed.inject(AuthService).logout();
      fixture.detectChanges();
      expect(fixture.componentInstance.termsShown()).toBeFalse();
      expect(TestBed.inject(AgreementsService).status()).toBeNull();
    });

    it('offline at start opens the app as usual and leaves waiting changes queued; the next online start asks', async () => {
      const platform = new FakeOutboxPlatform();
      TestBed.overrideProvider(OUTBOX_PLATFORM, { useValue: platform });
      TestBed.inject(AuthService).setSession(fakeToken('CLIENT', { id: 'u1' }), 'r1');
      const outbox = TestBed.inject(OutboxService);
      await outbox.start();
      await outbox.enqueue({ method: 'PATCH', path: '/workouts/w1', body: {}, workoutId: 'w1', label: 'Leg day' });
      const http = TestBed.inject(HttpTestingController);
      http.match((r) => r.url.startsWith(`${environment.apiUrl}/workouts`));

      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      http.expectOne(me).flush(null, { status: 0, statusText: 'Offline' });
      fixture.detectChanges();
      expect(fixture.componentInstance.termsShown()).toBeFalse();
      expect(outlet(fixture).hasAttribute('inert')).toBeFalse();
      expect(outbox.countFor('u1')).toBe(1);

      // The next start, online
      TestBed.inject(AgreementsService).clear();
      fixture.componentInstance['profileService'].load();
      http.expectOne(me).flush({ ...profile, ...pendingAll });
      fixture.detectChanges();
      expect(fixture.componentInstance.termsShown()).toBeTrue();
      expect(outbox.countFor('u1')).toBe(1);
    });
  });
});
