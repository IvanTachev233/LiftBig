import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { RegisterPage } from './register.page';

describe('RegisterPage', () => {
  let component: RegisterPage;
  let fixture: ComponentFixture<RegisterPage>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RegisterPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(RegisterPage);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  const el = (selector: string) => fixture.nativeElement.querySelector(selector) as HTMLElement;
  const submit = () => el('ion-button[type="submit"]') as HTMLIonButtonElement;

  function fill(form: Partial<RegisterPage['form']>) {
    Object.assign(component.form, form);
    fixture.detectChanges();
  }

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

  it('sends the same body as before, with the chosen role', () => {
    fill({ name: ' Jane ', email: 'jane@x.io', password: 'secret', confirmPassword: 'secret', role: 'COACH' });
    component.register();
    const req = http.expectOne(`${environment.apiUrl}/auth/register`);
    expect(req.request.body).toEqual({ name: 'Jane', email: 'jane@x.io', password: 'secret', role: 'COACH' });
  });
});
