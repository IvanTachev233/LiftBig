import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NavigationBehaviorOptions, Router } from '@angular/router';

import { tap } from 'rxjs/operators';
import { jwtDecode } from 'jwt-decode';
import { environment } from '../../environments/environment';

export interface User {
  id: string;
  email: string;
  name?: string | null;
  role: 'COACH' | 'CLIENT';
  coachId?: string | null;
  /** Expiry of the access token, in seconds since the epoch */
  exp?: number;
}

export interface RegisterData {
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

  // State
  private tokenSignal = signal<string | null>(localStorage.getItem('token'));

  // Computed
  isAuthenticated = computed(() => !!this.tokenSignal());
  currentUser = computed(() => {
    const token = this.tokenSignal();
    if (!token) return null;
    try {
      return jwtDecode<User>(token);
    } catch {
      return null;
    }
  });

  dashboardUrl = computed(() =>
    this.currentUser()?.role === 'COACH' ? '/coach/clients' : '/today',
  );

  private apiUrl = `${environment.apiUrl}/auth`;

  login(credentials: { email: string; password: string }) {
    return this.http
      .post<{ access_token: string }>(`${this.apiUrl}/login`, credentials)
      .pipe(
        tap((response) => {
          this.setSession(response.access_token);
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
      .post<{ access_token: string }>(`${this.apiUrl}/verify-email`, { email, code })
      .pipe(tap((response) => this.setSession(response.access_token)));
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

  logout() {
    this.clearSession();
    this.router.navigate(['/login']);
  }

  /** A stored token that hasn't expired; an expired one is signed out */
  hasSession(): boolean {
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

  navigateToDashboard(extras?: NavigationBehaviorOptions) {
    return this.router.navigateByUrl(this.dashboardUrl(), extras);
  }

  setSession(token: string) {
    localStorage.setItem('token', token);
    this.tokenSignal.set(token);
  }

  getToken() {
    return this.tokenSignal();
  }

  private clearSession() {
    localStorage.removeItem('token');
    this.tokenSignal.set(null);
  }
}
