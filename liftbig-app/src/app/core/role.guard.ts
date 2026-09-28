import { Injectable, inject } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class RoleGuard implements CanActivate {
  private authService = inject(AuthService);

  canActivate(route: ActivatedRouteSnapshot): boolean {
    const requiredRole = route.data['role'];
    const user = this.authService.currentUser();

    if (!requiredRole || user?.role === requiredRole) {
      return true;
    }

    this.authService.navigateToDashboard();
    return false;
  }
}
