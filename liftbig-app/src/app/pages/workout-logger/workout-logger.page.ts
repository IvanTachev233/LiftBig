import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AlertController,
  IonicModule,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  Exercise,
  Workout,
  WorkoutCardInput,
  WorkoutService,
  WorkoutStatus,
} from '../../core/workout.service';
import { Observable, switchMap, BehaviorSubject, of, EMPTY, shareReplay, map } from 'rxjs';
import {
  ExercisePickerComponent,
  ExercisePickerResult,
} from '../../shared/components/exercise-picker/exercise-picker.component';
import {
  newSupersetId,
  normalizeSupersets,
  toGroupBlocks,
} from '../../shared/superset';

// Makes element ids unique when more than one page instance is in the DOM
let nextPageId = 0;

interface LoggerSet {
  // From the API; absent for a set logged on this page
  id?: string;
  reps: number;
  weight: number;
  isCompleted: boolean;
}

interface LoggerCard {
  // From the API; absent for a card added on this page
  id?: string;
  exerciseId: string;
  exerciseName: string;
  sets: LoggerSet[];
  newWeight: number | null;
  newReps: number | null;
  // Cards sharing a value form one superset; null when not in one
  supersetGroup: string | null;
}

interface LoggerWorkout {
  id?: string;
  name: string;
  date: string;
  status: WorkoutStatus | 'DRAFT';
  // In display order
  cards: LoggerCard[];
  _pendingComplete?: boolean;
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
  private alertCtrl = inject(AlertController);

  workout$: Observable<LoggerWorkout> | undefined;
  exercises$: Observable<Exercise[]> | undefined;

  workoutName: string = '';
  exercisesList: Exercise[] = [];

  readonly idPrefix = `workout-logger-${nextPageId++}`;

  workoutSubject = new BehaviorSubject<LoggerWorkout | null>(null);

