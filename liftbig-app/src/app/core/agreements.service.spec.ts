import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AgreementsService, CONSENT_TEXT_VERSIONS } from './agreements.service';
import { AGREED, POLICIES } from './agreements.testing';
import { APP_UPDATE_PLATFORM } from './app-update.service';

describe('AgreementsService', () => {
  let service: AgreementsService;
  let http: HttpTestingController;
  let versionCode: jasmine.Spy;
  const api = environment.apiUrl;

  beforeEach(() => {
    versionCode = jasmine.createSpy('versionCode').and.resolveTo(null);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_UPDATE_PLATFORM, useValue: { versionCode, onResume: () => Promise.resolve() } },
      ],
    });
    service = TestBed.inject(AgreementsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // Lets the version lookup (a promise) settle before the request goes out
  const settle = () => new Promise((resolve) => setTimeout(resolve));

  describe('status', () => {
    it('takes needsAcceptance and the consents from a profile payload', () => {
      service.apply({ id: 'u1', ...AGREED, needsAcceptance: ['terms'] });
      expect(service.pending()).toEqual(['terms']);
      expect(service.status()?.consents.health_data).toBeTrue();
    });

    it('leaves nothing pending for an API that sends no agreement fields', () => {
      service.apply({ id: 'u1' });
      expect(service.status()).toBeNull();
      expect(service.pending()).toEqual([]);
    });

    it('forgets the status on clear', () => {
      service.apply({ ...AGREED, needsAcceptance: ['terms', 'privacy', 'health_data'] });
      service.clear();
      expect(service.pending()).toEqual([]);
    });
  });

  describe('policies', () => {
    it('asks once and shares the answer', async () => {
      const first = firstValueFrom(service.policies());
      const second = firstValueFrom(service.policies());
      http.expectOne(`${api}/policies`).flush(POLICIES);
      expect(await first).toEqual(POLICIES);
      expect(await second).toEqual(POLICIES);
      await firstValueFrom(service.policies());
      http.expectNone(`${api}/policies`);
    });

    it('asks again after a failure', async () => {
      const failed = firstValueFrom(service.policies()).catch((e: unknown) => e);
      http.expectOne(`${api}/policies`).flush(null, { status: 0, statusText: 'Offline' });
      await failed;
      const retried = firstValueFrom(service.policies());
      http.expectOne(`${api}/policies`).flush(POLICIES);
      expect(await retried).toEqual(POLICIES);
    });
  });

  it('links to the pages the API serves', () => {
    expect(service.documentUrl('terms')).toBe(`${api}/terms`);
    expect(service.documentUrl('privacy')).toBe(`${api}/privacy`);
  });

  describe('signUpAgreement', () => {
    it('accepts the current documents and sends every consent with the wording version shown', async () => {
      const body = firstValueFrom(service.signUpAgreement({ video_training: true, product_emails: false }));
      http.expectOne(`${api}/policies`).flush(POLICIES);
      expect(await body).toEqual({
        acceptTerms: { terms: '2026-10-21', privacy: '2026-10-21' },
        consents: {
          health_data: { granted: true, textVersion: CONSENT_TEXT_VERSIONS.health_data },
          video_training: { granted: true, textVersion: CONSENT_TEXT_VERSIONS.video_training },
          product_emails: { granted: false, textVersion: CONSENT_TEXT_VERSIONS.product_emails },
        },
      });
    });

    it('adds the Android versionCode when there is one', async () => {
      versionCode.and.resolveTo(7);
      const body = firstValueFrom(service.signUpAgreement({ video_training: false, product_emails: false }));
      http.expectOne(`${api}/policies`).flush(POLICIES);
      expect((await body).appVersionCode).toBe(7);
    });
  });

  describe('accept', () => {
    it('records the listed documents, the training data consent and the choices shown', async () => {
      const result = firstValueFrom(
        service.accept({ documents: ['terms', 'privacy'], healthData: true, optional: { product_emails: true } }),
      );
      http.expectOne(`${api}/policies`).flush(POLICIES);
      await settle();
      const req = http.expectOne(`${api}/users/me/acceptances`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        acceptTerms: { terms: '2026-10-21', privacy: '2026-10-21' },
        consents: {
          health_data: { granted: true, textVersion: CONSENT_TEXT_VERSIONS.health_data },
          product_emails: { granted: true, textVersion: CONSENT_TEXT_VERSIONS.product_emails },
        },
      });
      req.flush({ id: 'u1', ...AGREED });
      await result;
      expect(service.pending()).toEqual([]);
    });

    it('records only what was listed, and keeps the status when it fails', async () => {
      service.apply({ ...AGREED, needsAcceptance: ['privacy'] });
      const result = firstValueFrom(service.accept({ documents: ['privacy'], healthData: false, optional: {} })).catch(
        (e: unknown) => e,
      );
      http.expectOne(`${api}/policies`).flush(POLICIES);
      await settle();
      const req = http.expectOne(`${api}/users/me/acceptances`);
      expect(req.request.body).toEqual({ acceptTerms: { privacy: '2026-10-21' }, consents: {} });
      req.flush(null, { status: 0, statusText: 'Offline' });
      await result;
      expect(service.pending()).toEqual(['privacy']);
    });
  });

  it('asks for the versions again after a 400, which means they changed', async () => {
    const first = firstValueFrom(service.accept({ documents: ['terms'], healthData: false, optional: {} })).catch(
      (e: unknown) => e,
    );
    http.expectOne(`${api}/policies`).flush(POLICIES);
    await settle();
    http
      .expectOne(`${api}/users/me/acceptances`)
      .flush({ message: 'Terms of Use version 2026-10-21 is out of date' }, { status: 400, statusText: 'Bad Request' });
    await first;

    const second = firstValueFrom(service.accept({ documents: ['terms'], healthData: false, optional: {} }));
    http.expectOne(`${api}/policies`).flush({ ...POLICIES, termsVersion: '2026-11-01' });
    await settle();
    const req = http.expectOne(`${api}/users/me/acceptances`);
    expect(req.request.body.acceptTerms).toEqual({ terms: '2026-11-01' });
    req.flush(AGREED);
    await second;
  });

  it('forgets the versions on request', async () => {
    const first = firstValueFrom(service.policies());
    http.expectOne(`${api}/policies`).flush(POLICIES);
    await first;
    service.forgetPolicies();
    const again = firstValueFrom(service.policies());
    http.expectOne(`${api}/policies`).flush(POLICIES);
    await again;
  });

  describe('setConsent', () => {
    it('saves one choice with the wording version and takes the new status', async () => {
      const result = firstValueFrom(service.setConsent('video_training', true));
      await settle();
      const req = http.expectOne(`${api}/users/me/consents/video_training`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ granted: true, textVersion: CONSENT_TEXT_VERSIONS.video_training });
      req.flush({ ...AGREED, consents: { ...AGREED.consents, video_training: true } });
      await result;
      expect(service.status()?.consents.video_training).toBeTrue();
    });
  });
});
