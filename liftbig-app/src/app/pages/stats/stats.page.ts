import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ViewWillEnter } from '@ionic/angular';
import { WorkoutService, Workout } from '../../core/workout.service';
import { WorkoutListItemComponent } from '../../shared/components/workout-list-item/workout-list-item.component';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-stats',
  templateUrl: './stats.page.html',
  styleUrls: ['./stats.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, WorkoutListItemComponent],
})
export class StatsPage implements ViewWillEnter {
  workoutService = inject(WorkoutService);
  dashboardUrl = inject(AuthService).dashboardUrl;
  workouts: Workout[] | null = null;

  constructor() {}

  // Runs on every visit; cached pages don't re-run ngOnInit
  ionViewWillEnter() {
    this.workoutService.getAllWorkouts().subscribe((workouts) => {
      this.workouts = workouts;
    });
  }

  onWorkoutDeleted(id: string) {
    this.workouts = this.workouts?.filter((workout) => workout.id !== id) ?? null;
  }
}
