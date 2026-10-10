import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ViewWillEnter } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { WorkoutService, Workout } from '../../core/workout.service';
import { WorkoutListItemComponent } from '../../shared/components/workout-list-item/workout-list-item.component';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, WorkoutListItemComponent],
})
export class DashboardPage implements ViewWillEnter {
  private workoutService = inject(WorkoutService);

  // Own and coach-assigned workouts, soonest first
  upcomingWorkouts: Workout[] | null = null;

  // Runs on every visit; cached pages don't re-run ngOnInit
  ionViewWillEnter() {
    this.loadUpcoming();
  }

  private loadUpcoming() {
    this.workoutService.getUpcoming().subscribe((workouts) => {
      this.upcomingWorkouts = [...workouts].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
    });
  }

  onWorkoutDeleted(id: string) {
    this.upcomingWorkouts =
      this.upcomingWorkouts?.filter((workout) => workout.id !== id) ?? null;
  }
}
