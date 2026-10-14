import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService } from './auth.service';
import { Workout, WorkoutService } from './workout.service';

/** The signed-in athlete's workout in progress, for the resume bar */
@Injectable({
  providedIn: 'root',
})
export class ActiveWorkoutService {
  private workoutService = inject(WorkoutService);
  private authService = inject(AuthService);

  // Result of the last refresh and whose list it came from
  private latest = signal<{ email: string; workout: Workout } | null>(null);
  private request?: Subscription;

  /** Newest IN_PROGRESS workout; null for a coach, after sign-out or for another athlete */
  readonly workout = computed(() => {
    const user = this.authService.currentUser();
    const latest = this.latest();
    return user?.role === 'CLIENT' && latest?.email === user.email ? latest.workout : null;
  });

  /** Reloads from GET /workouts; a newer refresh replaces one still loading */
  refresh() {
    this.request?.unsubscribe();
    const user = this.authService.currentUser();
    if (user?.role !== 'CLIENT') {
      this.latest.set(null);
      return;
    }
    this.request = this.workoutService.getAllWorkouts().subscribe({
      next: (workouts) => {
        const newest = workouts
          .filter((w) => w.status === 'IN_PROGRESS')
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        this.latest.set(newest ? { email: user.email, workout: newest } : null);
      },
      // Keeps the last result; the next tab visit retries
      error: () => undefined,
    });
  }

  /** Hides the workout once the logger has saved it as completed */
  completed(id: string) {
    if (this.latest()?.workout.id !== id) return;
    // A list requested before the completion would still show it
    this.request?.unsubscribe();
    this.latest.set(null);
  }
}
