import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController, ToastController } from '@ionic/angular';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Exercise, WorkoutService } from '../../core/workout.service';
import { Observable, switchMap, BehaviorSubject, of, EMPTY, shareReplay } from 'rxjs';
import {
  ExercisePickerComponent,
  ExercisePickerResult,
} from '../../shared/components/exercise-picker/exercise-picker.component';
import {
  newSupersetId,
  normalizeSupersets,
  toGroupBlocks,
} from '../../shared/superset';

interface ExerciseGroup {
  exerciseId: string;
  exerciseName: string;
  sets: any[];
  newWeight: number | null;
  newReps: number | null;
  // Groups sharing a value form one superset; null when not in one
  supersetGroup: string | null;
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
  private modalCtrl = inject(ModalController);

  workout$: Observable<any> | undefined;
  exercises$: Observable<any[]> | undefined;

  workoutName: string = '';
  exercisesList: any[] = [];
  groupedSets: ExerciseGroup[] = [];

  workoutSubject = new BehaviorSubject<any>(null);

  // Drafts whose create request is pending; prevents duplicate creates
  private inFlightCreates = new Set<any>();

  // Prevents a double tap from opening two pickers
  private pickerOpen = false;

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
            // Already loaded; keep local exercise groups and inputs
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
          supersetGroup: set.supersetGroup ?? null,
        });
      }
      map.get(id)!.sets.push(set);
    }
    // Rebuild superset blocks from the stored supersetGroup
    this.groupedSets = normalizeSupersets(Array.from(map.values()));
  }

  /** Exercise cards split into superset blocks and single cards */
  groupBlocks() {
    return toGroupBlocks(this.groupedSets);
  }

  async openExercisePicker() {
    if (this.pickerOpen) return;
    this.pickerOpen = true;
    try {
      const modal = await this.modalCtrl.create({
        component: ExercisePickerComponent,
        // An empty list means it hasn't loaded yet; let the picker load it
        componentProps: {
          exercises: this.exercisesList.length ? this.exercisesList : undefined,
        },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<ExercisePickerResult>();
      if (role === 'confirm' && data?.exercises?.length) {
        this.addExercises(data.exercises, data.superset);
      }
    } finally {
      this.pickerOpen = false;
    }
  }

  /**
   * Appends a group per exercise, in order, skipping exercises already in the
   * workout. With superset, the new groups share one supersetGroup (needs >= 2).
   */
  addExercises(exercises: Exercise[], superset = false) {
    const seen = new Set(this.groupedSets.map((g) => g.exerciseId));
    const toAdd: Exercise[] = [];
    for (const ex of exercises) {
      if (seen.has(ex.id)) continue;
      seen.add(ex.id);
      toAdd.push(ex);
    }
    const supersetGroup =
      superset && toAdd.length >= 2 ? newSupersetId() : null;

    for (const ex of toAdd) {
      // Coach-created exercises may be missing from the loaded list
      if (!this.exercisesList.some((e) => e.id === ex.id)) {
        this.exercisesList = [...this.exercisesList, ex];
      }
      this.groupedSets.push({
        exerciseId: ex.id,
        exerciseName: ex.name || 'Exercise',
        sets: [],
        newWeight: null,
        newReps: null,
        supersetGroup,
      });
    }
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
      supersetGroup: group.supersetGroup ?? null,
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

          // Always save the draft; only update the view if it's still shown
          const isCurrent = this.workoutSubject.value === draft;
          const completing = !!draft._pendingComplete;
          const patchName = isCurrent ? this.workoutName : draft.name;
          if (isCurrent) this.syncSupersetGroups();

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
    // A superset left with 1 member is no longer a superset
    this.groupedSets = normalizeSupersets(
      this.groupedSets.filter((g) => g.exerciseId !== exerciseId),
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
        // Nothing to save
        currentWorkout.status = 'COMPLETED';
        this.workoutSubject.next(currentWorkout);
        this.router.navigate(['/dashboard']);
        return;
      }

      // Unsaved draft with sets: create it, then mark it completed
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
    this.syncSupersetGroups();
    this.workoutService
      .updateWorkout(currentWorkout.id, { sets: currentWorkout.sets })
      .subscribe({ error: () => this.presentSaveErrorToast() });
  }

  // Every saved set carries its group's supersetGroup (null when none)
  private syncSupersetGroups() {
    for (const group of this.groupedSets) {
      for (const set of group.sets) {
        set.supersetGroup = group.supersetGroup ?? null;
      }
    }
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
