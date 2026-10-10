import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { environment } from '../../../environments/environment';
import { AuthService, User } from '../../core/auth.service';
import { fakeToken } from '../../core/auth.testing';
import { THEME_KEY } from '../../core/theme.service';
import { WeightUnitService } from '../../core/weight-unit.service';
import { ProfilePage } from './profile.page';

describe('ProfilePage', () => {
  let fixture: ComponentFixture<ProfilePage>;
  let component: ProfilePage;
  let http: HttpTestingController;
  let toastCtrl: jasmine.SpyObj<ToastController>;
  const url = `${environment.apiUrl}/users/me`;
  const profile = {
    id: 'u1',
    email: 'una@x.io',
    name: 'Una',
    role: 'CLIENT',
    weightUnit: 'kg',
  };

  beforeEach(() => {
    toastCtrl = jasmine.createSpyObj('ToastController', ['create']);
    toastCtrl.create.and.resolveTo({ present: () => Promise.resolve() } as any);
    TestBed.configureTestingModule({
      imports: [ProfilePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ToastController, useValue: toastCtrl },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProfilePage);
    component = fixture.componentInstance;
    component.ionViewWillEnter();
    http.expectOne(url).flush(profile);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('token');
    localStorage.removeItem(THEME_KEY);
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('ion-palette-dark');
  });

  const text = (selector: string) =>
    (fixture.nativeElement.querySelector(selector) as HTMLElement).textContent!.trim();

  it('shows the name and email read-only', () => {
    expect(text('.profile-name')).toBe('Una');
    expect(text('.profile-email')).toBe('una@x.io');
    expect(fixture.nativeElement.querySelector('ion-input')).toBeNull();
  });

  it('saves a new unit and applies it', () => {
    component.changeUnit('lb');
    const req = http.expectOne(url);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ weightUnit: 'lb' });
    req.flush({ ...profile, weightUnit: 'lb' });
    expect(TestBed.inject(WeightUnitService).unit()).toBe('lb');
    expect(component.unit).toBe('lb');
  });

  it('reverts the toggle and shows a toast when saving fails', async () => {
    component.changeUnit('lb');
    http.expectOne(url).flush('', { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(component.unit).toBe('kg');
    expect(TestBed.inject(WeightUnitService).unit()).toBe('kg');
    expect(toastCtrl.create).toHaveBeenCalled();
  });

  it('shows the current theme and stores a new one', () => {
    const segment = fixture.nativeElement.querySelector(
      'ion-segment[aria-labelledby="theme-label"]',
    ) as HTMLIonSegmentElement;
    expect(segment.value).toBe('dark');

    segment.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'light' } }));
    fixture.detectChanges();

    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(segment.value).toBe('light');
  });

  describe('Log out', () => {
    it('signs out and goes to /login', () => {
      TestBed.inject(AuthService).setSession(fakeToken('CLIENT'));
      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      fixture.detectChanges();

      const item = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('ion-item')).find(
        (el) => el.textContent?.trim() === 'Logout',
      )!;
      item.click();

      expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
      expect(localStorage.getItem('token')).toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('Join a Coach', () => {
    const card = () => fixture.nativeElement.querySelector('.invite-card') as HTMLElement | null;
    const signIn = (role: User['role']) => {
      TestBed.inject(AuthService).setSession(fakeToken(role));
      fixture.detectChanges();
    };

    it('is offered to a client without a coach', () => {
      signIn('CLIENT');
      expect(card()?.textContent).toContain('Join a Coach');
    });

    it('is not offered to a coach', () => {
      signIn('COACH');
      expect(card()).toBeNull();
    });

    it('accepts an invite code and clears the field', async () => {
      signIn('CLIENT');
      component.inviteToken = 'token-1';
      component.acceptInvite();
      const req = http.expectOne(`${environment.apiUrl}/auth/invites/token-1/accept`);
      expect(req.request.method).toBe('POST');
      req.flush({ user: {}, access_token: '' });
      await fixture.whenStable();

      expect(component.inviteToken).toBe('');
      expect(toastCtrl.create).toHaveBeenCalledWith(jasmine.objectContaining({ color: 'success' }));
    });

    it('shows the error and keeps the code when the invite is rejected', async () => {
      signIn('CLIENT');
      component.inviteToken = 'bad';
      component.acceptInvite();
      http
        .expectOne(`${environment.apiUrl}/auth/invites/bad/accept`)
        .flush({ message: 'Invite expired' }, { status: 400, statusText: 'Bad Request' });
      await fixture.whenStable();

      expect(component.inviteToken).toBe('bad');
      expect(toastCtrl.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ message: 'Invite expired', color: 'danger' }),
      );
    });
  });
});
