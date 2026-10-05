import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

import { AuthGuard } from './core/auth.guard';
import { RoleGuard } from './core/role.guard';

const routes: Routes = [
  {
    path: 'home',
    loadChildren: () =>
      import('./home/home.module').then((m) => m.HomePageModule),
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./pages/register/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'dashboard',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./pages/dashboard/dashboard.module').then(
        (m) => m.DashboardPageModule,
      ),
  },
  {
    path: 'workout-logger',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./pages/workout-logger/workout-logger.module').then(
        (m) => m.WorkoutLoggerPageModule,
      ),
  },
  {
    path: 'stats',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./pages/stats/stats.module').then((m) => m.StatsPageModule),
  },
  // Coach routes
  {
    path: 'coach/dashboard',
    canActivate: [AuthGuard, RoleGuard],
    data: { role: 'COACH' },
    loadComponent: () =>
      import('./pages/coach-dashboard/coach-dashboard.page').then(
        (m) => m.CoachDashboardPage,
      ),
  },
  {
    path: 'coach/clients/:clientId/workouts',
    canActivate: [AuthGuard, RoleGuard],
    data: { role: 'COACH' },
    loadComponent: () =>
      import('./pages/coach-client-workouts/coach-client-workouts.page').then(
        (m) => m.CoachClientWorkoutsPage,
      ),
  },
  {
    path: 'coach/clients/:clientId/workouts/new',
    canActivate: [AuthGuard, RoleGuard],
    data: { role: 'COACH' },
    loadComponent: () =>
      import('./pages/coach-workout-editor/coach-workout-editor.page').then(
        (m) => m.CoachWorkoutEditorPage,
      ),
  },
  {
    path: 'coach/workouts/:id',
    canActivate: [AuthGuard, RoleGuard],
    data: { role: 'COACH' },
    loadComponent: () =>
      import('./pages/coach-workout-editor/coach-workout-editor.page').then(
        (m) => m.CoachWorkoutEditorPage,
      ),
  },
  // Accept invite (any authenticated user)
  {
    path: 'accept-invite/:token',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./pages/accept-invite/accept-invite.page').then(
        (m) => m.AcceptInvitePage,
      ),
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules }),
  ],
  exports: [RouterModule],
})
export class AppRoutingModule {}
