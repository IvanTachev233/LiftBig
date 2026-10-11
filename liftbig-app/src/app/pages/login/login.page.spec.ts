import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let component: LoginPage;
  let fixture: ComponentFixture<LoginPage>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    fixture = TestBed.createComponent(LoginPage);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

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
    expect(fixture.nativeElement.textContent).not.toContain('Forgot');
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
});
