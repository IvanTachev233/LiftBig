import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { WorkoutService, Workout } from '../../core/workout.service';
import { WorkoutCardComponent } from '../../shared/components/workout-card/workout-card.component';
import { Observable } from 'rxjs';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-stats',
  templateUrl: './stats.page.html',
  styleUrls: ['./stats.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, WorkoutCardComponent],
})
export class StatsPage implements OnInit {
  workoutService = inject(WorkoutService);
  workouts$: Observable<Workout[]> | undefined;

  constructor() {}

  ngOnInit() {
    this.workouts$ = this.workoutService.getAllWorkouts();
  }
}
