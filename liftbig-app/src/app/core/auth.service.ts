import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

import { tap } from 'rxjs/operators';
import { jwtDecode } from 'jwt-decode';

export interface User {
  id: string;
  email: string;
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

  private apiUrl = '/api/auth'; // Env var in real app

  login(credentials: { email: string; password: string }) {
    return this.http
      .post<{ access_token: string }>(`${this.apiUrl}/login`, credentials)
      .pipe(
        tap((response) => {
          this.setSession(response.access_token);
        }),
      );
  }

  register(data: any) {
    return this.http
      .post<{ user: User; token: string }>(`${this.apiUrl}/register`, data)
      .pipe(
        tap((response) => {
          this.setSession(response.token);
        }),
      );
  }

  logout() {
    localStorage.removeItem('token');
    this.tokenSignal.set(null);
    this.router.navigate(['/login']);
  }

  private setSession(token: string) {
    localStorage.setItem('token', token);
    this.tokenSignal.set(token);
  }

  getToken() {
    return this.tokenSignal();
  }
}
