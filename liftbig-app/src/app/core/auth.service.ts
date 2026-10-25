import { Injectable, InjectionToken, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { NavigationBehaviorOptions, Router } from '@angular/router';
import { AlertController } from '@ionic/angular';

import { Observable, ReplaySubject, Subject, catchError, map, share, tap, throwError } from 'rxjs';
import { jwtDecode } from 'jwt-decode';
import { environment } from '../../environments/environment';
import type { SignUpAgreement } from './agreements.service';
import { TokenStore } from './token-store';

interface SessionResponse {
  access_token: string;
  refresh_token?: string;
}

export interface User {
  id: string;
  email: string;
  name?: string | null;
  role: 'COACH' | 'CLIENT';
  coachId?: string | null;
  /** Expiry of the access token, in seconds since the epoch */
  exp?: number;
}

/** A refresh answered after the session it was for was logged out or replaced */
export class SessionChangedError extends Error {
  constructor() {
    super('The session changed during a refresh');
    this.name = 'SessionChangedError';
  }
}

/** The line under "Your session ended" when changes are still waiting to be sent */
export function sessionEndedMessage(pendingChanges: number): string | undefined {
  if (pendingChanges <= 0) return undefined;
  const changes = pendingChanges === 1 ? 'change' : 'changes';
  return `${pendingChanges} ${changes} from this phone will be saved after you log in.`;
}

/**
 * Counts a user's changes still waiting on this device. OutboxService fills
 * it in, so AuthService needn't depend on the outbox (which depends on it).
 */
export const PENDING_CHANGES = new InjectionToken<{ countFor: (userId: string) => number }>('PENDING_CHANGES', {
  providedIn: 'root',
  factory: () => ({ countFor: () => 0 }),
});

export interface RegisterData extends SignUpAgreement {
  name: string;
  email: string;
  password: string;
  role: 'COACH' | 'CLIENT';
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private tokenStore = inject(TokenStore);
  private alertController = inject(AlertController);
  private pendingChanges = inject(PENDING_CHANGES);

  // State
  private tokenSignal = signal<string | null>(null);
  private refreshTokenSignal = signal<string | null>(null);
  private refreshing: Observable<string> | null = null;
  private sessionUpdates = new Subject<void>();

  /** Emits after a sign-in or a refresh stores a new token pair */
  readonly sessionUpdated$ = this.sessionUpdates.asObservable();

  // Computed
  isAuthenticated = computed(() => !!this.tokenSignal());
  currentUser = computed(() => {
    const token = this.tokenSignal();
    if (!token) return null;
    try {
      // The API signs the user id as the subject
      const claims = jwtDecode<User & { sub?: string }>(token);
      return { ...claims, id: claims.id ?? claims.sub } as User;
    } catch {
      return null;
    }
  });

  dashboardUrl = computed(() =>
    this.currentUser()?.role === 'COACH' ? '/coach/clients' : '/today',
  );

  private apiUrl = `${environment.apiUrl}/auth`;

  /** Loads a session kept from a previous run, before routing starts */
  async restore(): Promise<void> {
    const [accessToken, refreshToken] = await Promise.all([
      this.tokenStore.getAccessToken(),
      this.tokenStore.getRefreshToken(),
    ]);
    // A sign-in while storage was being read is newer than what it holds
    if (this.tokenSignal() || this.refreshTokenSignal()) return;
    if (accessToken || refreshToken) {
      this.tokenSignal.set(accessToken);
      this.refreshTokenSignal.set(refreshToken);
      return;
    }
    // An app build before refresh tokens kept only an access token in
    // localStorage; it's good until it expires, then the user logs in once
    const legacy = this.tokenStore.getLegacyAccessToken();
    if (legacy) {
      this.tokenSignal.set(legacy);
    }
  }

  login(credentials: { email: string; password: string }) {
    return this.http
      .post<SessionResponse>(`${this.apiUrl}/login`, credentials)
      .pipe(
        tap((response) => {
          this.setSession(response.access_token, response.refresh_token);
        }),
      );
  }

  /** Creates the account; the API mails a code and signs in only on verifyEmail */
  register(data: RegisterData) {
    return this.http.post<{ verificationRequired: true; email: string }>(`${this.apiUrl}/register`, data);
  }

  /** Confirms the email with the mailed code and stores the session */
  verifyEmail(email: string, code: string) {
    return this.http
      .post<SessionResponse>(`${this.apiUrl}/verify-email`, { email, code })
      .pipe(tap((response) => this.setSession(response.access_token, response.refresh_token)));
  }

  /** Asks for a new code; 429 carries retryAfterSeconds */
  resendVerification(email: string) {
    return this.http.post<void>(`${this.apiUrl}/resend-verification`, { email });
  }

  /** Asks for a password reset code; the API answers the same for any email */
  forgotPassword(email: string) {
    return this.http.post<void>(`${this.apiUrl}/forgot-password`, { email });
  }

  /** Sets a new password with the mailed code; signs out every device and doesn't sign in */
  resetPassword(email: string, code: string, newPassword: string) {
    return this.http.post<void>(`${this.apiUrl}/reset-password`, { email, code, newPassword });
  }

  /** Revokes the session on the API, best effort, and signs out locally either way */
  logout() {
    const refreshToken = this.refreshTokenSignal();
    if (refreshToken) {
      this.http
        .post<void>(`${this.apiUrl}/logout`, { refresh_token: refreshToken })
        .subscribe({ error: () => undefined });
    }
    this.clearSession();
    this.router.navigate(['/login']);
  }

  /**
   * True while a refresh token exists, even if the access token has
   * expired; with no refresh token (a legacy session), only while the
   * access token itself hasn't expired
   */
  hasSession(): boolean {
    if (this.refreshTokenSignal()) return true;
    const user = this.currentUser();
    if (!user) {
      if (this.tokenSignal()) this.clearSession();
      return false;
    }
    if (user.exp !== undefined && user.exp * 1000 <= Date.now()) {
      this.clearSession();
      return false;
    }
    return true;
  }

  hasRefreshToken(): boolean {
    return !!this.refreshTokenSignal();
  }

  /** True when there is no usable access token or it expires within `ms` */
  accessTokenExpiresWithin(ms: number): boolean {
    const user = this.currentUser();
    if (!user) return true;
    return user.exp !== undefined && user.exp * 1000 - Date.now() < ms;
  }

  /**
   * Swaps the refresh token for a new pair and emits the new access token.
   * Callers at the same time share one call, which completes even if they
   * unsubscribe. Errors pass through; only a 401 ends the session. If the
   * session is logged out or replaced meanwhile, the answer changes nothing
   * and callers get SessionChangedError instead of a token.
   */
  refresh(): Observable<string> {
    const refreshToken = this.refreshTokenSignal();
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token'));
    }
    if (this.refreshing) return this.refreshing;
    const sameSession = () => this.refreshTokenSignal() === refreshToken;
    const flight: Observable<string> = this.http
      .post<SessionResponse>(`${this.apiUrl}/refresh`, { refresh_token: refreshToken })
      .pipe(
        map((response) => {
          if (this.refreshing === flight) this.refreshing = null;
          if (!sameSession()) throw new SessionChangedError();
          this.setSession(response.access_token, response.refresh_token);
          return response.access_token;
        }),
        catchError((error: unknown) => {
          if (this.refreshing === flight) this.refreshing = null;
          if (error instanceof HttpErrorResponse && error.status === 401 && sameSession()) {
            void this.endSession();
          }
          return throwError(() => error);
        }),
        share({
          connector: () => new ReplaySubject(1),
          resetOnError: false,
          resetOnComplete: false,
          resetOnRefCountZero: false,
        }),
      );
    this.refreshing = flight;
    return flight;
  }

  navigateToDashboard(extras?: NavigationBehaviorOptions) {
    return this.router.navigateByUrl(this.dashboardUrl(), extras);
  }

  /**
   * A missing refresh token (e.g. acceptInvite) keeps whichever one is already
   * stored. The refresh token is stored first: if the app is killed between
   * the two writes, storage keeps the new refresh token with the previous
   * access token, which a restore can renew; the other way round it would
   * keep the replaced refresh token, which the API takes as reuse and ends
   * the session.
   */
  setSession(accessToken: string, refreshToken?: string) {
    this.tokenSignal.set(accessToken);
    if (refreshToken) {
      this.refreshing = null;
      this.refreshTokenSignal.set(refreshToken);
      void this.tokenStore.setRefreshToken(refreshToken);
    }
    void this.tokenStore.setAccessToken(accessToken);
    this.tokenStore.clearLegacyAccessToken();
    if (refreshToken) this.sessionUpdates.next();
  }

  getToken() {
    return this.tokenSignal();
  }

  /** The API ended the session: say so, then open Login with the email filled in */
  private async endSession() {
    const user = this.currentUser();
    const email = user?.email;
    const pendingChanges = user?.id ? this.pendingChanges.countFor(user.id) : 0;
    this.clearSession();
    try {
      const alert = await this.alertController.create({
        header: 'Your session ended',
        message: sessionEndedMessage(pendingChanges),
        buttons: ['Log in again'],
        backdropDismiss: false,
      });
      await alert.present();
      await alert.onDidDismiss();
    } catch {
      // Login still opens if the alert can't be shown
    }
    await this.router.navigate(['/login'], {
      queryParams: email ? { email } : {},
      replaceUrl: true,
    });
  }

  private clearSession() {
    this.refreshing = null;
    this.tokenSignal.set(null);
    this.refreshTokenSignal.set(null);
    void this.tokenStore.clear();
  }
}
