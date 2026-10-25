import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonicModule,
  ModalController,
  ReorderEndCustomEvent,
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
import { addIcons } from 'ionicons';
import {
  add,
  calendarOutline,
  chatboxEllipsesOutline,
  checkmarkCircle,
  chevronDown,
  chevronUp,
  closeCircle,
  ellipsisHorizontal,
  removeCircleOutline,
} from 'ionicons/icons';
import { OverflowAction, OverflowMenuService } from '../../shared/ui/overflow-menu.service';
import { BottomSheetService } from '../../shared/ui/bottom-sheet.service';
import { CardNoteSheetComponent } from './card-note-sheet.component';
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

import { ConfirmSheetService } from '../../shared/ui/confirm-sheet.component';
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
  private confirmSheet = inject(ConfirmSheetService);
  private overflowMenu = inject(OverflowMenuService);
  private bottomSheet = inject(BottomSheetService);
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
  // Status of the loaded workout, for the completion chip; null when new
  status: Workout['status'] | null = null;
  pickingDate = false;

  // Collapsed cards (every member of a collapsed superset) and the sets
  // loaded with a note, which keep their note line
  private collapsed = new Set<ExerciseGroup>();
  private notesOpen = new Set<SetRow>();
  // Each card's note for the athlete; only notes changed here are sent
  private cardNotes = new Map<ExerciseGroup, string>();
  private cardNotesChanged = new Set<ExerciseGroup>();

  readonly idPrefix = `coach-workout-editor-${nextPageId++}`;

  // Prevents a double tap from opening two pickers
  private pickerOpen = false;

  constructor() {
    addIcons({
      add,
      calendarOutline,
      chatboxEllipsesOutline,
      checkmarkCircle,
      chevronDown,
      chevronUp,
      closeCircle,
      ellipsisHorizontal,
      removeCircleOutline,
    });
  }

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
    this.status = workout.status;
    this.buildGroups(workout.exercises || []);
    // Cards after the second start collapsed; a superset counts as one card
    for (const block of this.groupBlocks().slice(2)) {
      for (const group of block.groups) this.collapsed.add(group);
    }
    for (const group of this.exerciseGroups) {
      for (const set of group.sets) if (set.notes) this.notesOpen.add(set);
    }
  }

  private buildGroups(cards: WorkoutCard[]) {
    const groups: ExerciseGroup[] = cards.map((card) => {
      const group: ExerciseGroup = {
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
      };
      if (card.notes) this.cardNotes.set(group, card.notes);
      return group;
    });
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
      'Delete superset',
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
        'Delete set',
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
        'Delete exercise',
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

  private confirmDelete(title: string, message: string, confirmLabel: string) {
    return this.confirmSheet.confirm({ title, message, confirmLabel });
  }


  // Move up / Move down (the `⋯` menu): inside a superset they reorder its
  // members; otherwise the whole block (single card or superset) moves past
  // the neighbouring block, so superset members always stay together.
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

  /**
   * Drop of a dragged block (a card or a whole superset): the blocks are
   * reordered here and re-rendered, so the reorder group puts nothing back
   */
  onReorder(event: ReorderEndCustomEvent) {
    const { from, to } = event.detail;
    event.detail.complete(false);
    if (from === to) return;
    const blocks = this.groupBlocks();
    const [moved] = blocks.splice(from, 1);
    if (!moved) return;
    blocks.splice(to, 0, moved);
    this.exerciseGroups = ([] as ExerciseGroup[]).concat(...blocks.map((b) => b.groups));
  }

  /** The card's `⋯` menu; inside a superset, Move stays within it */
  async openCardMenu(group: ExerciseGroup) {
    const i = this.exerciseGroups.indexOf(group);
    const sg = group.supersetGroup;
    const before = this.exerciseGroups[i - 1];
    const after = this.exerciseGroups[i + 1];
    const canUp = sg ? before?.supersetGroup === sg : i > 0;
    const canDown = sg ? after?.supersetGroup === sg : !!after;
    const suffix = sg ? ' in superset' : '';
    const actions: OverflowAction[] = [
      { id: 'replace', text: 'Replace' },
      ...(canUp ? [{ id: 'move-up', text: 'Move up' + suffix }] : []),
      ...(canDown ? [{ id: 'move-down', text: 'Move down' + suffix }] : []),
      ...(sg ? [{ id: 'delete-superset', text: 'Delete superset', destructive: true }] : []),
      { id: 'remove', text: 'Remove', destructive: true },
    ];
    switch (await this.overflowMenu.open(actions, group.exerciseName)) {
      case 'replace':
        await this.replaceExercise(group);
        break;
      case 'move-up':
        this.moveUp(this.exerciseGroups.indexOf(group));
        break;
      case 'move-down':
        this.moveDown(this.exerciseGroups.indexOf(group));
        break;
      case 'delete-superset':
        await this.removeSuperset(sg);
        break;
      case 'remove':
        await this.removeExercise(this.exerciseGroups.indexOf(group));
        break;
    }
  }

  isCollapsed(groups: ExerciseGroup[]): boolean {
    return groups.some((g) => this.collapsed.has(g));
  }

  toggleCollapsed(groups: ExerciseGroup[]) {
    const collapse = !this.isCollapsed(groups);
    for (const g of groups) {
      if (collapse) this.collapsed.add(g);
      else this.collapsed.delete(g);
    }
  }

  isNoteOpen(set: SetRow): boolean {
    return this.notesOpen.has(set);
  }

  cardNote(group: ExerciseGroup): string {
    return this.cardNotes.get(group) ?? '';
  }

  /** Edits the card's note for the athlete in a sheet; an empty note clears it */
  async editCardNote(group: ExerciseGroup) {
    const { data, role } = await this.bottomSheet.open<string>(CardNoteSheetComponent, {
      label: 'Note for athlete',
      props: { exerciseName: group.exerciseName, note: this.cardNote(group) },
    });
    if (role !== 'confirm' || data === undefined) return;
    if (data) this.cardNotes.set(group, data);
    else this.cardNotes.delete(group);
    this.cardNotesChanged.add(group);
  }

  /** e.g. "3 × 5 @ 100 kg" when every set is the same, else "3 sets" */
  planLine(group: ExerciseGroup): string {
    const [first] = group.sets;
    if (!first) return 'No sets yet';
    const same = group.sets.every((s) => s.reps === first.reps && s.weight === first.weight);
    if (!same) return `${group.sets.length} sets`;
    const weight = first.weight == null ? '' : ` @ ${first.weight} ${this.units.unit()}`;
    return `${group.sets.length} × ${first.reps}${weight}`;
  }

  /** "In progress · 3/8 sets": the status word a coach sees and logged/all sets */
  completionText(): string {
    const sets = ([] as SetRow[]).concat(...this.exerciseGroups.map((g) => g.sets));
    const logged = sets.filter((s) => s.made !== null).length;
    const word =
      this.status === 'COMPLETED'
        ? 'Completed'
        : this.status === 'IN_PROGRESS'
          ? 'In progress'
          : 'Not started';
    return `${word} · ${logged}/${sets.length} sets`;
  }

  /** Visible chip text of a set's result, e.g. "3 × 105 kg" or "Missed" */
  resultValue(set: SetRow): string {
    if (set.made === null) return 'Not logged';
    const full = this.resultText(set);
    const i = full.indexOf(': ');
    return i < 0 ? full : full.slice(i + 2);
  }

  /** "Made: " / "Missed: " before a chip value, read by screen readers only */
  resultPrefix(set: SetRow): string {
    const full = this.resultText(set);
    const i = full.indexOf(': ');
    return i < 0 ? '' : full.slice(0, i + 2);
  }

  dateChanged(event: { detail: { value?: string | string[] | null } }) {
    const value = event.detail.value;
    if (typeof value === 'string') this.workoutDate = dayOf(value);
    this.pickingDate = false;
  }

  save() {
    if (!this.workoutName || !this.clientId) {
      this.presentToast('Please fill in all required fields', 'danger');
      return;
    }
    const wholeReps = (set: SetRow) => Math.round(Number(set.reps ?? NaN));
    if (this.exerciseGroups.some((g) => g.sets.some((s) => !(wholeReps(s) >= 1)))) {
      this.presentToast('Every set needs at least 1 rep', 'danger');
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
        ...(this.cardNotesChanged.has(group) ? { notes: this.cardNote(group) || null } : {}),
        sets: group.sets.map((set, si) => ({
          ...(set.id ? { id: set.id } : {}),
          // The API takes whole reps
          reps: wholeReps(set),
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
