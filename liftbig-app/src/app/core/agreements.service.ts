import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, forkJoin, from, map, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { APP_UPDATE_PLATFORM } from './app-update.service';

export type ConsentPurpose = 'health_data' | 'video_training' | 'product_emails';
export type OptionalPurpose = Exclude<ConsentPurpose, 'health_data'>;
export type PolicyDocument = 'terms' | 'privacy';
/** A document to accept (or be shown), or the training data consent to give */
export type PendingAgreement = PolicyDocument | 'health_data';

export const OPTIONAL_PURPOSES: readonly OptionalPurpose[] = ['video_training', 'product_emails'];

/**
 * The versions of the consent wordings this build shows (see
 * docs/privacy/consent-texts.md); the API refuses an outdated one, so a
 * wording change ships with a new build and a new version here.
 */
export const CONSENT_TEXT_VERSIONS: Record<ConsentPurpose, string> = {
  health_data: '2026-10-21',
  video_training: '2026-10-21',
  product_emails: '2026-10-21',
};

/** The agreement fields of the user payload */
export interface AgreementStatus {
  needsAcceptance: PendingAgreement[];
  consents: Record<ConsentPurpose, boolean>;
  /** When each was last given or withdrawn; null while the user has made no choice */
  consentsUpdatedAt: Record<ConsentPurpose, string | null>;
}

/** GET /policies */
export interface Policies {
  termsVersion: string;
  privacyVersion: string;
  consentTextVersions: Record<ConsentPurpose, string>;
  /** Where to ask for a copy of your data; null when the API has none set */
  contactEmail: string | null;
}

interface ConsentChoice {
  granted: boolean;
  textVersion: string;
}

/** What Sign up adds to the register body */
export interface SignUpAgreement {
  acceptTerms: Record<PolicyDocument, string>;
  consents: Record<ConsentPurpose, ConsentChoice>;
  appVersionCode?: number;
}

/** The boxes and toggles on Sign up and the "We've updated our terms" screen */
export interface AgreementChoices extends Record<OptionalPurpose, boolean> {
  terms: boolean;
  health_data: boolean;
}

export const NO_CHOICES: AgreementChoices = {
  terms: false,
  health_data: false,
  video_training: false,
  product_emails: false,
};

/** What the "We've updated our terms" screen listed and the user confirmed */
export interface Acceptance {
  documents: PolicyDocument[];
  healthData: boolean;
  optional: Partial<Record<OptionalPurpose, boolean>>;
}

/**
 * The signed-in user's terms acceptance and consents, from the profile
 * payload (ProfileService applies every answer), and the calls that change
 * them. Nothing is pending until a payload says so, so an app that can't
 * reach the API opens as usual.
 */
@Injectable({ providedIn: 'root' })
export class AgreementsService {
  private http = inject(HttpClient);
  private platform = inject(APP_UPDATE_PLATFORM);
  private policies$?: Observable<Policies>;

  readonly status = signal<AgreementStatus | null>(null);
  readonly pending = computed(() => this.status()?.needsAcceptance ?? []);

  /** Takes the agreement fields of a payload; one without them (an older API) leaves nothing pending */
  apply(payload: object) {
    const { needsAcceptance, consents, consentsUpdatedAt } = payload as Partial<AgreementStatus>;
    if (!Array.isArray(needsAcceptance) || !consents || !consentsUpdatedAt) return;
    this.status.set({ needsAcceptance, consents, consentsUpdatedAt });
  }

  clear() {
    this.status.set(null);
  }

  /** The current versions; asked once, and again after a failure */
  policies(): Observable<Policies> {
    this.policies$ ??= this.http.get<Policies>(`${environment.apiUrl}/policies`).pipe(
      catchError((error: unknown) => {
        this.policies$ = undefined;
        return throwError(() => error);
      }),
      shareReplay(1),
    );
    return this.policies$;
  }

  /** Asks for the versions again next time; after a 400 they may have changed */
  forgetPolicies() {
    this.policies$ = undefined;
  }

  /** The page the API serves; links open it in the browser */
  documentUrl(document: PolicyDocument): string {
    return `${environment.apiUrl}/${document}`;
  }

  /** The current documents and every consent, the training data one granted */
  signUpAgreement(optional: Record<OptionalPurpose, boolean>): Observable<SignUpAgreement> {
    return forkJoin([this.policies(), this.versionCode()]).pipe(
      map(([policies, appVersionCode]) => ({
        acceptTerms: { terms: policies.termsVersion, privacy: policies.privacyVersion },
        consents: {
          health_data: choice('health_data', true),
          video_training: choice('video_training', optional.video_training),
          product_emails: choice('product_emails', optional.product_emails),
        },
        ...(appVersionCode === null ? {} : { appVersionCode }),
      })),
    );
  }

  /** Records what the update screen listed, at the current versions */
  accept({ documents, healthData, optional }: Acceptance): Observable<AgreementStatus> {
    return forkJoin([this.policies(), this.versionCode()]).pipe(
      switchMap(([policies, appVersionCode]) => {
        const versions = { terms: policies.termsVersion, privacy: policies.privacyVersion };
        const acceptTerms: Partial<Record<PolicyDocument, string>> = {};
        for (const document of documents) acceptTerms[document] = versions[document];
        const consents: Partial<Record<ConsentPurpose, ConsentChoice>> = {};
        if (healthData) consents.health_data = choice('health_data', true);
        for (const purpose of OPTIONAL_PURPOSES) {
          const granted = optional[purpose];
          if (granted !== undefined) consents[purpose] = choice(purpose, granted);
        }
        return this.http.post<AgreementStatus>(`${environment.apiUrl}/users/me/acceptances`, {
          acceptTerms,
          consents,
          ...(appVersionCode === null ? {} : { appVersionCode }),
        });
      }),
      tap((payload) => this.apply(payload)),
      catchError((error: unknown) => {
        if (isOutdated(error)) this.forgetPolicies();
        return throwError(() => error);
      }),
    );
  }

  /** Gives or withdraws one optional consent */
  setConsent(purpose: OptionalPurpose, granted: boolean): Observable<AgreementStatus> {
    return this.http
      .put<AgreementStatus>(`${environment.apiUrl}/users/me/consents/${purpose}`, choice(purpose, granted))
      .pipe(tap((payload) => this.apply(payload)));
  }

  // The installed Android build, or null (web, iOS, or no answer)
  private versionCode(): Observable<number | null> {
    return from(this.platform.versionCode()).pipe(catchError(() => of(null)));
  }
}

/** The API's answer to a version that is no longer current ("... is out of date") */
export function isOutdated(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse) || error.status !== 400) return false;
  const message: unknown = (error.error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message.endsWith('is out of date');
}

function choice(purpose: ConsentPurpose, granted: boolean): ConsentChoice {
  return { granted, textVersion: CONSENT_TEXT_VERSIONS[purpose] };
}
