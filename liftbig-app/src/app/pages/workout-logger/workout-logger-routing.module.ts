import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { WorkoutLoggerPage } from './workout-logger.page';

const routes: Routes = [
  {
    path: '',
    component: WorkoutLoggerPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class WorkoutLoggerPageRoutingModule {}
