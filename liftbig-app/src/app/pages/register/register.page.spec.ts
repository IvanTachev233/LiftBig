import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { CONSENT_TEXT_VERSIONS } from '../../core/agreements.service';
import { POLICIES } from '../../core/agreements.testing';
import { RegisterPage } from './register.page';

describe('RegisterPage', () => {
  let component: RegisterPage;
  let fixture: ComponentFixture<RegisterPage>;
  let http: HttpTestingController;
  let navigate: jasmine.Spy;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RegisterPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(RegisterPage);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('token');
  });

  const el = (selector: string) => fixture.nativeElement.querySelector(selector) as HTMLElement;
  const submit = () => el('ion-button[type="submit"]') as HTMLIonButtonElement;

  function fill(form: Partial<RegisterPage['form']>) {
    Object.assign(component.form, form);
    fixture.detectChanges();
  }

  // What ion-checkbox and ion-toggle emit when tapped
  function tap(selector: string, checked = true) {
    el(selector).dispatchEvent(new CustomEvent('ionChange', { detail: { checked } }));
    fixture.detectChanges();
  }

  const agree = () => {
    tap('.terms-check');
    tap('.health-check');
  };
  const fillValid = (extra: Partial<RegisterPage['form']> = {}) =>
    fill({ name: 'Jane', email: 'jane@x.io', password: 'secret', confirmPassword: 'secret', ...extra });
  const consent = (granted: boolean, purpose: keyof typeof CONSENT_TEXT_VERSIONS) => ({
    granted,
    textVersion: CONSENT_TEXT_VERSIONS[purpose],
  });
  // The current versions are asked for first; the register call follows
  const expectRegister = async () => {
    http.expectOne(`${environment.apiUrl}/policies`).flush(POLICIES);
    await fixture.whenStable();
    return http.expectOne(`${environment.apiUrl}/auth/register`);
  };

  it('asks for name, email, password and its repeat, with labels above the fields, and Client/Coach', () => {
    const labels = Array.from<HTMLIonInputElement>(fixture.nativeElement.querySelectorAll('ion-input')).map(
      (i) => i.label,
    );
    expect(labels).toEqual(['Full name', 'Email', 'Password', 'Confirm password']);
    const roles = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('ion-segment-button')).map((b) =>
      b.textContent!.trim(),
    );
    expect(roles).toEqual(['Client', 'Coach']);
    expect(el('.auth-footer a').getAttribute('href')).toBe('/login');
  });

  it('the show-password toggle switches both password fields and its label', () => {
    const types = () =>
      Array.from<HTMLIonInputElement>(fixture.nativeElement.querySelectorAll('ion-input.password-input')).map(
        (i) => i.type,
      );
    expect(types()).toEqual(['password', 'password']);
    el('.password-toggle').click();
    fixture.detectChanges();
    expect(types()).toEqual(['text', 'text']);
    expect(el('.password-toggle').getAttribute('aria-pressed')).toBe('true');
    expect(el('.password-toggle').getAttribute('aria-label')).toBe('Hide password');
  });

  it('keeps Create account disabled until name, a valid email and matching passwords of 6+ are given', () => {
    agree();
    expect(submit().disabled).toBeTrue();
    fill({ name: 'Jane', email: 'jane@x', password: 'secret', confirmPassword: 'secret' });
    expect(submit().disabled).toBeTrue();
    fill({ email: 'jane@x.io', password: 'short', confirmPassword: 'short' });
    expect(submit().disabled).toBeTrue();
    fill({ password: 'secret', confirmPassword: 'secret!' });
    expect(submit().disabled).toBeTrue();
    expect(el('.field-error').textContent!.trim()).toBe('Passwords do not match.');
    fill({ confirmPassword: 'secret' });
    expect(submit().disabled).toBeFalse();
  });

  it('sends the fields with the chosen role, the accepted versions and every consent, the optional ones off', async () => {
    fill({ name: ' Jane ', email: 'jane@x.io', password: 'secret', confirmPassword: 'secret', role: 'COACH' });
    agree();
    component.register();
    const req = await expectRegister();
    expect(req.request.body).toEqual({
      name: 'Jane',
      email: 'jane@x.io',
      password: 'secret',
      role: 'COACH',
      acceptTerms: { terms: POLICIES.termsVersion, privacy: POLICIES.privacyVersion },
      consents: {
        health_data: consent(true, 'health_data'),
        video_training: consent(false, 'video_training'),
        product_emails: consent(false, 'product_emails'),
      },
    });
  });

  it('opens Check your email for the new account, without signing in', async () => {
    fillValid();
    agree();
    component.register();
    (await expectRegister()).flush(
      { verificationRequired: true, email: 'jane@x.io' },
      { status: 201, statusText: 'Created' },
    );
    expect(localStorage.getItem('token')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/verify-email'], { queryParams: { email: 'jane@x.io' } });
  });

  describe('terms and consents', () => {
    it('keeps Create account disabled until both boxes are ticked, and says so', () => {
      fillValid();
      expect(submit().disabled).toBeTrue();
      expect(el('.agree-hint').textContent!.trim()).toBe('Tick both boxes to continue.');
      tap('.terms-check');
      expect(submit().disabled).toBeTrue();
      tap('.health-check');
      expect(submit().disabled).toBeFalse();
      expect(el('.agree-hint')).toBeNull();
      tap('.terms-check', false);
      expect(submit().disabled).toBeTrue();
      component.register();
      http.expectNone(`${environment.apiUrl}/policies`);
    });

    it('shows the approved wording, with links to the pages that do not tick the box', () => {
      const terms = el('.terms-check');
      expect(terms.textContent!.replace(/\s+/g, ' ').trim()).toBe(
        "I'm 18 or older and agree to the Terms of Use. I've read the Privacy Policy.",
      );
      const links = Array.from(terms.querySelectorAll('a'));
      expect(links.map((a) => a.getAttribute('href'))).toEqual([
        `${environment.apiUrl}/terms`,
        `${environment.apiUrl}/privacy`,
      ]);
      expect(links.every((a) => a.target === '_blank')).toBeTrue();
      expect(el('.health-check').textContent).toContain('This data can say something about my health.');
      links[0].click();
      expect(component.choices().terms).toBeFalse();
    });

    it('offers the optional toggles off, and sends one turned on', async () => {
      const toggles = Array.from<HTMLIonToggleElement>(fixture.nativeElement.querySelectorAll('ion-toggle'));
      expect(toggles.map((t) => t.textContent!.trim())).toEqual([
        'Help improve lift analysis',
        'News and offers by email',
      ]);
      expect(toggles.map((t) => t.checked)).toEqual([false, false]);
      expect(el('.optional-footer').textContent!.trim()).toBe('You can change these any time in Profile → Privacy.');

      fillValid();
      agree();
      tap('[data-purpose="product_emails"]');
      component.register();
      const req = await expectRegister();
      expect(req.request.body.consents).toEqual({
        health_data: consent(true, 'health_data'),
        video_training: consent(false, 'video_training'),
        product_emails: consent(true, 'product_emails'),
      });
    });

    it('fetches the versions again on the next try after a 400', async () => {
      fillValid();
      agree();
      component.register();
      (await expectRegister()).flush({ message: 'out of date' }, { status: 400, statusText: 'Bad Request' });
      component.register();
      (await expectRegister()).flush({ verificationRequired: true, email: 'jane@x.io' }, { status: 201, statusText: 'Created' });
      expect(navigate).toHaveBeenCalled();
    });

    it('says so when the versions cannot be fetched, and sends nothing', async () => {
      const toast = spyOn(component, 'presentToast').and.resolveTo();
      fillValid();
      agree();
      component.register();
      http.expectOne(`${environment.apiUrl}/policies`).flush(null, { status: 0, statusText: 'Offline' });
      await fixture.whenStable();
      http.expectNone(`${environment.apiUrl}/auth/register`);
      expect(toast).toHaveBeenCalledWith('Registration failed. Please try again.');
      expect(component.submitting).toBeFalse();
    });
  });
});
