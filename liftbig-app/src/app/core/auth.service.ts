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

  register(data: RegisterData) {
    return this.http
      .post<{ user: User; token: string }>(`${this.apiUrl}/register`, data)
      .pipe(
        tap((response) => {
          this.setSession(response.token);
        }),
      );
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
