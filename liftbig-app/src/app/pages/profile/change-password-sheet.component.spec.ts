import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ModalController } from '@ionic/angular';
import { environment } from '../../../environments/environment';
import { BottomSheetComponent } from '../../shared/ui/bottom-sheet.component';
import { ChangePasswordSheetComponent } from './change-password-sheet.component';

describe('ChangePasswordSheetComponent', () => {
  let fixture: ComponentFixture<ChangePasswordSheetComponent>;
  let component: ChangePasswordSheetComponent;
  let modals: jasmine.SpyObj<ModalController>;
  let http: HttpTestingController;
  const url = `${environment.apiUrl}/users/me/password`;

  beforeEach(() => {
    modals = jasmine.createSpyObj<ModalController>('ModalController', ['dismiss']);
    modals.dismiss.and.resolveTo(true);
    TestBed.configureTestingModule({
      imports: [ChangePasswordSheetComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    for (const c of [ChangePasswordSheetComponent, BottomSheetComponent]) {
      TestBed.overrideComponent(c, {
        add: { providers: [{ provide: ModalController, useValue: modals }] },
      });
    }
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ChangePasswordSheetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('token');
  });

  const el = <T = HTMLElement>(selector: string) =>
    fixture.nativeElement.querySelector(selector) as T;
  const all = (selector: string) =>
    Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll(selector));
  const inputs = (): HTMLIonInputElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('ion-input'));
  const saveButton = () => el<HTMLIonButtonElement>('ion-button.btn-primary');
  const fill = (current: string, next: string) => {
    component.currentPassword = current;
    component.newPassword = next;
    fixture.detectChanges();
  };
  const error = () => el('.sheet-error');

  it('has a current and a new password field, both hidden', () => {
    expect(el('.sheet-title').textContent!.trim()).toBe('Change password');
    const fields = inputs();
    expect(fields.map((i) => i.label)).toEqual(['Current password', 'New password']);
    expect(fields.map((i) => i.type)).toEqual(['password', 'password']);
    expect(fields.map((i) => i.autocomplete)).toEqual(['current-password', 'new-password']);
    expect(saveButton().textContent!.trim()).toBe('Change password');
    expect(error()).toBeNull();
  });

  it('shows and hides each password with its toggle', () => {
    const [toggle] = all('.password-toggle');
    expect(toggle.getAttribute('aria-label')).toBe('Show current password');
    toggle.click();
    fixture.detectChanges();
    const [current, next] = inputs();
    expect(current.type).toBe('text');
    expect(next.type).toBe('password');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Hide current password');
  });

  it('enables the button once the current one is filled and the new one has 6 characters', () => {
    expect(saveButton().disabled).toBeTrue();
    fill('old-secret', 'abc12');
    expect(saveButton().disabled).toBeTrue();
    fill('', 'abc123');
    expect(saveButton().disabled).toBeTrue();
    fill('old-secret', 'abc123');
    expect(saveButton().disabled).toBeFalse();
  });

  it('sends both passwords and closes with confirm when the API accepts', () => {
    fill('old-secret', 'new-secret');
    saveButton().click();
    fixture.detectChanges();
    const req = http.expectOne(url);
    expect(req.request.body).toEqual({
      currentPassword: 'old-secret',
      newPassword: 'new-secret',
    });
    expect(saveButton().disabled).toBeTrue();
    req.flush({ access_token: 'header.e30.sig' });
    expect(modals.dismiss).toHaveBeenCalledOnceWith(true, 'confirm');
  });

  it('stays open with an error and the tries left when the current password is wrong', () => {
    fill('wrong', 'new-secret');
    component.save();
    http.expectOne(url).flush(
      { message: 'Current password is incorrect', attemptsLeft: 2 },
      { status: 403, statusText: 'Forbidden' },
    );
    fixture.detectChanges();
    expect(modals.dismiss).not.toHaveBeenCalled();
    expect(error().getAttribute('role')).toBe('alert');
    expect(error().textContent!.trim()).toBe('Your current password is incorrect. 2 tries left.');
    expect(saveButton().disabled).toBeFalse();

    component.save();
    http.expectOne(url).flush(
      { message: 'Current password is incorrect', attemptsLeft: 1 },
      { status: 403, statusText: 'Forbidden' },
    );
    fixture.detectChanges();
    expect(error().textContent!.trim()).toBe('Your current password is incorrect. 1 try left.');
  });

  it('says how long to wait once too many wrong passwords locked it', () => {
    fill('wrong', 'new-secret');
    component.save();
    http.expectOne(url).flush(
      { message: 'Too many wrong passwords', retryAfterMinutes: 15 },
      { status: 429, statusText: 'Too Many Requests' },
    );
    fixture.detectChanges();
    expect(modals.dismiss).not.toHaveBeenCalled();
    expect(error().textContent!.trim()).toBe(
      'Too many wrong passwords. Try again in 15 minutes.',
    );
  });

  it('says one minute in the singular', () => {
    fill('wrong', 'new-secret');
    component.save();
    http.expectOne(url).flush({ retryAfterMinutes: 1 }, { status: 429, statusText: 'Too Many Requests' });
    fixture.detectChanges();
    expect(error().textContent!.trim()).toBe('Too many wrong passwords. Try again in 1 minute.');
  });

  it('shows a general error for other failures and clears it on retry', () => {
    fill('old-secret', 'new-secret');
    component.save();
    http.expectOne(url).flush('', { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(error().textContent!.trim()).toBe("Couldn't change your password. Try again.");
    component.save();
    fixture.detectChanges();
    expect(error()).toBeNull();
    http.expectOne(url).flush({ access_token: 'header.e30.sig' });
  });

  it('sends nothing while invalid or already sending', () => {
    fill('old-secret', 'short');
    component.save();
    http.expectNone(url);
    fill('old-secret', 'new-secret');
    component.save();
    component.save();
    expect(http.match(url).length).toBe(1);
  });
});
