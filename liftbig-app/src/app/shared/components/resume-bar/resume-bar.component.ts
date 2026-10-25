import { Component, LOCALE_ID, inject } from '@angular/core';
import { formatDate } from '@angular/common';
import { Router } from '@angular/router';
import { ActiveWorkoutService } from '../../../core/active-workout.service';
import { localDay } from '../../../core/local-date';
import { Workout } from '../../../core/workout.service';

@Component({
  selector: 'app-resume-bar',
  templateUrl: './resume-bar.component.html',
  styleUrls: ['./resume-bar.component.scss'],
  standalone: true,
})
export class ResumeBarComponent {
  private router = inject(Router);
  private locale = inject(LOCALE_ID);
  readonly workout = inject(ActiveWorkoutService).workout;

  /** "Started 18:05" today, "Started Fri 9 Oct, 18:05" earlier; the workout's day without a start time */
  startedText(workout: Workout): string {
    const format = (value: string, pattern: string) => formatDate(value, pattern, this.locale);
    const started = workout.startedAt;
    if (!started) return `Started ${format(workout.date, 'EEE d MMM')}`;
    const today = localDay() === localDay(new Date(started));
    return `Started ${format(started, today ? 'HH:mm' : 'EEE d MMM, HH:mm')}`;
  }

  resume(workout: Workout) {
    this.router.navigate(['/workout-logger'], { queryParams: { id: workout.id } });
  }
}
