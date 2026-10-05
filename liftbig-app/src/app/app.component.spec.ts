import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router, RouterLink } from '@angular/router';

import { AppComponent } from './app.component';
import { AuthService } from './core/auth.service';
import { fakeToken } from './core/auth.testing';

@Component({ template: '' })
class StubPage {}

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AppComponent],
      imports: [RouterLink],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'dashboard', component: StubPage },
          { path: 'coach/dashboard', component: StubPage },
        ]),
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

  describe('menu Dashboard item', () => {
    async function clickDashboard(role: 'COACH' | 'CLIENT') {
      TestBed.inject(AuthService).setSession(fakeToken(role));
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();

      const item: HTMLElement = Array.from<HTMLElement>(
        fixture.nativeElement.querySelectorAll('ion-item'),
      ).find((el) => el.textContent?.trim() === 'Dashboard')!;
      expect(item.closest('ion-menu-toggle')).toBeTruthy();
      expect(item.getAttribute('routerDirection')).toBe('root');

      item.click();
      await fixture.whenStable();
      return TestBed.inject(Router).url;
    }

    it('navigates a COACH to /coach/dashboard', async () => {
      expect(await clickDashboard('COACH')).toBe('/coach/dashboard');
    });

    it('navigates a CLIENT to /dashboard', async () => {
      expect(await clickDashboard('CLIENT')).toBe('/dashboard');
    });
  });
});
