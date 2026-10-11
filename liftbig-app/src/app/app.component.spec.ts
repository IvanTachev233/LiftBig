import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';

import { AppComponent } from './app.component';
import { AuthService } from './core/auth.service';
import { fakeToken } from './core/auth.testing';
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
});
