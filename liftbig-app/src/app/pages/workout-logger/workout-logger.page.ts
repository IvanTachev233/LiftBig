import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController } from '@ionic/angular';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { WorkoutService } from '../../core/workout.service';
import { Observable, switchMap, BehaviorSubject, of, EMPTY, shareReplay } from 'rxjs';

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
  private toastController = inject(ToastController);

  workout$: Observable<any> | undefined;
  exercises$: Observable<any[]> | undefined;

  selectedExerciseId: string = '';
  workoutName: string = '';
  exercisesList: any[] = [];
  groupedSets: ExerciseGroup[] = [];

  workoutSubject = new BehaviorSubject<any>(null);

  // Per-draft in-flight guard: tracks which draft objects currently have a
  // create POST pending, instead of a single global boolean. This lets a
  // brand new draft (opened while a previous draft's create is still in
  // flight, e.g. via IonicRouteStrategy reusing this component instance) be
  // created independently of the stale one.
  private inFlightCreates = new Set<any>();

  ngOnInit() {
    this.exercises$ = this.workoutService
      .getExercises()
      .pipe(shareReplay(1));
    this.exercises$.subscribe((exs) => (this.exercisesList = exs));

    this.workout$ = this.route.queryParams.pipe(
      switchMap((params) => {
        const id = params['id'];
        if (id) {
          const current = this.workoutSubject.value;
          if (current && current.id === id) {
            // Already loaded (e.g. the replaceUrl navigate after create
            // re-emits queryParams). Emit nothing so the subscriber below
            // does not re-run buildGroups() and drop exercise groups that
            // have no sets yet, or clear half-typed newWeight/newReps.
            return EMPTY;
          }
          return this.workoutService.getWorkout(id);
        }
        return of(this.buildDraftWorkout());
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

  private buildDraftWorkout() {
    return {
      name: 'New Workout',
      date: new Date().toISOString(),
      status: 'DRAFT',
      sets: [],
    };
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

    if (!currentWorkout.id) {
      if (!this.inFlightCreates.has(currentWorkout)) {
        this.createDraftWorkout(currentWorkout);
      }
      return;
    }

    this.saveAllSets();
  }

  private createDraftWorkout(draft: any) {
    this.inFlightCreates.add(draft);
    this.workoutService
      .createWorkout({
        name: this.workoutName,
        date: draft.date,
      })
      .subscribe({
        next: (created: any) => {
          draft.id = created.id;
          this.inFlightCreates.delete(draft);

          // The view may have moved on to a different draft while this
          // create was in flight (e.g. IonicRouteStrategy reused this
          // component instance for a new "New Workout" navigation). In that
          // case still persist this draft's sets/status on the server, but
          // don't navigate or touch the currently displayed draft.
          const isCurrent = this.workoutSubject.value === draft;
          const completing = !!draft._pendingComplete;
          const patchName = isCurrent ? this.workoutName : draft.name;

          this.workoutService
            .updateWorkout(created.id, {
              name: patchName,
              date: draft.date,
              sets: draft.sets,
              status: completing ? 'COMPLETED' : 'IN_PROGRESS',
            })
            .subscribe({
              next: () => {
                if (completing) {
                  draft._pendingComplete = false;
                  draft.status = 'COMPLETED';
                  if (isCurrent) {
                    this.workoutSubject.next(draft);
                    this.router.navigate(['/dashboard']);
                  }
                  return;
                }
                if (isCurrent) {
                  this.router.navigate([], {
                    relativeTo: this.route,
                    queryParams: { id: created.id },
                    replaceUrl: true,
                  });
                }
              },
              error: () => {
                if (completing) {
                  draft._pendingComplete = false;
                  if (isCurrent) {
                    this.workoutSubject.next(draft);
                  }
                }
                this.presentSaveErrorToast();
              },
            });
        },
        error: () => {
          this.inFlightCreates.delete(draft);
          if (draft._pendingComplete) {
            draft._pendingComplete = false;
            if (this.workoutSubject.value === draft) {
              this.workoutSubject.next(draft);
            }
          }
          this.presentSaveErrorToast();
        },
      });
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
    if (!currentWorkout.id) return;
    this.workoutService
      .updateWorkout(currentWorkout.id, { name: this.workoutName })
      .subscribe({ error: () => this.presentSaveErrorToast() });
  }

  updateWorkoutDate(event: any) {
    const newDate = event.detail.value;
    const currentWorkout = this.workoutSubject.value;
    if (!currentWorkout) return;
    currentWorkout.date = newDate;
    if (!currentWorkout.id) return;
    this.workoutService
      .updateWorkout(currentWorkout.id, { date: newDate })
      .subscribe({ error: () => this.presentSaveErrorToast() });
  }

  completeWorkout() {
    const currentWorkout = this.workoutSubject.value;
    if (!currentWorkout || currentWorkout._pendingComplete) return;

    if (!currentWorkout.id) {
      if (!currentWorkout.sets || currentWorkout.sets.length === 0) {
        // Defensive: the button is disabled with 0 sets, but if reached
        // there is nothing to persist, so it's safe to navigate directly.
        currentWorkout.status = 'COMPLETED';
        this.workoutSubject.next(currentWorkout);
        this.router.navigate(['/dashboard']);
        return;
      }

      // The draft has sets but no id: either a create is still in flight, or
      // a previous create attempt failed and was never retried. Either way,
      // defer completion until the draft has actually been created and
      // saved as COMPLETED on the server, instead of taking the local-only
      // shortcut above (which would otherwise navigate away, silently
      // losing the workout).
      currentWorkout._pendingComplete = true;
      this.workoutSubject.next(currentWorkout);
      if (!this.inFlightCreates.has(currentWorkout)) {
        this.createDraftWorkout(currentWorkout);
      }
      return;
    }

    currentWorkout._pendingComplete = true;
    this.workoutSubject.next(currentWorkout);
    this.workoutService
      .updateWorkout(currentWorkout.id, { status: 'COMPLETED' })
      .subscribe({
        next: () => {
          currentWorkout._pendingComplete = false;
          currentWorkout.status = 'COMPLETED';
          this.workoutSubject.next(currentWorkout);
          this.router.navigate(['/dashboard']);
        },
        error: () => {
          currentWorkout._pendingComplete = false;
          this.workoutSubject.next(currentWorkout);
          this.presentSaveErrorToast();
        },
      });
  }

  private saveAllSets() {
    const currentWorkout = this.workoutSubject.value;
    if (!currentWorkout || !currentWorkout.id) return;
    this.workoutService
      .updateWorkout(currentWorkout.id, { sets: currentWorkout.sets })
      .subscribe({ error: () => this.presentSaveErrorToast() });
  }

  private async presentSaveErrorToast() {
    const toast = await this.toastController.create({
      message: "Couldn't save workout. Check your connection.",
      duration: 2500,
      color: 'danger',
    });
    await toast.present();
  }
}
