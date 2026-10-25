import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService } from './auth.service';
import { ReadCacheService } from './read-cache.service';
import { WorkoutCopyService } from './workout-copy.service';
import { Workout, WorkoutService } from './workout.service';

/** The signed-in athlete's workout in progress, for the resume bar */
@Injectable({
  providedIn: 'root',
})
export class ActiveWorkoutService {
  private workoutService = inject(WorkoutService);
  private authService = inject(AuthService);
  private copies = inject(WorkoutCopyService);
  private cache = inject(ReadCacheService);

  // IN_PROGRESS workouts from the last refresh and whose list it came from
  private latest = signal<{ email: string; workouts: Workout[] } | null>(null);
  private request?: Subscription;

  /**
   * Newest IN_PROGRESS workout, counting this phone's copies of workouts
   * with changes still waiting; null for a coach, after sign-out or for
   * another athlete
   */
  readonly workout = computed(() => {
    const user = this.authService.currentUser();
    if (user?.role !== 'CLIENT') return null;
    const latest = this.latest();
    const listed = latest?.email === user.email ? latest.workouts : [];
    return newestInProgress(this.copies.overlay(listed));
  });

  /** Reloads from GET /workouts; a newer refresh replaces one still loading */
  refresh() {
    this.request?.unsubscribe();
    const user = this.authService.currentUser();
    if (user?.role !== 'CLIENT') {
      this.latest.set(null);
      return;
    }
    // Without a connection, the list last loaded on this phone
    this.request = this.cache.read('workouts', this.workoutService.getAllWorkouts()).subscribe({
      next: (workouts) =>
        this.latest.set({ email: user.email, workouts: workouts.filter((w) => w.status === 'IN_PROGRESS') }),
      // Keeps the last result; the next tab visit retries
      error: () => undefined,
    });
  }

  /** Hides the workout once the logger has saved it as completed */
  completed(id: string) {
    const latest = this.latest();
    if (!latest?.workouts.some((w) => w.id === id)) return;
    // A list requested before the completion would still show it
    this.request?.unsubscribe();
    this.latest.set({ ...latest, workouts: latest.workouts.filter((w) => w.id !== id) });
  }
}

function newestInProgress(workouts: Workout[]): Workout | null {
  return (
    workouts
      .filter((w) => w.status === 'IN_PROGRESS')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? null
  );
}
