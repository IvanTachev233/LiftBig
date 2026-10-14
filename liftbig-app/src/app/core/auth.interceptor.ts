import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

// Log in and sign up answer 401 for a wrong password, not for the session
const SIGN_IN_URLS = ['/auth/login', '/auth/register'].map((p) => environment.apiUrl + p);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();

  const authReq = token
    ? req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      })
    : req;

  // An expired or revoked token signs the user out
  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        req.url.startsWith(environment.apiUrl) &&
        !SIGN_IN_URLS.includes(req.url) &&
        authService.getToken()
      ) {
        authService.logout();
      }
      return throwError(() => error);
    }),
  );
};
