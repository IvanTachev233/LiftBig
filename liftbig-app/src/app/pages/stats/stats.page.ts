import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { WorkoutService, Workout } from '../../core/workout.service';
import { WorkoutListItemComponent } from '../../shared/components/workout-list-item/workout-list-item.component';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-stats',
  templateUrl: './stats.page.html',
  styleUrls: ['./stats.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, WorkoutListItemComponent],
})
export class StatsPage implements OnInit {
  workoutService = inject(WorkoutService);
  workouts: Workout[] | null = null;

  constructor() {}

  ngOnInit() {
    this.workoutService.getAllWorkouts().subscribe((workouts) => {
      this.workouts = workouts;
    });
  }

  onWorkoutDeleted(id: string) {
    this.workouts = this.workouts?.filter((workout) => workout.id !== id) ?? null;
  }
}
