import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { WorkoutLoggerPageRoutingModule } from './workout-logger-routing.module';

import { WorkoutLoggerPage } from './workout-logger.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    WorkoutLoggerPageRoutingModule,
    WorkoutLoggerPage,
  ],
  declarations: [],
})
export class WorkoutLoggerPageModule {}
