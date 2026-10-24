import { AgreementStatus, Policies } from './agreements.service';

/** A GET /policies answer */
export const POLICIES: Policies = {
  termsVersion: '2026-10-21',
  privacyVersion: '2026-10-21',
  consentTextVersions: { health_data: '2026-10-21', video_training: '2026-10-21', product_emails: '2026-10-21' },
  contactEmail: 'privacy@example.com',
};

/** The agreement fields of a user who has accepted everything current */
export const AGREED: AgreementStatus = {
  needsAcceptance: [],
  consents: { health_data: true, video_training: false, product_emails: false },
  consentsUpdatedAt: { health_data: '2026-10-24T09:00:00.000Z', video_training: null, product_emails: null },
};
