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
    loadChildren: () =>
      import('./pages/login/login.module').then((m) => m.LoginPageModule),
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
    path: 'coach/programs/:clientId',
    canActivate: [AuthGuard, RoleGuard],
    data: { role: 'COACH' },
    loadComponent: () =>
      import('./pages/coach-programs/coach-programs.page').then(
        (m) => m.CoachProgramsPage,
      ),
  },
  {
    path: 'coach/program-editor',
    canActivate: [AuthGuard, RoleGuard],
    data: { role: 'COACH' },
    loadComponent: () =>
      import('./pages/program-editor/program-editor.page').then(
        (m) => m.ProgramEditorPage,
      ),
  },
  {
    path: 'coach/program-editor/:id',
    canActivate: [AuthGuard, RoleGuard],
    data: { role: 'COACH' },
    loadComponent: () =>
      import('./pages/program-editor/program-editor.page').then(
        (m) => m.ProgramEditorPage,
      ),
  },
  // Client program routes
  {
    path: 'program-logger/:id',
    canActivate: [AuthGuard, RoleGuard],
    data: { role: 'CLIENT' },
    loadComponent: () =>
      import('./pages/program-logger/program-logger.page').then(
        (m) => m.ProgramLoggerPage,
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
