import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { environment } from '../../../environments/environment';
import { CONSENT_TEXT_VERSIONS } from '../../core/agreements.service';
import { AGREED, POLICIES } from '../../core/agreements.testing';
import { AuthService } from '../../core/auth.service';
import { fakeToken } from '../../core/auth.testing';
import { AccountActionsService } from '../profile/account-actions.service';
import { PrivacyPage } from './privacy.page';

describe('PrivacyPage', () => {
  let fixture: ComponentFixture<PrivacyPage>;
  let http: HttpTestingController;
  let toastCtrl: jasmine.SpyObj<ToastController>;
  let account: jasmine.SpyObj<AccountActionsService>;
  const api = environment.apiUrl;
  const profile = {
    id: 'u1',
    email: 'una@x.io',
    name: 'Una',
    role: 'CLIENT',
    weightUnit: 'kg',
    ...AGREED,
    consents: { ...AGREED.consents, product_emails: true },
  };

  const open = (payload: object = profile, policies: object | null = POLICIES) => {
    fixture = TestBed.createComponent(PrivacyPage);
    fixture.componentInstance.ionViewWillEnter();
    http.expectOne(`${api}/users/me`).flush(payload);
    const policiesReq = http.expectOne(`${api}/policies`);
    if (policies) policiesReq.flush(policies);
    else policiesReq.flush(null, { status: 0, statusText: 'Offline' });
    fixture.detectChanges();
  };

  beforeEach(() => {
    toastCtrl = jasmine.createSpyObj('ToastController', ['create']);
    toastCtrl.create.and.resolveTo({ present: () => Promise.resolve() } as never);
    account = jasmine.createSpyObj('AccountActionsService', ['deleteAccount']);
    account.deleteAccount.and.resolveTo();
    TestBed.configureTestingModule({
      imports: [PrivacyPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ToastController, useValue: toastCtrl },
        { provide: AccountActionsService, useValue: account },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).setSession(fakeToken('CLIENT'));
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('token');
    localStorage.removeItem('access_token');
  });

  const q = (selector: string) => fixture.nativeElement.querySelector(selector) as HTMLElement | null;
  const text = (selector: string) => q(selector)!.textContent!.replace(/\s+/g, ' ').trim();
  // The title and subtitle of a row, each on its own line
  const parts = (selector: string) =>
    Array.from(q(selector)!.querySelectorAll('.row-text > span')).map((span) => span.textContent!.trim());
  const toggle = (purpose: string) => q(`ion-toggle[data-purpose="${purpose}"]`) as HTMLIonToggleElement;
  const tap = (purpose: string, checked: boolean) => {
    toggle(purpose).dispatchEvent(new CustomEvent('ionChange', { detail: { checked } }));
    fixture.detectChanges();
  };
  const toastMessage = () => (toastCtrl.create.calls.mostRecent().args[0] as { message: string }).message;

  it('shows each optional consent as a toggle in its stored state', () => {
    open();
    expect(toggle('video_training').textContent!.trim()).toBe('Help improve lift analysis');
    expect(toggle('video_training').checked).toBeFalse();
    expect(toggle('product_emails').textContent!.trim()).toBe('News and offers by email');
    expect(toggle('product_emails').checked).toBeTrue();
  });

  it('saves a toggle with the wording version and confirms it', () => {
    open();
    tap('video_training', true);
    const req = http.expectOne(`${api}/users/me/consents/video_training`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ granted: true, textVersion: CONSENT_TEXT_VERSIONS.video_training });
    req.flush({ ...profile, consents: { ...profile.consents, video_training: true } });
    expect(toggle('video_training').checked).toBeTrue();
    expect(toastMessage()).toBe('Video training turned on.');

    tap('product_emails', false);
    http
      .expectOne(`${api}/users/me/consents/product_emails`)
      .flush({ ...profile, consents: { ...profile.consents, video_training: true, product_emails: false } });
    expect(toastMessage()).toBe('Emails turned off.');
  });

  it('puts the toggle back and says so when saving fails', () => {
    open();
    tap('video_training', true);
    http.expectOne(`${api}/users/me/consents/video_training`).flush(null, { status: 0, statusText: 'Offline' });
    fixture.detectChanges();
    expect(toggle('video_training').checked).toBeFalse();
    expect(toastMessage()).toBe("Couldn't save. Check your connection.");
  });

  it('shows when the training data consent was given, and Delete account to withdraw it', () => {
    open();
    expect(text('.training-data p')).toBe(
      "You agreed on 24 Oct 2026. LiftBig can't log your training without it. To withdraw it, delete your account.",
    );
    (q('.training-data .delete-btn') as HTMLElement).click();
    expect(account.deleteAccount).toHaveBeenCalled();
  });

  it('links to both documents with their versions', () => {
    open();
    expect(q('.terms-link')!.getAttribute('href')).toBe(`${api}/terms`);
    expect(parts('.terms-link')).toEqual(['Terms of Use', `Version ${POLICIES.termsVersion}`]);
    expect(q('.privacy-link')!.getAttribute('href')).toBe(`${api}/privacy`);
    expect(parts('.privacy-link')).toEqual(['Privacy Policy', `Version ${POLICIES.privacyVersion}`]);
    expect(q('.terms-link')!.getAttribute('target')).toBe('_blank');
  });

  it('offers a data request by email to the contact address', () => {
    open();
    expect(q('.data-request')!.getAttribute('href')).toBe(
      'mailto:privacy@example.com?subject=LiftBig%20data%20request',
    );
    expect(parts('.data-request')).toEqual(['Request a copy of my data', "We'll email it to you within a month."]);
  });

  it('still links to the documents without the versions or a contact address', () => {
    open(profile, null);
    expect(parts('.terms-link')).toEqual(['Terms of Use']);
    expect(q('.data-request')).toBeNull();
  });

  it('goes back to the Profile tab of the signed-in role', () => {
    open();
    expect(fixture.componentInstance.backHref()).toBe('/profile');
    TestBed.inject(AuthService).setSession(fakeToken('COACH'));
    expect(fixture.componentInstance.backHref()).toBe('/coach/profile');
  });
});
