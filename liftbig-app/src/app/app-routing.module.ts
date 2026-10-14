import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

import { AuthGuard } from './core/auth.guard';
import { RoleGuard } from './core/role.guard';
import { SignedOutGuard } from './core/signed-out.guard';
import { clientDashboardGuard } from './core/client-dashboard.guard';

export const routes: Routes = [
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
    canActivate: [SignedOutGuard],
    loadComponent: () =>
      import('./pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./pages/register/register.page').then((m) => m.RegisterPage),
  },
  // Old URLs
  { path: 'dashboard', redirectTo: 'today', pathMatch: 'full' },
  { path: 'stats', redirectTo: 'history', pathMatch: 'full' },
  { path: 'coach/dashboard', redirectTo: 'coach/clients', pathMatch: 'full' },
  // Athlete tabs; listed before programs/:id so programs/active stays a tab
  {
    path: '',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./pages/tabs/athlete-tabs.page').then((m) => m.AthleteTabsPage),
    children: [
      {
        path: 'today',
        canActivate: [clientDashboardGuard],
        loadChildren: () =>
          import('./pages/dashboard/dashboard.module').then(
            (m) => m.DashboardPageModule,
          ),
      },
      // Premade programs (clients only)
      {
        path: 'programs',
        canActivate: [AuthGuard, RoleGuard],
        data: { role: 'CLIENT' },
        loadComponent: () =>
          import('./pages/programs/programs.page').then((m) => m.ProgramsPage),
      },
      {
        path: 'programs/active',
        canActivate: [AuthGuard, RoleGuard],
        data: { role: 'CLIENT' },
        loadComponent: () =>
          import('./pages/active-program/active-program.page').then(
            (m) => m.ActiveProgramPage,
          ),
      },
      {
        path: 'history',
        canActivate: [clientDashboardGuard],
        loadChildren: () =>
          import('./pages/stats/stats.module').then((m) => m.StatsPageModule),
      },
      {
        path: 'history/lifts/:exerciseId',
        canActivate: [clientDashboardGuard],
        loadComponent: () =>
          import('./pages/exercise-detail/exercise-detail.page').then(
            (m) => m.ExerciseDetailPage,
          ),
      },
      {
        path: 'profile',
        canActivate: [clientDashboardGuard],
        data: { coachUrl: '/coach/profile' },
        loadComponent: () =>
          import('./pages/profile/profile.page').then((m) => m.ProfilePage),
      },
    ],
  },
  // Full-screen athlete screens (no tab bar)
  {
    path: 'workout-logger',
    canActivate: [AuthGuard, clientDashboardGuard],
    loadChildren: () =>
      import('./pages/workout-logger/workout-logger.module').then(
        (m) => m.WorkoutLoggerPageModule,
      ),
  },
  {
    path: 'programs/:id',
    canActivate: [AuthGuard, RoleGuard],
    data: { role: 'CLIENT' },
    loadComponent: () =>
      import('./pages/program-detail/program-detail.page').then(
        (m) => m.ProgramDetailPage,
      ),
  },
  // Coach tabs
  {
    path: 'coach',
    canActivate: [AuthGuard, RoleGuard],
    data: { role: 'COACH' },
    loadComponent: () =>
      import('./pages/tabs/coach-tabs.page').then((m) => m.CoachTabsPage),
    children: [
      { path: '', redirectTo: 'clients', pathMatch: 'full' },
      {
        path: 'clients',
        loadComponent: () =>
          import('./pages/coach-dashboard/coach-dashboard.page').then(
            (m) => m.CoachDashboardPage,
          ),
      },
      {
        path: 'clients/:clientId/workouts',
        loadComponent: () =>
          import(
            './pages/coach-client-workouts/coach-client-workouts.page'
          ).then((m) => m.CoachClientWorkoutsPage),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./pages/profile/profile.page').then((m) => m.ProfilePage),
      },
    ],
  },
  // Full-screen coach screens (no tab bar)
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
