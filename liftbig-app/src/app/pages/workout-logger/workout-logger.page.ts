import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { WorkoutService } from '../../core/workout.service';
import { Observable, switchMap, BehaviorSubject } from 'rxjs';

interface ExerciseGroup {
  exerciseId: string;
  exerciseName: string;
  sets: any[];
  newWeight: number | null;
  newReps: number | null;
}

@Component({
  selector: 'app-workout-logger',
  templateUrl: './workout-logger.page.html',
  styleUrls: ['./workout-logger.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, FormsModule],
})
export class WorkoutLoggerPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private workoutService = inject(WorkoutService);

  workout$: Observable<any> | undefined;
  exercises$: Observable<any[]> | undefined;

  selectedExerciseId: string = '';
  workoutName: string = '';
  exercisesList: any[] = [];
  groupedSets: ExerciseGroup[] = [];

  workoutSubject = new BehaviorSubject<any>(null);

  ngOnInit() {
    this.exercises$ = this.workoutService.getExercises();
    this.exercises$.subscribe((exs) => (this.exercisesList = exs));

    this.workout$ = this.route.queryParams.pipe(
      switchMap((params) => {
        const id = params['id'];
        if (id) {
          return this.workoutService.getWorkout(id);
        } else {
          const newWorkout = {
            name: 'New Workout',
            date: new Date().toISOString(),
            status: 'IN_PROGRESS',
            sets: [],
          };
          return this.workoutService
            .createWorkout(newWorkout)
            .pipe(
              switchMap((created: any) =>
                this.workoutService.getWorkout(created.id),
              ),
            );
        }
      }),
    );

    this.workout$.subscribe((w) => {
      this.workoutSubject.next(w);
      if (w) {
        this.workoutName = w.name;
        this.buildGroups(w.sets || []);
      }
    });
  }

  private buildGroups(sets: any[]) {
    const map = new Map<string, ExerciseGroup>();
    for (const set of sets) {
      const id = set.exercise?.id || set.exerciseId;
      const name = set.exercise?.name || 'Exercise';
      if (!map.has(id)) {
        map.set(id, {
          exerciseId: id,
          exerciseName: name,
          sets: [],
          newWeight: null,
          newReps: null,
        });
      }
      map.get(id)!.sets.push(set);
    }
    this.groupedSets = Array.from(map.values());
  }

  addExercise() {
    if (!this.selectedExerciseId) return;
    const alreadyExists = this.groupedSets.some(
      (g) => g.exerciseId === this.selectedExerciseId,
    );
    if (alreadyExists) {
      this.selectedExerciseId = '';
      return;
    }
    const exercise = this.exercisesList.find(
      (e) => e.id === this.selectedExerciseId,
    );
    this.groupedSets.push({
      exerciseId: this.selectedExerciseId,
      exerciseName: exercise?.name || 'Exercise',
      sets: [],
      newWeight: null,
      newReps: null,
    });
    this.selectedExerciseId = '';
  }

  addSetToExercise(group: ExerciseGroup) {
    if (!group.newWeight || !group.newReps) return;
    const currentWorkout = this.workoutSubject.value;
    if (!currentWorkout) return;

    const newSet = {
      exerciseId: group.exerciseId,
      weight: group.newWeight,
      reps: group.newReps,
      order: currentWorkout.sets.length + 1,
      isCompleted: true,
      exercise: { id: group.exerciseId, name: group.exerciseName },
    };

    group.sets.push(newSet);
    currentWorkout.sets.push(newSet);
    group.newWeight = null;
    group.newReps = null;

    this.saveAllSets();
  }

  removeSet(set: any) {
    const currentWorkout = this.workoutSubject.value;
    if (!currentWorkout) return;

    const idx = currentWorkout.sets.indexOf(set);
    if (idx > -1) currentWorkout.sets.splice(idx, 1);

    for (const group of this.groupedSets) {
      const gi = group.sets.indexOf(set);
      if (gi > -1) group.sets.splice(gi, 1);
    }

    this.saveAllSets();
  }

  removeExercise(exerciseId: string) {
    const currentWorkout = this.workoutSubject.value;
    if (!currentWorkout) return;

    currentWorkout.sets = currentWorkout.sets.filter(
      (s: any) => (s.exercise?.id || s.exerciseId) !== exerciseId,
    );
    this.groupedSets = this.groupedSets.filter(
      (g) => g.exerciseId !== exerciseId,
    );

    this.saveAllSets();
  }

  toggleSetCompletion(set: any) {
    set.isCompleted = !set.isCompleted;
    this.saveAllSets();
  }

  updateWorkoutName() {
    const currentWorkout = this.workoutSubject.value;
    if (!currentWorkout || this.workoutName === currentWorkout.name) return;
    currentWorkout.name = this.workoutName;
    this.workoutService
      .updateWorkout(currentWorkout.id, { name: this.workoutName })
      .subscribe();
  }

  updateWorkoutDate(event: any) {
    const newDate = event.detail.value;
    const currentWorkout = this.workoutSubject.value;
    if (!currentWorkout) return;
    currentWorkout.date = newDate;
    this.workoutService
      .updateWorkout(currentWorkout.id, { date: newDate })
      .subscribe();
  }

  completeWorkout() {
    const currentWorkout = this.workoutSubject.value;
    if (!currentWorkout) return;
    currentWorkout.status = 'COMPLETED';
    this.workoutService
      .updateWorkout(currentWorkout.id, { status: 'COMPLETED' })
      .subscribe(() => {
        this.workoutSubject.next({ ...currentWorkout });
        this.router.navigate(['/dashboard']);
      });
  }

  private saveAllSets() {
    const currentWorkout = this.workoutSubject.value;
    if (!currentWorkout) return;
    this.workoutService
      .updateWorkout(currentWorkout.id, { sets: currentWorkout.sets })
      .subscribe();
  }
}
