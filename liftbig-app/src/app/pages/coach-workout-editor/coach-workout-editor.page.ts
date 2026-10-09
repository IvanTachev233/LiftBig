import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AlertController,
  IonicModule,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  CoachCardInput,
  CoachWorkoutService,
} from '../../core/coach-workout.service';
import {
  Exercise,
  Workout,
  WorkoutCard,
  WorkoutService,
} from '../../core/workout.service';
import { Observable } from 'rxjs';
import { WeightUnitService } from '../../core/weight-unit.service';
import {
  ExercisePickerComponent,
  ExercisePickerResult,
} from '../../shared/components/exercise-picker/exercise-picker.component';
import {
  blockRange,
  newSupersetId,
  normalizeSupersets,
  toGroupBlocks,
} from '../../shared/superset';

// Makes element ids unique when more than one page instance is in the DOM
let nextPageId = 0;

// Calendar day (YYYY-MM-DD) of an ISO date or timestamp, as the picker shows it
function dayOf(value: string): string {
  return value.slice(0, 10);
}

// Today's local calendar day
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface SetRow {
  // Set id from the API; absent for sets added in this editor session
  id?: string;
  reps: number;
  // In the coach's unit, as typed; saved as kg
  weight: number | null;
  notes: string;
  // The client's result, shown read-only and never sent
  made: boolean | null;
  actualReps: number | null;
  actualWeight: number | null;
}

// One exercise card in the editor
interface ExerciseGroup {
  // Card id from the API; absent for cards added in this editor session
  id?: string;
  exerciseId: string;
  exerciseName: string;
  sets: SetRow[];
  // Groups sharing a value form one superset; null when not in one
  supersetGroup: string | null;
}

