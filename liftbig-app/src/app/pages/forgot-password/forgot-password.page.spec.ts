import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ForgotPasswordPage } from './forgot-password.page';

describe('ForgotPasswordPage', () => {
  let fixture: ComponentFixture<ForgotPasswordPage>;
  let http: HttpTestingController;
  let navigate: jasmine.Spy;

  const forgotUrl = `${environment.apiUrl}/auth/forgot-password`;
  const resetUrl = `${environment.apiUrl}/auth/reset-password`;

  function open(email: string | null = null) {
    TestBed.configureTestingModule({
      imports: [ForgotPasswordPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap(email ? { email } : {}),
            },
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(ForgotPasswordPage);
    fixture.detectChanges();
  }

  // A fake clock for the countdown (setInterval and Date); promises stay real
  beforeEach(() =>
    jasmine
      .clock()
      .install()
      .mockDate(new Date(2026, 9, 14, 12, 0, 0)),
  );

  afterEach(() => {
    jasmine.clock().uninstall();
    http.verify();
  });

  const tick = (ms: number) => {
    jasmine.clock().tick(ms);
    fixture.detectChanges();
  };
  const el = (selector: string) => fixture.nativeElement.querySelector(selector) as HTMLElement;
  const text = (selector: string) => el(selector)?.textContent!.replace(/\s+/g, ' ').trim();
  const submit = () => el('ion-button[type="submit"]') as HTMLIonButtonElement;
  const resendButton = () => el('ion-button.resend-button') as HTMLIonButtonElement;
  const typeCode = (value: string) => {
    el('app-code-field ion-input').dispatchEvent(new CustomEvent('ionInput', { detail: { value } }));
    fixture.detectChanges();
  };
  const fail = (url: string, status: number, body: object = {}) => {
    http.expectOne(url).flush(body, { status, statusText: 'Error' });
    fixture.detectChanges();
  };
  const ok = (url: string) => {
    const req = http.expectOne(url);
    req.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
    return req;
  };

  // Step 1 sent for jane@x.io; now on code + new password
  function toStepTwo() {
    open('jane@x.io');
    page().sendCode();
    ok(forgotUrl);
  }
  const page = () => fixture.componentInstance;
  const fillReset = (code: string, password: string) => {
    page().code.set(code);
    page().newPassword = password;
    fixture.detectChanges();
  };

  describe('step 1: email', () => {
    it('asks for the email, with Send code disabled until it looks valid', () => {
      open();
      expect(text('h1')).toBe('Reset password');
      expect((el('ion-input[name="email"]') as unknown as HTMLIonInputElement).label).toBe('Email');
      expect(text('ion-button[type="submit"]')).toBe('Send code');
      expect(submit().disabled).toBeTrue();
      page().email = 'jane@';
      fixture.detectChanges();
      expect(submit().disabled).toBeTrue();
      page().email = ' jane@x.io ';
      fixture.detectChanges();
      expect(submit().disabled).toBeFalse();
    });

    it('fills in the email from Login', () => {
      open('jane@x.io');
      expect(page().email).toBe('jane@x.io');
      expect(submit().disabled).toBeFalse();
    });

    it('sends the trimmed email and moves on to the code step', () => {
      open();
      page().email = ' jane@x.io ';
      fixture.detectChanges();
      page().sendCode();
      const req = ok(forgotUrl);
      expect(req.request.body).toEqual({ email: 'jane@x.io' });
      expect(text('h1')).toBe('Set a new password');
      expect(text('.verify-address')).toBe('jane@x.io');
      expect(el('app-code-field ion-input')).toBeTruthy();
      expect(el('ion-input[name="email"]')).toBeNull();
    });

    it('stays on the email step with a message when the request fails', () => {
      open('jane@x.io');
      page().sendCode();
      fail(forgotUrl, 400, { message: ['email must be an email'] });
      expect(text('.field-error')).toBe('Enter a valid email address.');
      expect(text('h1')).toBe('Reset password');

      page().sendCode();
      fail(forgotUrl, 0);
      expect(text('.field-error')).toBe('No connection. Check your internet and try again.');

      page().sendCode();
      fail(forgotUrl, 429, { retryAfterSeconds: 40 });
      expect(text('.field-error')).toBe('Too many codes requested. Try again in 40 s.');
    });
  });

  describe('step 2: code and new password', () => {
    it('shows the code field, the new password with a show toggle, and Resend code counting down', () => {
      toStepTwo();
      const password = () => el('ion-input.new-password') as unknown as HTMLIonInputElement;
      expect(password().label).toBe('New password');
      expect(password().type).toBe('password');
      const toggle = el('.password-toggle');
      expect(toggle.getAttribute('aria-label')).toBe('Show password');
      toggle.click();
      fixture.detectChanges();
      expect(password().type).toBe('text');
      expect(toggle.getAttribute('aria-pressed')).toBe('true');
      expect(toggle.getAttribute('aria-label')).toBe('Hide password');

      expect(text('ion-button[type="submit"]')).toBe('Reset password');
      expect(text('.resend-button')).toBe('Resend code in 60 s');
      expect(resendButton().disabled).toBeTrue();
    });

    it('enables Reset password only with 6 digits and a 6-character password', () => {
      toStepTwo();
      expect(submit().disabled).toBeTrue();
      typeCode('12 34 56');
      expect(page().code()).toBe('123456');
      expect(submit().disabled).toBeTrue();
      page().newPassword = '12345';
      fixture.detectChanges();
      expect(submit().disabled).toBeTrue();
      page().newPassword = '123456';
      fixture.detectChanges();
      expect(submit().disabled).toBeFalse();
      // A full code alone does not submit
      http.expectNone(resetUrl);
    });

    it('resets, then opens Login with the email and the reset message', () => {
      toStepTwo();
      fillReset('123456', 'new-secret');
      page().reset();
      const req = ok(resetUrl);
      expect(req.request.body).toEqual({
        email: 'jane@x.io',
        code: '123456',
        newPassword: 'new-secret',
      });
      expect(navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { email: 'jane@x.io', passwordReset: 1 },
        replaceUrl: true,
      });
    });

    it('says how many tries are left after a wrong code', () => {
      toStepTwo();
      fillReset('111111', 'new-secret');
      page().reset();
      fail(resetUrl, 400, { attemptsLeft: 3 });
      expect(text('.field-error')).toBe('Wrong code. 3 tries left.');
      page().reset();
      fail(resetUrl, 400, { attemptsLeft: 1 });
      expect(text('.field-error')).toBe('Wrong code. 1 try left.');
      expect(navigate).not.toHaveBeenCalled();
    });

    it('asks for a new code once the code is spent (409)', () => {
      toStepTwo();
      fillReset('111111', 'new-secret');
      page().reset();
      fail(resetUrl, 409);
      expect(text('.field-error')).toBe('This code no longer works. Tap Resend code to get a new one.');
    });

    it('explains a password the API finds too short, and a lost connection', () => {
      toStepTwo();
      fillReset('123456', 'new-secret');
      page().reset();
      fail(resetUrl, 400, {
        message: ['newPassword must be longer than or equal to 6 characters'],
      });
      expect(text('.field-error')).toBe('Your new password needs at least 6 characters.');
      page().reset();
      fail(resetUrl, 0);
      expect(text('.field-error')).toBe('No connection. Check your internet and try again.');
    });

    it('sends a new code once the countdown ends', () => {
      toStepTwo();
      tick(1000);
      expect(text('.resend-button')).toBe('Resend code in 59 s');
      tick(59_000);
      expect(text('.resend-button')).toBe('Resend code');
      expect(resendButton().disabled).toBeFalse();

      resendButton().click();
      const req = ok(forgotUrl);
      expect(req.request.body).toEqual({ email: 'jane@x.io' });
      expect(text('.verify-notice')).toBe('If jane@x.io has an account, a new code is on its way.');
      expect(text('.resend-button')).toBe('Resend code in 60 s');
    });

    it('waits as long as the API says after a 429', () => {
      toStepTwo();
      tick(60_000);
      resendButton().click();
      fail(forgotUrl, 429, { retryAfterSeconds: 125 });
      expect(text('.field-error')).toBe('Too many codes requested. Try again in 3 min.');
      expect(text('.resend-button')).toBe('Resend code in 3 min');
    });

    it('Use a different email goes back to step 1 with the email kept', () => {
      toStepTwo();
      fillReset('123456', 'new-secret');
      el('ion-button.different-email').click();
      fixture.detectChanges();
      expect(text('h1')).toBe('Reset password');
      expect(page().email).toBe('jane@x.io');
      expect(page().code()).toBe('');
      expect(page().newPassword).toBe('');
    });

    it('stops the countdown when the screen goes away', () => {
      toStepTwo();
      const { cooldown } = page();
      fixture.destroy();
      jasmine.clock().tick(5000);
      expect(cooldown.remaining()).toBe(60);
    });
  });
});
