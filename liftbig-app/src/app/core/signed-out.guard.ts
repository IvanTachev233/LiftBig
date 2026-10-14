import { Injectable, inject } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';

/** Sends a signed-in user from Login to their first tab, e.g. on a cold start */
@Injectable({
  providedIn: 'root',
})
export class SignedOutGuard implements CanActivate {
  private authService = inject(AuthService);
  private router = inject(Router);

  canActivate(): boolean | UrlTree {
    return this.authService.hasSession()
      ? this.router.parseUrl(this.authService.dashboardUrl())
      : true;
  }
}
