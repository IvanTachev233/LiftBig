import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ToastController } from '@ionic/angular';
import { environment } from '../../../environments/environment';
import { fakeToken } from '../../core/auth.testing';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let component: LoginPage;
  let fixture: ComponentFixture<LoginPage>;
  let http: HttpTestingController;
  let navigate: jasmine.Spy;
  let navigateByUrl: jasmine.Spy;
  let toasts: jasmine.SpyObj<ToastController>;

  beforeEach(() => {
    toasts = jasmine.createSpyObj<ToastController>('ToastController', ['create']);
    toasts.create.and.resolveTo({ present: () => Promise.resolve() } as HTMLIonToastElement);
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ToastController, useValue: toasts },
      ],
    });
    const router = TestBed.inject(Router);
    navigate = spyOn(router, 'navigate').and.resolveTo(true);
    navigateByUrl = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    fixture = TestBed.createComponent(LoginPage);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('token');
  });

  function logIn() {
    component.credentials.email = 'a@b.io';
    component.credentials.password = 'secret';
    component.login();
    return http.expectOne(`${environment.apiUrl}/auth/login`);
  }

  const el = (selector: string) => fixture.nativeElement.querySelector(selector) as HTMLElement;

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the LIFTBIG. wordmark, labelled fields and the sign-up link at the bottom', () => {
    expect(el('.wordmark').textContent!.replace(/\s+/g, '')).toBe('LiftBig.');
    expect(el('.wordmark .wordmark-dot').textContent).toBe('.');
    const labels = Array.from<HTMLIonInputElement>(fixture.nativeElement.querySelectorAll('ion-input')).map(
      (i) => i.label,
    );
    expect(labels).toEqual(['Email', 'Password']);
    expect(el('.auth-footer a').getAttribute('href')).toBe('/register');
    expect(el('.auth-notice')).toBeNull();
  });

  it('links Forgot password? to Reset password, passing on the typed email', () => {
    const link = () => el('.password-field a.forgot-link');
    expect(link().textContent!.trim()).toBe('Forgot password?');
    expect(link().getAttribute('href')).toBe('/forgot-password');

    component.credentials.email = ' a@b.io ';
    fixture.detectChanges();
    expect(link().getAttribute('href')).toBe('/forgot-password?email=a@b.io');
  });

  it('the show-password toggle switches the input type and its label', () => {
    const password = () => el('ion-input.password-input') as unknown as HTMLIonInputElement;
    const toggle = () => el('.password-toggle');
    expect(password().type).toBe('password');
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(toggle().getAttribute('aria-label')).toBe('Show password');

    toggle().click();
    fixture.detectChanges();
    expect(password().type).toBe('text');
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(toggle().getAttribute('aria-label')).toBe('Hide password');
  });

  it('keeps Log in disabled until both fields are filled, then sends them', () => {
    const submit = () => el('ion-button[type="submit"]') as HTMLIonButtonElement;
    expect(submit().textContent!.trim()).toBe('Log in');
    expect(submit().disabled).toBeTrue();
    component.credentials.email = ' a@b.io ';
    fixture.detectChanges();
    expect(submit().disabled).toBeTrue();
    component.credentials.password = 'secret';
    fixture.detectChanges();
    expect(submit().disabled).toBeFalse();

    component.login();
    const req = http.expectOne(`${environment.apiUrl}/auth/login`);
    expect(req.request.body).toEqual({ email: 'a@b.io', password: 'secret' });
  });

  it('stores the token and opens the role tab on success', async () => {
    const token = fakeToken('COACH');
    logIn().flush({ access_token: token });
    await fixture.whenStable();
    expect(localStorage.getItem('token')).toBe(token);
    expect(navigateByUrl).toHaveBeenCalledWith('/coach/clients', { replaceUrl: true });
  });

  it('opens Check your email for an unconfirmed account (403 EMAIL_NOT_VERIFIED)', () => {
    logIn().flush(
      { statusCode: 403, code: 'EMAIL_NOT_VERIFIED', email: 'a@b.io' },
      { status: 403, statusText: 'Forbidden' },
    );
    expect(navigate).toHaveBeenCalledWith(['/verify-email'], { queryParams: { email: 'a@b.io' } });
    expect(localStorage.getItem('token')).toBeNull();
    expect(toasts.create).not.toHaveBeenCalled();
  });

  it('keeps the error toast for a wrong password', () => {
    logIn().flush({ statusCode: 401 }, { status: 401, statusText: 'Unauthorized' });
    expect(navigate).not.toHaveBeenCalled();
    expect(toasts.create).toHaveBeenCalledWith(
      jasmine.objectContaining({ message: 'Login failed. Please check your credentials.' }),
    );
  });
});

describe('LoginPage after a password reset', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'login', component: LoginPage }]),
      ],
    });
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  async function openLogin(url: string) {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(url, LoginPage);
    harness.detectChanges();
    return { harness, page, el: (selector: string) => harness.routeNativeElement!.querySelector(selector) };
  }

  it('fills in the email and says the password was reset', async () => {
    const { page, el } = await openLogin('/login?email=a%40b.io&passwordReset=1');
    expect(page.credentials.email).toBe('a@b.io');
    expect(page.credentials.password).toBe('');
    expect(el('.auth-notice')!.getAttribute('role')).toBe('status');
    expect(el('.auth-notice')!.textContent!.trim()).toBe('Password reset. Log in with your new password.');
  });

  it('fills in the email alone without the message', async () => {
    const { page, el } = await openLogin('/login?email=a%40b.io');
    expect(page.credentials.email).toBe('a@b.io');
    expect(el('.auth-notice')).toBeNull();
  });

  it('picks up the params when the same page is shown again', async () => {
    const { harness, page, el } = await openLogin('/login');
    page.credentials.password = 'old-secret';
    await harness.navigateByUrl('/login?email=c%40d.io&passwordReset=1');
    harness.detectChanges();
    expect(page.credentials.email).toBe('c@d.io');
    expect(page.credentials.password).toBe('');
    expect(el('.auth-notice')).not.toBeNull();
  });
});
