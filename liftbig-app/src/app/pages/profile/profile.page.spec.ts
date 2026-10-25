import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { environment } from '../../../environments/environment';
import { AuthService, User } from '../../core/auth.service';
import { fakeToken } from '../../core/auth.testing';
import { OUTBOX_PLATFORM, OutboxService } from '../../core/outbox.service';
import { FakeOutboxPlatform } from '../../core/outbox.testing';
import { ReadCacheService } from '../../core/read-cache.service';
import { WorkoutCopyService } from '../../core/workout-copy.service';
import { RestTimeService } from '../../core/rest-time';
import { THEME_KEY } from '../../core/theme.service';
import { WeightUnitService } from '../../core/weight-unit.service';
import { BottomSheetService } from '../../shared/ui/bottom-sheet.service';
import { ProfilePage } from './profile.page';
import { RestTimerSheetComponent } from './rest-timer-sheet.component';
import { EditProfileSheetComponent } from './edit-profile-sheet.component';
import { ChangePasswordSheetComponent } from './change-password-sheet.component';
import { DeleteAccountSheetComponent } from './delete-account-sheet.component';

describe('ProfilePage', () => {
  let fixture: ComponentFixture<ProfilePage>;
  let component: ProfilePage;
  let http: HttpTestingController;
  let toastCtrl: jasmine.SpyObj<ToastController>;
  let sheet: jasmine.SpyObj<BottomSheetService>;
  let platform: FakeOutboxPlatform;
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
    platform = new FakeOutboxPlatform();
    TestBed.configureTestingModule({
      imports: [ProfilePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ToastController, useValue: toastCtrl },
        { provide: BottomSheetService, useValue: sheet },
        { provide: OUTBOX_PLATFORM, useValue: platform },
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
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
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

    describe('with changes waiting', () => {
      let alertCreate: jasmine.Spy;
      let navigate: jasmine.Spy;

      /** Two changes stored for u1 that can't be sent yet */
      async function queueTwo() {
        const outbox = TestBed.inject(OutboxService);
        await outbox.start();
        for (const n of [1, 2]) {
          await outbox.enqueue({ method: 'PATCH', path: '/workouts/w1', body: { n }, workoutId: 'w1', label: 'Leg day' });
        }
        await fixture.whenStable();
        http.match((r) => r.url.startsWith(`${environment.apiUrl}/workouts`));
      }

      function answerAlert(role: string) {
        alertCreate = spyOn(TestBed.inject(AlertController), 'create').and.resolveTo({
          present: () => Promise.resolve(),
          onDidDismiss: () => Promise.resolve({ role }),
        } as unknown as HTMLIonAlertElement);
      }

      beforeEach(async () => {
        TestBed.inject(AuthService).setSession(fakeToken('CLIENT', { id: 'u1' }));
        navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
        await queueTwo();
      });

      it('asks first, and Stay keeps the session', async () => {
        answerAlert('cancel');
        (fixture.nativeElement.querySelector('.logout-btn') as HTMLElement).click();
        await fixture.whenStable();

        expect(alertCreate).toHaveBeenCalledWith(
          jasmine.objectContaining({
            message: "2 changes haven't been saved yet. If you log out now they'll be lost.",
            buttons: [
              { text: 'Stay', role: 'cancel' },
              { text: 'Log out anyway', role: 'destructive' },
            ],
          }),
        );
        expect(TestBed.inject(AuthService).isAuthenticated()).toBeTrue();
        expect(navigate).not.toHaveBeenCalled();
      });

      it("Log out anyway signs out and leaves the changes stored for that user", async () => {
        answerAlert('destructive');
        (fixture.nativeElement.querySelector('.logout-btn') as HTMLElement).click();
        await fixture.whenStable();

        expect(TestBed.inject(AuthService).isAuthenticated()).toBeFalse();
        expect(navigate).toHaveBeenCalledWith(['/login']);
        expect(JSON.parse(platform.data.get('outbox.u1')!).length).toBe(2);
        expect(TestBed.inject(OutboxService).countFor('u1')).toBe(2);
      });
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

    it('offers Edit and Change password to both roles', () => {
      for (const role of ['CLIENT', 'COACH'] as const) {
        TestBed.inject(AuthService).setSession(fakeToken(role));
        fixture.detectChanges();
        expect(text('.edit-btn')).toBe('Edit');
        expect(text('.password-row .setting-label')).toBe('Change password');
      }
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

  describe('Privacy', () => {
    it('opens Profile → Privacy for both roles', () => {
      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      for (const role of ['CLIENT', 'COACH'] as const) {
        TestBed.inject(AuthService).setSession(fakeToken(role));
        fixture.detectChanges();
        const row = fixture.nativeElement.querySelector('#privacy-heading + .settings-group .privacy-row') as HTMLElement;
        expect(row.textContent!.trim()).toBe('Your choices, terms and data');
        navigate.calls.reset();
        row.click();
        expect(navigate).toHaveBeenCalledOnceWith(['/privacy']);
      }
    });
  });

  describe('Edit profile', () => {
    const edit = () => fixture.nativeElement.querySelector('.edit-btn') as HTMLElement;

    it('names the button for screen readers', () => {
      expect(edit().getAttribute('aria-label')).toBe('Edit name');
    });

    it('opens the sheet with the current name and saves the new one', async () => {
      sheet.open.and.resolveTo({ data: 'Una Lifter', role: 'confirm' });
      edit().click();
      await fixture.whenStable();

      const [sheetComponent, options] = sheet.open.calls.mostRecent().args;
      expect(sheetComponent).toBe(EditProfileSheetComponent);
      expect(options).toEqual({ label: 'Edit profile', props: { name: 'Una' } });
      const req = http.expectOne(url);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ name: 'Una Lifter' });
      fixture.detectChanges();
      expect(text('.profile-name')).toBe('Una Lifter');
      req.flush({ ...profile, name: 'Una Lifter' });
      fixture.detectChanges();
      expect(text('.profile-name')).toBe('Una Lifter');
      expect(text('.avatar')).toBe('UL');
    });

    it('starts from an empty field when there is no name', async () => {
      component.profile = { ...component.profile!, name: null };
      sheet.open.and.resolveTo({ role: 'cancel' });
      await component.openEdit();
      expect(sheet.open.calls.mostRecent().args[1]).toEqual({
        label: 'Edit profile',
        props: { name: '' },
      });
    });

    it('saves nothing when the sheet is closed', async () => {
      sheet.open.and.resolveTo({ role: 'cancel' });
      await component.openEdit();
      http.expectNone(url);
      expect(text('.profile-name')).toBe('Una');
    });

    it('puts the old name back and shows a toast when saving fails', async () => {
      sheet.open.and.resolveTo({ data: 'Una Lifter', role: 'confirm' });
      await component.openEdit();
      http.expectOne(url).flush('', { status: 500, statusText: 'Error' });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(text('.profile-name')).toBe('Una');
      expect(toastCtrl.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ message: "Couldn't save your name", color: 'danger' }),
      );
    });
  });

  describe('Change password', () => {
    const row = () => fixture.nativeElement.querySelector('.password-row') as HTMLElement;

    it('opens the password sheet and confirms a change with a toast', async () => {
      sheet.open.and.resolveTo({ data: true, role: 'confirm' });
      row().click();
      await fixture.whenStable();
      const [sheetComponent, options] = sheet.open.calls.mostRecent().args;
      expect(sheetComponent).toBe(ChangePasswordSheetComponent);
      expect(options).toEqual({ label: 'Change password' });
      expect(toastCtrl.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ message: 'Password changed', color: 'success' }),
      );
    });

    it('says nothing when the sheet is closed', async () => {
      sheet.open.and.resolveTo({ role: 'cancel' });
      await component.openChangePassword();
      expect(toastCtrl.create).not.toHaveBeenCalled();
    });

    it('sits above Log out', () => {
      const rows = Array.from<HTMLElement>(
        fixture.nativeElement.querySelectorAll('#account-heading + .settings-group > *'),
      );
      expect(rows.map((r) => r.classList.contains('password-row') ? 'password' : r.textContent!.trim()))
        .toEqual(['password', 'Log out', 'Delete account']);
    });
  });

  describe('Delete account', () => {
    const row = () => fixture.nativeElement.querySelector('.delete-account-row') as HTMLElement | null;
    const signIn = (role: User['role']) => {
      TestBed.inject(AuthService).setSession(fakeToken(role));
      fixture.detectChanges();
    };

    it('is offered to both roles below Log out in the danger colour', () => {
      for (const role of ['CLIENT', 'COACH'] as const) {
        signIn(role);
        expect(row()?.textContent?.trim()).toBe('Delete account');
        expect(row()?.classList).toContain('danger');
        expect(row()?.previousElementSibling?.classList).toContain('logout-btn');
      }
    });

    it('opens the sheet for the signed-in role', async () => {
      for (const [role, isCoach] of [['CLIENT', false], ['COACH', true]] as const) {
        signIn(role);
        sheet.open.and.resolveTo({ role: 'cancel' });
        row()!.click();
        await fixture.whenStable();
        const [sheetComponent, options] = sheet.open.calls.mostRecent().args;
        expect(sheetComponent).toBe(DeleteAccountSheetComponent);
        expect(options).toEqual({ label: 'Delete account', props: { isCoach } });
      }
    });

    it('signs out to Login with a toast once the account is deleted', async () => {
      signIn('CLIENT');
      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      sheet.open.and.resolveTo({ data: true, role: 'confirm' });
      await component.openDeleteAccount();

      expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
      expect(localStorage.getItem('token')).toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/login']);
      expect(toastCtrl.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ message: 'Account deleted', color: 'success' }),
      );
    });

    it("forgets the deleted user's waiting changes, workout copies and cached answers on this phone", async () => {
      TestBed.inject(AuthService).setSession(fakeToken('CLIENT', { id: 'u1' }));
      spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      const outbox = TestBed.inject(OutboxService);
      await outbox.start();
      await outbox.enqueue({ method: 'PATCH', path: '/workouts/w1', body: {}, workoutId: 'w1', label: 'Leg day' });
      await fixture.whenStable();
      http.match((r) => r.url.startsWith(`${environment.apiUrl}/workouts`));
      const forgetCopies = spyOn(TestBed.inject(WorkoutCopyService), 'forget').and.callThrough();
      const forgetAnswers = spyOn(TestBed.inject(ReadCacheService), 'forget').and.callThrough();

      sheet.open.and.resolveTo({ data: true, role: 'confirm' });
      await component.openDeleteAccount();
      await fixture.whenStable();

      expect(outbox.countFor('u1')).toBe(0);
      expect(platform.data.has('outbox.u1')).toBeFalse();
      expect(forgetCopies).toHaveBeenCalledOnceWith('u1');
      expect(forgetAnswers).toHaveBeenCalledOnceWith('u1');
      expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
    });

    it('keeps the session when the sheet is closed', async () => {
      signIn('CLIENT');
      sheet.open.and.resolveTo({ role: 'cancel' });
      await component.openDeleteAccount();
      expect(TestBed.inject(AuthService).isAuthenticated()).toBe(true);
      expect(toastCtrl.create).not.toHaveBeenCalled();
    });
  });
});
