import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { AppComponent } from './app.component';
import { AuthService } from './core/auth.service';
import { fakeToken } from './core/auth.testing';

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
});
