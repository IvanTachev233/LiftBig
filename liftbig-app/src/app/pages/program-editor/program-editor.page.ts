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
  ProgramCard,
  ProgramService,
  UpdateProgramCardInput,
} from '../../core/program.service';
import { Exercise, WorkoutService } from '../../core/workout.service';
import { Observable } from 'rxjs';
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

interface SetRow {
  // Set id from the API; absent for sets added in this editor session
  id?: string;
  reps: number;
  weight: number | null;
  notes: string;
  made: boolean | null;
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
  selector: 'app-program-editor',
  templateUrl: './program-editor.page.html',
  styleUrls: ['./program-editor.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, FormsModule],
})
export class ProgramEditorPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private programService = inject(ProgramService);
  private workoutService = inject(WorkoutService);
  private toastController = inject(ToastController);
  private modalCtrl = inject(ModalController);
  private alertCtrl = inject(AlertController);

  exercises$: Observable<any[]> | undefined;
  exercisesList: any[] = [];

  isEditMode = false;
  programId: string = '';
  clientId: string = '';
  programName: string = '';
  scheduledDate: string = new Date().toISOString();
  exerciseGroups: ExerciseGroup[] = [];

  readonly idPrefix = `program-editor-${nextPageId++}`;

  // Prevents a double tap from opening two pickers
  private pickerOpen = false;

  ngOnInit() {
    this.exercises$ = this.workoutService.getExercises();
    this.exercises$.subscribe((exs) => (this.exercisesList = exs));

    this.programId = this.route.snapshot.paramMap.get('id') || '';
    this.clientId =
      this.route.snapshot.queryParamMap.get('clientId') || '';

    if (this.programId) {
      this.isEditMode = true;
      this.programService.getProgram(this.programId).subscribe((program) => {
        this.programName = program.name;
        this.scheduledDate = program.scheduledDate;
        this.clientId = program.clientId;
        this.buildGroups(program.exercises || []);
      });
    }
  }

  private buildGroups(cards: ProgramCard[]) {
    const groups: ExerciseGroup[] = cards.map((card) => ({
      id: card.id,
      exerciseId: card.exerciseId,
      exerciseName: card.exercise?.name || 'Exercise',
      supersetGroup: card.supersetGroup ?? null,
      sets: card.sets.map((set) => ({
        id: set.id,
        reps: set.reps,
        weight: set.weight,
        notes: set.notes || '',
        made: set.made ?? null,
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
        sets: [{ reps: 5, weight: null, notes: '', made: null }],
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

    this.exerciseGroups = normalizeSupersets(
      this.exerciseGroups.filter((g) => g.supersetGroup !== supersetGroup),
    );
  }

  addSet(group: ExerciseGroup) {
    const lastSet = group.sets[group.sets.length - 1];
    group.sets.push({
      reps: lastSet ? lastSet.reps : 5,
      weight: lastSet ? lastSet.weight : null,
      notes: '',
      made: null,
    });
  }

  removeSet(group: ExerciseGroup, setIndex: number) {
    group.sets.splice(setIndex, 1);
  }

  removeExercise(groupIndex: number) {
    this.exerciseGroups.splice(groupIndex, 1);
    // A superset left with 1 member is no longer a superset
    this.exerciseGroups = normalizeSupersets(this.exerciseGroups);
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
    if (!this.programName || !this.clientId) {
      this.presentToast('Please fill in all required fields', 'danger');
      return;
    }

    // Cards and sets keep their ids so the API updates them in place and
    // keeps the client's results; `made` is never sent
    const exercises: UpdateProgramCardInput[] = this.exerciseGroups.map(
      (group, i) => ({
        ...(group.id ? { id: group.id } : {}),
        exerciseId: group.exerciseId,
        order: i + 1,
        supersetGroup: group.supersetGroup ?? null,
        sets: group.sets.map((set, si) => ({
          ...(set.id ? { id: set.id } : {}),
          // The API takes whole reps; an emptied field stays empty
          reps: set.reps == null ? set.reps : Math.round(Number(set.reps)),
          weight: set.weight,
          notes: set.notes || null,
          order: si + 1,
        })),
      }),
    );

    const request = this.isEditMode
      ? this.programService.updateProgram(this.programId, {
          name: this.programName,
          scheduledDate: this.scheduledDate,
          exercises,
        })
      : this.programService.createProgram({
          clientId: this.clientId,
          name: this.programName,
          scheduledDate: this.scheduledDate,
          exercises,
        });

    request.subscribe({
      next: () => {
        this.presentToast(
          this.isEditMode ? 'Program updated' : 'Program created',
          'success',
        );
        this.router.navigate(['/coach/programs', this.clientId]);
      },
      error: (err) => {
        this.presentToast(
          err.error?.message || 'Failed to save program',
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
