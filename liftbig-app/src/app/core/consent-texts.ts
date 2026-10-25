import { OptionalPurpose } from './agreements.service';

// Wording approved in docs/privacy/consent-texts.md; a change here needs a
// new version in CONSENT_TEXT_VERSIONS

export const HEALTH_DATA_STATEMENT =
  'I agree that LiftBig stores and uses my training data, such as workouts, lifts and notes, ' +
  'to run the app and to show it to a coach I link to. This data can say something about my health.';

export const OPTIONAL_CONSENT_TEXTS: Record<OptionalPurpose, { title: string; text: string }> = {
  video_training: {
    title: 'Help improve lift analysis',
    text:
      "When you upload videos, LiftBig may use them, and what's measured from them, to train and improve " +
      "its lift analysis. Video isn't in the app yet; this applies once it is.",
  },
  product_emails: {
    title: 'News and offers by email',
    text: 'Occasional emails about LiftBig. Unsubscribe any time.',
  },
};

/** The toast after a toggle in Profile → Privacy is saved */
export const CONSENT_SAVED: Record<OptionalPurpose, Record<'on' | 'off', string>> = {
  video_training: { on: 'Video training turned on.', off: 'Video training turned off.' },
  product_emails: { on: 'Emails turned on.', off: 'Emails turned off.' },
};
