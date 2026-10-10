import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { ActiveWorkoutService } from '../../../core/active-workout.service';
import { Workout } from '../../../core/workout.service';

@Component({
  selector: 'app-resume-bar',
  templateUrl: './resume-bar.component.html',
  styleUrls: ['./resume-bar.component.scss'],
  standalone: true,
  imports: [DatePipe],
})
export class ResumeBarComponent {
  private router = inject(Router);
  readonly workout = inject(ActiveWorkoutService).workout;

  resume(workout: Workout) {
    this.router.navigate(['/workout-logger'], { queryParams: { id: workout.id } });
  }
}
