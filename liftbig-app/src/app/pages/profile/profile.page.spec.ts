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
import { RestTimeService } from '../../core/rest-time';
import { THEME_KEY } from '../../core/theme.service';
import { WeightUnitService } from '../../core/weight-unit.service';
import { BottomSheetService } from '../../shared/ui/bottom-sheet.service';
import { ProfilePage } from './profile.page';
import { RestTimerSheetComponent } from './rest-timer-sheet.component';

describe('ProfilePage', () => {
  let fixture: ComponentFixture<ProfilePage>;
  let component: ProfilePage;
  let http: HttpTestingController;
  let toastCtrl: jasmine.SpyObj<ToastController>;
  let sheet: jasmine.SpyObj<BottomSheetService>;
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
    sheet = jasmine.createSpyObj('BottomSheetService', ['open']);
    TestBed.configureTestingModule({
      imports: [ProfilePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ToastController, useValue: toastCtrl },
        { provide: BottomSheetService, useValue: sheet },
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

      const item = fixture.nativeElement.querySelector('.logout-btn') as HTMLElement;
      expect(item.textContent!.trim()).toBe('Log out');
      expect(item.classList).toContain('danger');
      item.click();

      expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
      expect(localStorage.getItem('token')).toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('Coach connection', () => {
    const card = () => fixture.nativeElement.querySelector('.coach-card') as HTMLElement | null;
    const signIn = (role: User['role']) => {
      TestBed.inject(AuthService).setSession(fakeToken(role));
      fixture.detectChanges();
    };

    it('offers Connect to a client without a coach', () => {
      signIn('CLIENT');
      expect(card()?.querySelector('.coach-title')?.textContent?.trim()).toBe('No coach connected');
      expect(card()?.querySelector('.connect-btn')?.textContent?.trim()).toBe('Connect');
    });

    it('shows a connected coach without the Connect button', () => {
      TestBed.inject(AuthService).setSession(fakeToken('CLIENT', { coachId: 'coach-1' }));
      fixture.detectChanges();
      expect(card()?.querySelector('.coach-title')?.textContent?.trim()).toBe('Coach connected');
      expect(card()?.querySelector('.connect-btn')).toBeNull();
    });

    it('is not offered to a coach', () => {
      signIn('COACH');
      expect(card()).toBeNull();
    });

    it('Connect opens the invite code sheet and accepts the code it returns', async () => {
      signIn('CLIENT');
      sheet.open.and.resolveTo({ data: 'token-9', role: 'confirm' });
      (card()!.querySelector('.connect-btn') as HTMLElement).click();
      await fixture.whenStable();

      const [, options] = sheet.open.calls.mostRecent().args;
      expect(options).toEqual({ label: 'Connect a coach', props: { code: '' } });
      const req = http.expectOne(`${environment.apiUrl}/auth/invites/token-9/accept`);
      expect(req.request.method).toBe('POST');
      req.flush({ user: {}, access_token: fakeToken('CLIENT', { coachId: 'coach-1' }) });
      fixture.detectChanges();
      expect(card()?.querySelector('.coach-title')?.textContent?.trim()).toBe('Coach connected');
    });

    it('closing the sheet accepts nothing', async () => {
      signIn('CLIENT');
      sheet.open.and.resolveTo({ role: 'cancel' });
      await component.openConnect();
      http.expectNone(`${environment.apiUrl}/auth/invites/undefined/accept`);
      expect(component.inviteToken).toBe('');
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

  describe('Default rest timer', () => {
    const row = () => fixture.nativeElement.querySelector('.rest-row') as HTMLElement | null;
    const rest = () => TestBed.inject(RestTimeService);
    const signIn = (role: User['role']) => {
      TestBed.inject(AuthService).setSession(fakeToken(role));
      fixture.detectChanges();
    };

    it('shows a client the default, 2:00 when the API sends none', () => {
      signIn('CLIENT');
      expect(row()?.querySelector('.setting-label')?.textContent?.trim()).toBe('Default rest timer');
      expect(row()?.querySelector('.rest-value')?.textContent?.trim()).toBe('2:00');
    });

    it('shows the stored time, and Off for 0', () => {
      signIn('CLIENT');
      rest().set(90);
      fixture.detectChanges();
      expect(row()?.querySelector('.rest-value')?.textContent?.trim()).toBe('1:30');
      rest().set(0);
      fixture.detectChanges();
      expect(row()?.querySelector('.rest-value')?.textContent?.trim()).toBe('Off');
    });

    it('is not offered to a coach', () => {
      signIn('COACH');
      expect(row()).toBeNull();
    });

    it('opens the sheet with the current time and saves the one picked', async () => {
      signIn('CLIENT');
      sheet.open.and.resolveTo({ data: 90, role: 'confirm' });
      row()!.click();
      await fixture.whenStable();

      const [component, options] = sheet.open.calls.mostRecent().args;
      expect(component).toBe(RestTimerSheetComponent);
      expect(options).toEqual({ label: 'Default rest timer', props: { seconds: 120 } });
      const req = http.expectOne(url);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ restSeconds: 90 });
      fixture.detectChanges();
      expect(row()?.querySelector('.rest-value')?.textContent?.trim()).toBe('1:30');
      req.flush({ ...profile, restSeconds: 90 });
      expect(rest().seconds()).toBe(90);
    });

    it('saves nothing when the sheet is closed or the time is unchanged', async () => {
      signIn('CLIENT');
      sheet.open.and.resolveTo({ role: 'cancel' });
      await component.openRestTimer();
      sheet.open.and.resolveTo({ data: 120, role: 'confirm' });
      await component.openRestTimer();
      http.expectNone(url);
      expect(rest().seconds()).toBe(120);
    });

    it('puts the old time back and shows a toast when saving fails', async () => {
      signIn('CLIENT');
      sheet.open.and.resolveTo({ data: 0, role: 'confirm' });
      await component.openRestTimer();
      http.expectOne(url).flush('', { status: 500, statusText: 'Error' });
      await fixture.whenStable();
      expect(rest().seconds()).toBe(120);
      expect(toastCtrl.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ message: "Couldn't save the rest timer" }),
      );
    });
  });

  describe('layout', () => {
    it('shows initials from the name, or the email without one', () => {
      expect(text('.avatar')).toBe('U');
      component.profile = { ...component.profile!, name: 'Alex Rivera' };
      fixture.detectChanges();
      expect(text('.avatar')).toBe('AR');
      component.profile = { ...component.profile!, name: null };
      fixture.detectChanges();
      expect(text('.avatar')).toBe('U');
      expect(text('.profile-name')).toBe('una@x.io');
    });

    it('hides Edit and Change password until they exist', () => {
      expect(fixture.nativeElement.textContent).not.toContain('Edit');
      expect(fixture.nativeElement.textContent).not.toContain('Change password');
    });

    it('My 1RMs opens the Lifts view of History for a client', () => {
      TestBed.inject(AuthService).setSession(fakeToken('CLIENT'));
      fixture.detectChanges();
      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      (fixture.nativeElement.querySelector('.my-1rms') as HTMLElement).click();
      expect(navigate).toHaveBeenCalledWith(['/history'], { queryParams: { view: 'lifts' } });
    });

    it('shows a coach neither the coach card nor My 1RMs', () => {
      TestBed.inject(AuthService).setSession(fakeToken('COACH'));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.coach-card')).toBeNull();
      expect(fixture.nativeElement.querySelector('.my-1rms')).toBeNull();
      expect(fixture.nativeElement.querySelector('.logout-btn')).toBeTruthy();
    });
  });
});
