import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { environment } from '../../../../environments/environment';
import { AgreementStatus, AgreementsService, CONSENT_TEXT_VERSIONS } from '../../../core/agreements.service';
import { AGREED, POLICIES } from '../../../core/agreements.testing';
import { AccountActionsService } from '../../../pages/profile/account-actions.service';
import { TermsUpdateScreenComponent } from './terms-update-screen.component';

describe('TermsUpdateScreenComponent', () => {
  let fixture: ComponentFixture<TermsUpdateScreenComponent>;
  let agreements: AgreementsService;
  let http: HttpTestingController;
  let toastCtrl: jasmine.SpyObj<ToastController>;
  let account: jasmine.SpyObj<AccountActionsService>;
  const firstRollout: AgreementStatus = {
    needsAcceptance: ['terms', 'privacy', 'health_data'],
    consents: { health_data: false, video_training: false, product_emails: false },
    consentsUpdatedAt: { health_data: null, video_training: null, product_emails: null },
  };

  // Signed up with this release: every choice is on record
  const chosen: AgreementStatus = {
    ...AGREED,
    consentsUpdatedAt: { health_data: '2026-10-24', video_training: '2026-10-24', product_emails: '2026-10-24' },
  };

  const show = (status: AgreementStatus) => {
    agreements.apply(status);
    fixture = TestBed.createComponent(TermsUpdateScreenComponent);
    fixture.detectChanges();
  };

  beforeEach(() => {
    toastCtrl = jasmine.createSpyObj('ToastController', ['create']);
    toastCtrl.create.and.resolveTo({ present: () => Promise.resolve() } as never);
    account = jasmine.createSpyObj('AccountActionsService', ['logout', 'deleteAccount']);
    account.deleteAccount.and.resolveTo();
    TestBed.configureTestingModule({
      imports: [TermsUpdateScreenComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ToastController, useValue: toastCtrl },
        { provide: AccountActionsService, useValue: account },
      ],
    });
    agreements = TestBed.inject(AgreementsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const el = (): HTMLElement => fixture.nativeElement;
  const q = (selector: string) => el().querySelector(selector) as HTMLElement | null;
  const text = (selector: string) => q(selector)!.textContent!.replace(/\s+/g, ' ').trim();
  const continueButton = () => q('.continue-btn') as HTMLIonButtonElement;
  const tap = (selector: string, checked = true) => {
    q(selector)!.dispatchEvent(new CustomEvent('ionChange', { detail: { checked } }));
    fixture.detectChanges();
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve));
  // Continue asks for the current versions, then posts
  const expectAcceptance = async () => {
    http.expectOne(`${environment.apiUrl}/policies`).flush(POLICIES);
    await settle();
    return http.expectOne(`${environment.apiUrl}/users/me/acceptances`);
  };

  describe('first rollout', () => {
    beforeEach(() => show(firstRollout));

    it('is a dialog with the heading and intro', () => {
      expect(q('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
      expect(text('h1')).toBe("We've updated our terms");
      expect(text('#terms-text')).toBe(
        'LiftBig now has Terms of Use, and our Privacy Policy explains more: what we use your data for and why, ' +
          'your rights, and two new choices you can make. Please read them and confirm to keep using LiftBig.',
      );
    });

    it('asks for both boxes and offers the optional choices the user has not made', () => {
      expect(q('.terms-check')).toBeTruthy();
      expect(q('.health-check')).toBeTruthy();
      expect(el().querySelectorAll('ion-toggle').length).toBe(2);
    });

    it('keeps Continue disabled until both boxes are ticked', () => {
      expect(continueButton().disabled).toBeTrue();
      tap('.terms-check');
      expect(continueButton().disabled).toBeTrue();
      tap('.health-check');
      expect(continueButton().disabled).toBeFalse();
    });

    it('records every listed item and the choices shown, then goes', async () => {
      tap('.terms-check');
      tap('.health-check');
      tap('[data-purpose="video_training"]');
      continueButton().click();
      const req = await expectAcceptance();
      expect(req.request.body).toEqual({
        acceptTerms: { terms: POLICIES.termsVersion, privacy: POLICIES.privacyVersion },
        consents: {
          health_data: { granted: true, textVersion: CONSENT_TEXT_VERSIONS.health_data },
          video_training: { granted: true, textVersion: CONSENT_TEXT_VERSIONS.video_training },
          product_emails: { granted: false, textVersion: CONSENT_TEXT_VERSIONS.product_emails },
        },
      });
      req.flush({ ...AGREED, consents: { ...AGREED.consents, video_training: true } });
      expect(agreements.pending()).toEqual([]);
    });

    it('stays, with a message, when saving fails', async () => {
      tap('.terms-check');
      tap('.health-check');
      continueButton().click();
      (await expectAcceptance()).flush(null, { status: 0, statusText: 'Offline' });
      await settle();
      fixture.detectChanges();
      expect(agreements.pending()).toEqual(firstRollout.needsAcceptance);
      expect(continueButton().disabled).toBeFalse();
      expect(toastCtrl.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ message: "Couldn't save. Check your connection." }),
      );
    });

    it('offers only Log out and Delete account besides Continue', () => {
      const buttons = Array.from(el().querySelectorAll('ion-button')).map((b) => b.textContent!.trim());
      expect(buttons).toEqual(['Continue', 'Log out', 'Delete account']);
      (q('.logout-btn') as HTMLElement).click();
      expect(account.logout).toHaveBeenCalled();
      (q('.delete-btn') as HTMLElement).click();
      expect(account.deleteAccount).toHaveBeenCalled();
    });
  });

  it('leaves out the optional toggles once the user has made those choices', () => {
    show({ ...firstRollout, consentsUpdatedAt: { ...firstRollout.consentsUpdatedAt, video_training: '2026-10-01' } });
    const purposes = Array.from(el().querySelectorAll('ion-toggle')).map((t) => t.getAttribute('data-purpose'));
    expect(purposes).toEqual(['product_emails']);
  });

  it('names a Terms of Use change and asks only for that box', async () => {
    show({ ...chosen, needsAcceptance: ['terms'] });
    expect(text('h1')).toBe("We've updated our Terms of Use");
    expect(q('.terms-check')).toBeTruthy();
    expect(q('.health-check')).toBeNull();
    expect(q('ion-toggle')).toBeNull();
    tap('.terms-check');
    continueButton().click();
    const req = await expectAcceptance();
    expect(req.request.body).toEqual({ acceptTerms: { terms: POLICIES.termsVersion }, consents: {} });
    req.flush(AGREED);
  });

  it('shows a Privacy Policy change as a notice with a link and Continue, no box', async () => {
    show({ ...chosen, needsAcceptance: ['privacy'] });
    expect(text('h1')).toBe("We've updated our Privacy Policy");
    expect(q('ion-checkbox')).toBeNull();
    expect(q('.notice-link')?.getAttribute('href')).toBe(`${environment.apiUrl}/privacy`);
    expect(continueButton().disabled).toBeFalse();
    continueButton().click();
    const req = await expectAcceptance();
    expect(req.request.body).toEqual({ acceptTerms: { privacy: POLICIES.privacyVersion }, consents: {} });
    req.flush(AGREED);
  });

  it('links to the Privacy Policy whenever it is listed without the Terms box', () => {
    show({ ...chosen, needsAcceptance: ['privacy', 'health_data'] });
    expect(q('.terms-check')).toBeNull();
    expect(q('.notice-link')?.getAttribute('href')).toBe(`${environment.apiUrl}/privacy`);
  });

  it('has no separate link when the Terms box already links to the policy', () => {
    show(firstRollout);
    expect(q('.notice-link')).toBeNull();
  });

  it('says the terms changed after a 400, and the next Continue fetches the new versions', async () => {
    show({ ...chosen, needsAcceptance: ['privacy'] });
    continueButton().click();
    (await expectAcceptance()).flush({ message: 'out of date' }, { status: 400, statusText: 'Bad Request' });
    await settle();
    expect(toastCtrl.create).toHaveBeenCalledWith(
      jasmine.objectContaining({ message: 'LiftBig\'s terms have just changed. Please read them and try again.' }),
    );
    fixture.detectChanges();
    continueButton().click();
    (await expectAcceptance()).flush(AGREED);
    expect(agreements.pending()).toEqual([]);
  });

  describe('heading and intro by what is listed', () => {
    const cases: [AgreementStatus['needsAcceptance'], string, string][] = [
      [
        ['terms'],
        "We've updated our Terms of Use",
        "We've changed our Terms of Use. Please read them and tick the box to keep using LiftBig.",
      ],
      [
        ['privacy'],
        "We've updated our Privacy Policy",
        "We've changed our Privacy Policy. Please read what's new; there's nothing new to agree to.",
      ],
      [
        ['health_data'],
        'Please confirm how we use your training data',
        "We've reworded what you agree to about your training data. Please read it and tick the box to keep using LiftBig.",
      ],
      [
        ['terms', 'privacy'],
        "We've updated our terms",
        "We've changed some of what you agreed to. Please read the changes and confirm to keep using LiftBig.",
      ],
      [
        ['privacy', 'health_data'],
        "We've updated our terms",
        "We've changed some of what you agreed to. Please read the changes and confirm to keep using LiftBig.",
      ],
    ];

    for (const [listed, heading, intro] of cases) {
      it(`${listed.join(' + ')}: "${heading}"`, () => {
        show({ ...chosen, needsAcceptance: listed });
        expect(text('h1')).toBe(heading);
        expect(text('#terms-text')).toBe(intro);
      });
    }
  });

  it('asks only for the training data box when only its wording changed', () => {
    show({ ...chosen, needsAcceptance: ['health_data'] });
    expect(q('.terms-check')).toBeNull();
    expect(q('.health-check')).toBeTruthy();
    expect(continueButton().disabled).toBeTrue();
  });
});
