import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// Coaches have their own dashboard
export const clientDashboardGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  return authService.currentUser()?.role === 'COACH'
    ? inject(Router).parseUrl('/coach/dashboard')
    : true;
};