  // Drafts whose create request is pending; prevents duplicate creates
  private inFlightCreates = new Set<LoggerWorkout>();

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
            // Already loaded; keep local cards and inputs
            return EMPTY;
          }
          return this.workoutService
            .getWorkout(id)
            .pipe(map((w) => this.toLoggerWorkout(w)));
        }
        return of(this.buildDraftWorkout());
      }),
    );

    this.workout$.subscribe((w) => {
      this.workoutSubject.next(w);
      this.workoutName = w.name;
    });
  }

  /** Exercise cards of the shown workout, in display order */
  get cards(): LoggerCard[] {
    return this.workoutSubject.value?.cards ?? [];
  }

  private buildDraftWorkout(): LoggerWorkout {
    return {
      name: 'New Workout',
      date: new Date().toISOString(),
      status: 'DRAFT',
      cards: [],
    };
  }

  /** One card per API card, in saved order */
  private toLoggerWorkout(w: Workout): LoggerWorkout {
    const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;
    const cards = [...(w.exercises ?? [])].sort(byOrder).map(
      (card): LoggerCard => ({
        id: card.id,
        exerciseId: card.exerciseId,
        exerciseName: card.exercise?.name || 'Exercise',
        sets: [...card.sets].sort(byOrder).map((set) => ({
          id: set.id,
          reps: set.reps,
          weight: set.weight,
          isCompleted: set.isCompleted,
        })),
        newWeight: null,
        newReps: null,
        supersetGroup: card.supersetGroup ?? null,
      }),
    );
    return {
      id: w.id,
      name: w.name,
      date: w.date,
      status: w.status,
      // A superset needs 2 members next to each other
      cards: normalizeSupersets(cards),
    };
  }

  /** Exercise cards split into superset blocks and single cards */
  groupBlocks() {
    return toGroupBlocks(this.cards);
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
   * Appends a card per exercise, in order, including exercises already in the
   * workout. With superset, the new cards share one supersetGroup (needs >= 2).
   */
  addExercises(exercises: Exercise[], superset = false) {
    const currentWorkout = this.workoutSubject.value;
    if (!currentWorkout) return;
    const supersetGroup =
      superset && exercises.length >= 2 ? newSupersetId() : null;

    for (const ex of exercises) {
      // Coach-created exercises may be missing from the loaded list
      if (!this.exercisesList.some((e) => e.id === ex.id)) {
        this.exercisesList = [...this.exercisesList, ex];
      }
      currentWorkout.cards.push({
        exerciseId: ex.id,
        exerciseName: ex.name || 'Exercise',
        sets: [],
        newWeight: null,
        newReps: null,
        supersetGroup,
      });
    }
  }

  /** Opens the picker in replace mode and swaps the card's exercise in place */
  async replaceExercise(card: LoggerCard) {
    if (this.pickerOpen) return;
    this.pickerOpen = true;
    try {
      const modal = await this.modalCtrl.create({
        component: ExercisePickerComponent,
        componentProps: {
          exercises: this.exercisesList.length ? this.exercisesList : undefined,
          mode: 'replace',
        },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<ExercisePickerResult>();
      const ex = data?.exercises?.[0];
      if (role !== 'confirm' || !ex || ex.id === card.exerciseId) return;

      if (!this.exercisesList.some((e) => e.id === ex.id)) {
        this.exercisesList = [...this.exercisesList, ex];
      }
      // Keeps the card's id, position, superset and sets
      card.exerciseId = ex.id;
      card.exerciseName = ex.name || 'Exercise';
      this.saveCards();
    } finally {
      this.pickerOpen = false;
    }
  }

  /** Asks to confirm, then removes every member of the superset and their sets */
  async removeSuperset(supersetGroup: string | null) {
    if (!supersetGroup) return;
    const members = this.cards.filter(
      (c) => c.supersetGroup === supersetGroup,
    );
    if (!members.length) return;

    const alert = await this.alertCtrl.create({
      header: 'Delete superset?',
      message: `Removes ${members.length} exercises and their sets`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'destructive') return;

    const currentWorkout = this.workoutSubject.value;
    if (!currentWorkout) return;
    currentWorkout.cards = normalizeSupersets(
      currentWorkout.cards.filter((c) => !members.includes(c)),
    );

    this.saveCards();
  }

  addSetToExercise(card: LoggerCard) {
    if (!card.newWeight || !card.newReps) return;
    const currentWorkout = this.workoutSubject.value;
    if (!currentWorkout) return;

    card.sets.push({
      weight: card.newWeight,
      // The API takes whole reps
      reps: Math.max(1, Math.round(Number(card.newReps))),
      isCompleted: true,
    });
    card.newWeight = null;
    card.newReps = null;

    if (!currentWorkout.id) {
      if (!this.inFlightCreates.has(currentWorkout)) {
        this.createDraftWorkout(currentWorkout);
      }
      return;
    }

    this.saveCards();
  }

  private createDraftWorkout(draft: LoggerWorkout) {
    this.inFlightCreates.add(draft);
    this.workoutService
      .createWorkout({
        name: this.workoutName,
        date: draft.date,
      })
      .subscribe({
        next: (created) => {
          draft.id = created.id;
          this.inFlightCreates.delete(draft);

          // Always save the draft; only update the view if it's still shown
          const isCurrent = this.workoutSubject.value === draft;
          const completing = !!draft._pendingComplete;
          const patchName = isCurrent ? this.workoutName : draft.name;

          this.workoutService
            .updateWorkout(created.id, {
              name: patchName,
              date: draft.date,
              exercises: this.cardsBody(draft.cards),
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

  removeSet(set: LoggerSet) {
    const card = this.cards.find((c) => c.sets.includes(set));
    // A card keeps at least 1 set; delete the exercise to drop it
    if (!card || card.sets.length <= 1) return;

    card.sets.splice(card.sets.indexOf(set), 1);
    this.saveCards();
  }

  removeExercise(card: LoggerCard) {
    const currentWorkout = this.workoutSubject.value;
    if (!currentWorkout) return;

    // A superset left with 1 member is no longer a superset
    currentWorkout.cards = normalizeSupersets(
      currentWorkout.cards.filter((c) => c !== card),
    );

    this.saveCards();
  }

  toggleSetCompletion(set: LoggerSet) {
    set.isCompleted = !set.isCompleted;
    this.saveCards();
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
      if (!this.hasSets(currentWorkout)) {
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

  /** Whether any card has a logged set; Complete needs one */
  hasSets(workout: LoggerWorkout): boolean {
    return workout.cards.some((c) => c.sets.length > 0);
  }

  private saveCards() {
    const currentWorkout = this.workoutSubject.value;
    if (!currentWorkout || !currentWorkout.id) return;
    this.workoutService
      .updateWorkout(currentWorkout.id, {
        exercises: this.cardsBody(currentWorkout.cards),
      })
      .subscribe({ error: () => this.presentSaveErrorToast() });
  }

  /**
   * Cards with sets in display order, positions from 1. Only ids loaded from
   * the API are sent, so new cards and sets get new ids on every save.
   */
  private cardsBody(cards: LoggerCard[]): WorkoutCardInput[] {
    return cards
      .filter((card) => card.sets.length > 0)
      .map((card, i) => ({
        ...(card.id ? { id: card.id } : {}),
        exerciseId: card.exerciseId,
        order: i + 1,
        supersetGroup: card.supersetGroup,
        sets: card.sets.map((set, j) => ({
          ...(set.id ? { id: set.id } : {}),
          reps: set.reps,
          weight: set.weight,
          order: j + 1,
          isCompleted: set.isCompleted,
        })),
      }));
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
