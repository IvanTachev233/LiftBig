import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { fakeToken } from '../../core/auth.testing';
import { VerifyEmailPage } from './verify-email.page';

describe('VerifyEmailPage', () => {
  let fixture: ComponentFixture<VerifyEmailPage>;
  let http: HttpTestingController;
  let navigate: jasmine.Spy;
  let navigateByUrl: jasmine.Spy;
  let toasts: jasmine.SpyObj<ToastController>;

  const verifyUrl = `${environment.apiUrl}/auth/verify-email`;
  const resendUrl = `${environment.apiUrl}/auth/resend-verification`;

  function open(email: string | null = 'jane@x.io') {
    toasts = jasmine.createSpyObj<ToastController>('ToastController', ['create']);
    toasts.create.and.resolveTo({ present: () => Promise.resolve() } as HTMLIonToastElement);
    TestBed.configureTestingModule({
      imports: [VerifyEmailPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ToastController, useValue: toasts },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(email ? { email } : {}) } },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const router = TestBed.inject(Router);
    navigate = spyOn(router, 'navigate').and.resolveTo(true);
    navigateByUrl = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    fixture = TestBed.createComponent(VerifyEmailPage);
    fixture.detectChanges();
  }

  // A fake clock for the countdown (setInterval and Date); promises stay real
  beforeEach(() => jasmine.clock().install().mockDate(new Date(2026, 9, 14, 12, 0, 0)));

  afterEach(() => {
    jasmine.clock().uninstall();
    http.verify();
    localStorage.removeItem('token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  });

  const tick = (ms: number) => jasmine.clock().tick(ms);

  const el = (selector: string) => fixture.nativeElement.querySelector(selector) as HTMLElement;
  const text = (selector: string) => el(selector)?.textContent!.replace(/\s+/g, ' ').trim();
  const resendButton = () => el('ion-button.resend-button') as HTMLIonButtonElement;
  const confirmButton = () => el('ion-button[type="submit"]') as HTMLIonButtonElement;
  const type = (value: string) => {
    el('app-code-field ion-input').dispatchEvent(new CustomEvent('ionInput', { detail: { value } }));
    fixture.detectChanges();
  };
  const fail = (url: string, status: number, body: object = {}) => {
    http.expectOne(url).flush(body, { status, statusText: 'Error' });
    fixture.detectChanges();
  };

  it('shows the address, the code field and the two actions', async () => {
    open();
    expect(text('h1')).toBe('Check your email');
    expect(text('.verify-address')).toBe('jane@x.io');
    expect(el('app-code-field ion-input')).toBeTruthy();
    expect(text('.resend-button')).toBe('Resend code in 60 s');
    expect(text('.different-email')).toBe('Use a different email');
    expect(confirmButton().disabled).toBeTrue();
  });

  it('goes to Sign up without an address', async () => {
    open(null);
    expect(navigate).toHaveBeenCalledWith(['/register'], { replaceUrl: true });
  });

  it('a pasted code is sent as 6 digits; the right one stores the token and opens Today', async () => {
    open();
    type('123 456');
    const req = http.expectOne(verifyUrl);
    expect(req.request.body).toEqual({ email: 'jane@x.io', code: '123456' });
    const token = fakeToken('CLIENT');
    req.flush({ access_token: token });
    await fixture.whenStable();
    expect(localStorage.getItem('access_token')).toBe(token);
    expect(navigateByUrl).toHaveBeenCalledWith('/today', { replaceUrl: true });
  });

  it('opens the coach tab for a coach', async () => {
    open();
    type('123456');
    http.expectOne(verifyUrl).flush({ access_token: fakeToken('COACH') });
    await fixture.whenStable();
    expect(navigateByUrl).toHaveBeenCalledWith('/coach/clients', { replaceUrl: true });
  });

  it('Confirm sends the code too', async () => {
    open();
    fixture.componentInstance.code.set('123456');
    fixture.detectChanges();
    expect(confirmButton().disabled).toBeFalse();
    fixture.componentInstance.verify();
    http.expectOne(verifyUrl);
  });

  it('says how many tries are left after a wrong code', async () => {
    open();
    type('111111');
    fail(verifyUrl, 400, { attemptsLeft: 3 });
    expect(text('.field-error')).toBe('Wrong code. 3 tries left.');
    type('111112');
    fail(verifyUrl, 400, { attemptsLeft: 1 });
    expect(text('.field-error')).toBe('Wrong code. 1 try left.');
    expect(localStorage.getItem('token')).toBeNull();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('asks for a new code once the code is spent (409)', async () => {
    open();
    type('111111');
    fail(verifyUrl, 409);
    expect(text('.field-error')).toBe('This code no longer works. Tap Resend code to get a new one.');
  });

  it('explains a mail outage (503) and a lost connection', async () => {
    open();
    type('111111');
    fail(verifyUrl, 503);
    expect(text('.field-error')).toBe("We couldn't send the email. Try again in a moment.");
    type('111112');
    fail(verifyUrl, 0);
    expect(text('.field-error')).toBe('No connection. Check your internet and try again.');
  });

  it('keeps Resend code disabled with a countdown for 60 s, then sends a new code', async () => {
    open();
    expect(resendButton().disabled).toBeTrue();
    tick(1000);
    fixture.detectChanges();
    expect(text('.resend-button')).toBe('Resend code in 59 s');
    tick(59_000);
    fixture.detectChanges();
    expect(text('.resend-button')).toBe('Resend code');
    expect(resendButton().disabled).toBeFalse();

    resendButton().click();
    const req = http.expectOne(resendUrl);
    expect(req.request.body).toEqual({ email: 'jane@x.io' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
    expect(text('.verify-notice')).toBe('We sent a new code to jane@x.io.');
    expect(text('.resend-button')).toBe('Resend code in 60 s');
    expect(resendButton().disabled).toBeTrue();
  });

  it('waits as long as the API says after a 429', async () => {
    open();
    tick(60_000);
    fixture.detectChanges();
    resendButton().click();
    fail(resendUrl, 429, { retryAfterSeconds: 125 });
    expect(text('.field-error')).toBe('Too many codes requested. Try again in 3 min.');
    expect(text('.resend-button')).toBe('Resend code in 3 min');
    tick(80_000);
    fixture.detectChanges();
    expect(text('.resend-button')).toBe('Resend code in 45 s');
  });

  it('says so when the new code cannot be mailed (503)', async () => {
    open();
    tick(60_000);
    fixture.detectChanges();
    resendButton().click();
    fail(resendUrl, 503);
    expect(text('.field-error')).toBe("We couldn't send the email. Try again in a moment.");
    expect(resendButton().disabled).toBeFalse();
  });

  it('Use a different email goes back to Sign up', async () => {
    open();
    el('ion-button.different-email').click();
    expect(navigate).toHaveBeenCalledWith(['/register']);
  });

  it('stops the countdown when the screen goes away', async () => {
    open();
    const { cooldown } = fixture.componentInstance;
    fixture.destroy();
    tick(5000);
    expect(cooldown.remaining()).toBe(60);
  });

  it('does not sign in twice when both auto-submit and Confirm fire', async () => {
    open();
    type('123456');
    fixture.componentInstance.verify();
    http.expectOne(verifyUrl);
  });

  it('uses the stored session afterwards', async () => {
    open();
    type('123456');
    http.expectOne(verifyUrl).flush({ access_token: fakeToken('CLIENT') });
    await fixture.whenStable();
    expect(TestBed.inject(AuthService).isAuthenticated()).toBeTrue();
    expect(toasts.create).toHaveBeenCalledWith(jasmine.objectContaining({ message: 'Welcome to LiftBig!' }));
  });
});
