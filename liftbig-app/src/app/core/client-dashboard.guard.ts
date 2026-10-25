import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// Athlete screens: a coach goes to the route's coachUrl, else their Clients tab
export const clientDashboardGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  return authService.currentUser()?.role === 'COACH'
    ? inject(Router).parseUrl(route.data['coachUrl'] ?? authService.dashboardUrl())
    : true;
};
