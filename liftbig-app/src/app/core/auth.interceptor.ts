import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService, SessionChangedError } from './auth.service';

// The endpoints that need no session: the auth ones answer 401 or 400 for a
// wrong password or code (not for the session), refresh and logout must not
// trigger a refresh of their own, and the version check needs no auth
const SESSION_FREE_URLS = [
  ...[
    'login',
    'register',
    'verify-email',
    'resend-verification',
    'forgot-password',
    'reset-password',
    'refresh',
    'logout',
  ].map((p) => `${environment.apiUrl}/auth/${p}`),
  `${environment.apiUrl}/app-config`,
];

// Refresh this long before the access token expires
const EXPIRY_MARGIN_MS = 30_000;

const isUnauthorized = (error: unknown) => error instanceof HttpErrorResponse && error.status === 401;

/**
 * Adds the access token. For the API, refreshes it shortly before it
 * expires or after a 401 and retries the request once; at most one
 * refresh per request.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const withToken = (token: string | null): HttpRequest<unknown> =>
    token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  if (!req.url.startsWith(environment.apiUrl) || SESSION_FREE_URLS.includes(req.url.split(/[?#]/)[0])) {
    return next(withToken(authService.getToken()));
  }

  if (authService.hasRefreshToken() && authService.accessTokenExpiresWithin(EXPIRY_MARGIN_MS)) {
    const current = authService.getToken();
    return authService.refresh().pipe(
      // Offline or a server error: try with the token we have
      catchError((error: unknown) =>
        isUnauthorized(error) || error instanceof SessionChangedError ? throwError(() => error) : of(current),
      ),
      switchMap((token) => next(withToken(token))),
    );
  }

  const token = authService.getToken();
  return next(withToken(token)).pipe(
    catchError((error: unknown) => {
      if (!isUnauthorized(error) || !authService.getToken()) {
        return throwError(() => error);
      }
      // A session from before refresh tokens can't be renewed
      if (!authService.hasRefreshToken()) {
        authService.logout();
        return throwError(() => error);
      }
      // Another request may have refreshed the token while this one was out
      const latest = authService.getToken();
      const newToken: Observable<string | null> = latest !== token ? of(latest) : authService.refresh();
      return newToken.pipe(
        // Logged out or signed in again meanwhile: this request stays unauthorized
        catchError((refreshError: unknown) =>
          throwError(() => (refreshError instanceof SessionChangedError ? error : refreshError)),
        ),
        switchMap((t) => next(withToken(t))),
      );
    }),
  );
};
