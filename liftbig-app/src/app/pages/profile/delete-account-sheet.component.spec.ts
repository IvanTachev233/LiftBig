import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ModalController } from '@ionic/angular';
import { environment } from '../../../environments/environment';
import { DeleteAccountSheetComponent } from './delete-account-sheet.component';

describe('DeleteAccountSheetComponent', () => {
  let fixture: ComponentFixture<DeleteAccountSheetComponent>;
  let component: DeleteAccountSheetComponent;
  let modals: jasmine.SpyObj<ModalController>;
  let http: HttpTestingController;
  const url = `${environment.apiUrl}/users/me`;

  const create = (isCoach = false) => {
    fixture = TestBed.createComponent(DeleteAccountSheetComponent);
    component = fixture.componentInstance;
    component.isCoach = isCoach;
    fixture.detectChanges();
  };

  beforeEach(() => {
    modals = jasmine.createSpyObj<ModalController>('ModalController', ['dismiss']);
    modals.dismiss.and.resolveTo(true);
    TestBed.configureTestingModule({
      imports: [DeleteAccountSheetComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.overrideComponent(DeleteAccountSheetComponent, {
      add: { providers: [{ provide: ModalController, useValue: modals }] },
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const el = <T = HTMLElement>(selector: string) =>
    fixture.nativeElement.querySelector(selector) as T;
  const text = (selector: string) => el(selector).textContent!.trim();
  const deleteButton = () => el<HTMLButtonElement>('.confirm-btn');
  const input = () => el<HTMLIonInputElement>('ion-input');
  const error = () => el('.sheet-error');
  const fill = (password: string) => {
    component.password = password;
    fixture.detectChanges();
  };

  it('tells a client that their account and training data are deleted', () => {
    create();
    expect(text('.confirm-title')).toBe('Delete account?');
    expect(text('.confirm-message')).toBe(
      'This permanently deletes your account, your workouts and logged sets, ' +
        "your 1RMs and your programs. This can't be undone.",
    );
    expect(text('.confirm-message')).not.toContain('clients');
    expect(deleteButton().textContent!.trim()).toBe('Delete account');
  });

  it('tells a coach that clients keep their workouts and are unlinked', () => {
    create(true);
    expect(text('.confirm-message')).toBe(
      'This permanently deletes your account, your invites and your own workouts. ' +
        "Your clients keep their workouts and are unlinked from you. This can't be undone.",
    );
  });

  it('asks for the password in a hidden field with a show toggle', () => {
    create();
    expect(input().label).toBe('Password');
    expect(input().type).toBe('password');
    expect(input().autocomplete).toBe('current-password');
    const toggle = el('.password-toggle');
    expect(toggle.getAttribute('aria-label')).toBe('Show password');
    toggle.click();
    fixture.detectChanges();
    expect(input().type).toBe('text');
    expect(toggle.getAttribute('aria-label')).toBe('Hide password');
  });

  it('needs a password before Delete account is enabled', () => {
    create();
    expect(deleteButton().disabled).toBeTrue();
    deleteButton().click();
    http.expectNone(url);
    fill('my-secret');
    expect(deleteButton().disabled).toBeFalse();
  });

  it('sends DELETE /users/me with the password and closes with confirm on success', () => {
    create();
    fill('my-secret');
    deleteButton().click();
    fixture.detectChanges();
    const req = http.expectOne(url);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.body).toEqual({ password: 'my-secret' });
    expect(deleteButton().disabled).toBeTrue();
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(modals.dismiss).toHaveBeenCalledOnceWith(true, 'confirm');
  });

  it('stays open with the tries left when the password is wrong', () => {
    create();
    fill('wrong');
    component.delete();
    http
      .expectOne(url)
      .flush(
        { message: 'Password is incorrect', attemptsLeft: 2 },
        { status: 403, statusText: 'Forbidden' },
      );
    fixture.detectChanges();
    expect(modals.dismiss).not.toHaveBeenCalled();
    expect(error().getAttribute('role')).toBe('alert');
    expect(error().textContent!.trim()).toBe('Your password is incorrect. 2 tries left.');
    expect(deleteButton().disabled).toBeFalse();
  });

  it('says how long to wait while locked', () => {
    create();
    fill('my-secret');
    component.delete();
    http
      .expectOne(url)
      .flush({ retryAfterMinutes: 12 }, { status: 429, statusText: 'Too Many Requests' });
    fixture.detectChanges();
    expect(modals.dismiss).not.toHaveBeenCalled();
    expect(error().textContent!.trim()).toBe('Too many wrong passwords. Try again in 12 minutes.');
  });

  it('shows a general error for other failures and clears it on retry', () => {
    create();
    fill('my-secret');
    component.delete();
    http.expectOne(url).flush('', { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(error().textContent!.trim()).toBe("Couldn't delete your account. Try again.");
    component.delete();
    fixture.detectChanges();
    expect(error()).toBeNull();
    http.expectOne(url).flush(null, { status: 204, statusText: 'No Content' });
  });

  it('Cancel closes without deleting', () => {
    create();
    fill('my-secret');
    el('.cancel-btn').click();
    http.expectNone(url);
    expect(modals.dismiss).toHaveBeenCalledOnceWith(false, 'cancel');
  });
});
