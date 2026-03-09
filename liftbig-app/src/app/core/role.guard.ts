import { Injectable, inject } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class RoleGuard implements CanActivate {
  private authService = inject(AuthService);
  private router = inject(Router);

  canActivate(route: ActivatedRouteSnapshot): boolean {
    const requiredRole = route.data['role'];
    const user = this.authService.currentUser();

    if (!requiredRole || user?.role === requiredRole) {
      return true;
    }

    // Redirect to appropriate dashboard based on role
    if (user?.role === 'COACH') {
      this.router.navigate(['/coach/dashboard']);
    } else {
      this.router.navigate(['/dashboard']);
    }
    return false;
  }
}