@Component({
  selector: 'app-coach-workout-editor',
  templateUrl: './coach-workout-editor.page.html',
  styleUrls: ['./coach-workout-editor.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, FormsModule],
})
export class CoachWorkoutEditorPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private coachWorkoutService = inject(CoachWorkoutService);
  private workoutService = inject(WorkoutService);
  private toastController = inject(ToastController);
  private modalCtrl = inject(ModalController);
  private alertCtrl = inject(AlertController);
  readonly units = inject(WeightUnitService);

  exercises$: Observable<any[]> | undefined;
  exercisesList: any[] = [];

  isEditMode = false;
  workoutId = '';
  clientId = '';
  workoutName = '';
  // YYYY-MM-DD; the picker may add a time, which save() drops
  workoutDate = today();
  exerciseGroups: ExerciseGroup[] = [];

  readonly idPrefix = `coach-workout-editor-${nextPageId++}`;

  // Prevents a double tap from opening two pickers
  private pickerOpen = false;

  ngOnInit() {
    this.exercises$ = this.workoutService.getExercises();
    this.exercises$.subscribe((exs) => (this.exercisesList = exs));

    const params = this.route.snapshot.paramMap;
    this.workoutId = params.get('id') || '';
    this.clientId = params.get('clientId') || '';

    if (this.workoutId) {
      this.isEditMode = true;
      this.coachWorkoutService.getWorkout(this.workoutId).subscribe({
        next: (workout) => this.load(workout),
        error: () => this.presentToast('Failed to load workout', 'danger'),
      });
    }
  }

  get backHref() {
    return `/coach/clients/${this.clientId}/workouts`;
  }

  private load(workout: Workout) {
    this.workoutName = workout.name;
    this.workoutDate = dayOf(workout.date);
    this.clientId = workout.userId || '';
    this.buildGroups(workout.exercises || []);
  }

  private buildGroups(cards: WorkoutCard[]) {
    const groups: ExerciseGroup[] = cards.map((card) => ({
      id: card.id,
      exerciseId: card.exerciseId,
      exerciseName: card.exercise?.name || 'Exercise',
      supersetGroup: card.supersetGroup ?? null,
      sets: card.sets.map((set) => ({
        id: set.id,
        reps: set.reps,
        weight: this.units.toInput(set.weight),
        notes: set.notes || '',
        made: set.made ?? null,
        actualReps: set.actualReps ?? null,
        actualWeight: set.actualWeight ?? null,
      })),
    }));
    // Keeps superset members next to each other for the move arrows
    this.exerciseGroups = normalizeSupersets(groups);
  }

  /** Exercise cards split into superset blocks and single cards */
  groupBlocks() {
    return toGroupBlocks(this.exerciseGroups);
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
   * Appends a group per exercise, in order, each with one starting set of 5 reps.
   * With superset, the new groups share one supersetGroup (needs >= 2).
   */
  addExercises(exercises: Exercise[], superset = false) {
    const supersetGroup =
      superset && exercises.length >= 2 ? newSupersetId() : null;
    for (const ex of exercises) {
      // Coach-created exercises may be missing from the loaded list
      if (!this.exercisesList.some((e) => e.id === ex.id)) {
        this.exercisesList = [...this.exercisesList, ex];
      }
      this.exerciseGroups.push({
        exerciseId: ex.id,
        exerciseName: ex.name || 'Exercise',
        sets: [this.newSet(5, null)],
        supersetGroup,
      });
    }
  }

  /**
   * Opens the picker in replace mode and swaps the card's exercise in place,
   * keeping its card and set ids so logged results survive the save
   */
  async replaceExercise(group: ExerciseGroup) {
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
      if (role !== 'confirm' || !ex || ex.id === group.exerciseId) return;

      if (!this.exercisesList.some((e) => e.id === ex.id)) {
        this.exercisesList = [...this.exercisesList, ex];
      }
      group.exerciseId = ex.id;
      group.exerciseName = ex.name || 'Exercise';
    } finally {
      this.pickerOpen = false;
    }
  }

  /** Asks to confirm, then removes every member of the superset and their sets */
  async removeSuperset(supersetGroup: string | null) {
    if (!supersetGroup) return;
    const members = this.exerciseGroups.filter(
      (g) => g.supersetGroup === supersetGroup,
    );
    if (!members.length) return;

    const logged = members.some((g) => this.hasResult(g));
    const confirmed = await this.confirmDelete(
      'Delete superset?',
      `Removes ${members.length} exercises and their sets` +
        (logged ? ', including logged results' : ''),
    );
    if (!confirmed) return;

    this.exerciseGroups = normalizeSupersets(
      this.exerciseGroups.filter((g) => g.supersetGroup !== supersetGroup),
    );
  }

  addSet(group: ExerciseGroup) {
    const lastSet = group.sets[group.sets.length - 1];
    group.sets.push(
      this.newSet(lastSet ? lastSet.reps : 5, lastSet ? lastSet.weight : null),
    );
  }

  /** Removes a set; one with a logged result needs confirming first */
  async removeSet(group: ExerciseGroup, setIndex: number) {
    const set = group.sets[setIndex];
    if (!set) return;
    if (
      set.made !== null &&
      !(await this.confirmDelete(
        'Delete logged set?',
        'This set has a logged result, which is deleted with it',
      ))
    ) {
      return;
    }
    const i = group.sets.indexOf(set);
    if (i >= 0) group.sets.splice(i, 1);
  }

  /** Removes a card; one with a logged result needs confirming first */
  async removeExercise(groupIndex: number) {
    const group = this.exerciseGroups[groupIndex];
    if (!group) return;
    if (
      this.hasResult(group) &&
      !(await this.confirmDelete(
        'Delete logged exercise?',
        `${group.exerciseName} has logged results, which are deleted with it`,
      ))
    ) {
      return;
    }
    const i = this.exerciseGroups.indexOf(group);
    if (i < 0) return;
    this.exerciseGroups.splice(i, 1);
    // A superset left with 1 member is no longer a superset
    this.exerciseGroups = normalizeSupersets(this.exerciseGroups);
  }

  /** Read-only result line of a logged set, e.g. "Made: 3 × 105 kg" */
  resultText(set: SetRow): string {
    const label = set.made ? 'Made' : 'Missed';
    if (set.actualReps == null && set.actualWeight == null) return label;
    const reps = set.actualReps ?? set.reps;
    const weightKg = set.actualWeight ?? this.units.toKg(set.weight);
    return weightKg == null
      ? `${label}: ${reps} reps`
      : `${label}: ${reps} × ${this.units.format(weightKg)}`;
  }

  private hasResult(group: ExerciseGroup) {
    return group.sets.some((s) => s.made !== null);
  }

  private newSet(reps: number, weight: number | null): SetRow {
    return {
      reps,
      weight,
      notes: '',
      made: null,
      actualReps: null,
      actualWeight: null,
    };
  }

  private async confirmDelete(header: string, message: string) {
    const alert = await this.alertCtrl.create({
      header,
      message,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'destructive';
  }

  // Inside a superset the arrows reorder its members; otherwise the whole
  // block (single card or superset) moves past the neighbouring block, so
  // superset members always stay next to each other.
  moveUp(index: number) {
    if (index <= 0) return;
    const groups = this.exerciseGroups;
    const group = groups[index];
    if (group.supersetGroup && groups[index - 1].supersetGroup === group.supersetGroup) {
      [groups[index - 1], groups[index]] = [groups[index], groups[index - 1]];
      return;
    }
    const [start, end] = blockRange(groups, index);
    const [prevStart] = blockRange(groups, start - 1);
    const moved = groups.splice(start, end - start + 1);
    groups.splice(prevStart, 0, ...moved);
  }

  moveDown(index: number) {
    const groups = this.exerciseGroups;
    if (index >= groups.length - 1) return;
    const group = groups[index];
    if (group.supersetGroup && groups[index + 1].supersetGroup === group.supersetGroup) {
      [groups[index], groups[index + 1]] = [groups[index + 1], groups[index]];
      return;
    }
    const [start, end] = blockRange(groups, index);
    const [nextStart, nextEnd] = blockRange(groups, end + 1);
    const next = groups.splice(nextStart, nextEnd - nextStart + 1);
    groups.splice(start, 0, ...next);
  }

  save() {
    if (!this.workoutName || !this.clientId) {
      this.presentToast('Please fill in all required fields', 'danger');
      return;
    }

    // Cards and sets keep their ids so the API updates them in place and
    // keeps the client's results; results are never sent
    const exercises: CoachCardInput[] = this.exerciseGroups.map(
      (group, i) => ({
        ...(group.id ? { id: group.id } : {}),
        exerciseId: group.exerciseId,
        order: i + 1,
        supersetGroup: group.supersetGroup ?? null,
        sets: group.sets.map((set, si) => ({
          ...(set.id ? { id: set.id } : {}),
          // The API takes whole reps; an emptied field stays empty
          reps: set.reps == null ? set.reps : Math.round(Number(set.reps)),
          weight: this.units.toKg(set.weight),
          notes: set.notes || null,
          order: si + 1,
        })),
      }),
    );

    const fields = {
      name: this.workoutName,
      date: dayOf(this.workoutDate),
      exercises,
    };
    const request = this.isEditMode
      ? this.coachWorkoutService.updateWorkout(this.workoutId, fields)
      : this.coachWorkoutService.createWorkout(this.clientId, fields);

    request.subscribe({
      next: () => {
        this.presentToast(
          this.isEditMode ? 'Workout updated' : 'Workout created',
          'success',
        );
        this.router.navigate(['/coach/clients', this.clientId, 'workouts']);
      },
      error: (err) => {
        this.presentToast(
          err.error?.message || 'Failed to save workout',
          'danger',
        );
      },
    });
  }

  private async presentToast(
    message: string,
    color: 'success' | 'danger',
  ) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'top',
    });
    await toast.present();
  }
}
