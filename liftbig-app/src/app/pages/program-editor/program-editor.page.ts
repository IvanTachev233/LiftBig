import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController, ToastController } from '@ionic/angular';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProgramService } from '../../core/program.service';
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

interface SetRow {
  // Set id from the API; absent for sets added in this editor session
  id?: string;
  reps: number;
  weight: number | null;
  notes: string;
  made: boolean | null;
}

interface ExerciseGroup {
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

  exercises$: Observable<any[]> | undefined;
  exercisesList: any[] = [];

  isEditMode = false;
  programId: string = '';
  clientId: string = '';
  programName: string = '';
  scheduledDate: string = new Date().toISOString();
  exerciseGroups: ExerciseGroup[] = [];

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

  private buildGroups(exercises: any[]) {
    const map = new Map<string, ExerciseGroup>();
    // Sort by order to maintain sequence
    const sorted = [...exercises].sort((a, b) => a.order - b.order);
    for (const e of sorted) {
      const id = e.exerciseId;
      if (!map.has(id)) {
        map.set(id, {
          exerciseId: id,
          exerciseName: e.exercise?.name || 'Exercise',
          sets: [],
          supersetGroup: e.supersetGroup ?? null,
        });
      }
      map.get(id)!.sets.push({
        id: e.id,
        reps: e.reps,
        weight: e.weight,
        notes: e.notes || '',
        made: e.made ?? null,
      });
    }
    // Rebuild superset blocks from the stored supersetGroup
    this.exerciseGroups = normalizeSupersets(Array.from(map.values()));
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

    // Flatten groups into individual exercise rows
    let order = 1;
    const exercises: any[] = [];
    for (const group of this.exerciseGroups) {
      for (const set of group.sets) {
        exercises.push({
          id: set.id,
          exerciseId: group.exerciseId,
          reps: set.reps,
          weight: set.weight,
          notes: set.notes || undefined,
          order: order++,
          supersetGroup: group.supersetGroup ?? null,
        });
      }
    }

    const data = {
      clientId: this.clientId,
      name: this.programName,
      scheduledDate: this.scheduledDate,
      exercises,
    };

    const request = this.isEditMode
      ? this.programService.updateProgram(this.programId, data)
      : this.programService.createProgram(data);

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
