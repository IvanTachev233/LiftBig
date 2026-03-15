import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController } from '@ionic/angular';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProgramService, Program, ProgramExercise } from '../../core/program.service';

interface LoggableSet extends ProgramExercise {
  dirty: boolean;
  isNew: boolean;
}

interface ExerciseGroup {
  exerciseId: string;
  exerciseName: string;
  sets: LoggableSet[];
}

@Component({
  selector: 'app-program-logger',
  templateUrl: './program-logger.page.html',
  styleUrls: ['./program-logger.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, FormsModule],
})
export class ProgramLoggerPage implements OnInit {
  private route = inject(ActivatedRoute);
  private programService = inject(ProgramService);
  private toastController = inject(ToastController);

  program: Program | null = null;
  exerciseGroups: ExerciseGroup[] = [];
  loading = true;

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') || '';
    this.programService.getProgram(id).subscribe({
      next: (program) => {
        this.program = program;
        this.buildGroups(program.exercises || []);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.presentToast('Failed to load program', 'danger');
      },
    });
  }

  private buildGroups(exercises: ProgramExercise[]) {
    const map = new Map<string, ExerciseGroup>();
    const sorted = [...exercises].sort((a, b) => a.order - b.order);
    for (const e of sorted) {
      const id = e.exerciseId;
      if (!map.has(id)) {
        map.set(id, {
          exerciseId: id,
          exerciseName: e.exercise?.name || 'Exercise',
          sets: [],
        });
      }
      map.get(id)!.sets.push({ ...e, dirty: false, isNew: false });
    }
    this.exerciseGroups = Array.from(map.values());
  }

  markDirty(set: LoggableSet) {
    set.dirty = true;
  }

  toggleMade(set: LoggableSet) {
    // Cycle: null (unset) -> true (make) -> false (miss) -> null
    if (set.made === null) {
      set.made = true;
    } else if (set.made === true) {
      set.made = false;
    } else {
      set.made = null;
    }
    set.dirty = true;
  }

  addSet(group: ExerciseGroup) {
    const lastSet = group.sets[group.sets.length - 1];
    const newSet: LoggableSet = {
      id: '',
      exerciseId: group.exerciseId,
      exercise: lastSet?.exercise,
      reps: lastSet ? lastSet.reps : 5,
      weight: lastSet ? lastSet.weight : null,
      notes: null,
      order: group.sets.length + 1,
      made: null,
      dirty: true,
      isNew: true,
    };
    group.sets.push(newSet);
  }

  removeSet(group: ExerciseGroup, index: number) {
    group.sets.splice(index, 1);
  }

  saveAll() {
    const allSets: LoggableSet[] = [];
    for (const g of this.exerciseGroups) {
      allSets.push(...g.sets);
    }
    const dirtySets = allSets.filter((s) => s.dirty);

    if (dirtySets.length === 0) {
      this.presentToast('No changes to save', 'success');
      return;
    }

    let saved = 0;
    for (const set of dirtySets) {
      const obs = set.isNew
        ? this.programService.addExerciseSet(this.program!.id, {
            exerciseId: set.exerciseId,
            reps: set.reps,
            weight: set.weight,
            notes: set.notes,
            made: set.made,
          })
        : this.programService.patchExercise(this.program!.id, set.id, {
            reps: set.reps,
            weight: set.weight,
            notes: set.notes,
            made: set.made,
          });

      obs.subscribe({
        next: (result) => {
          set.dirty = false;
          if (set.isNew) {
            set.id = result.id;
            set.isNew = false;
          }
          saved++;
          if (saved === dirtySets.length) {
            this.presentToast('All changes saved', 'success');
          }
        },
        error: () =>
          this.presentToast('Failed to save some changes', 'danger'),
      });
    }
  }

  private async presentToast(
    message: string,
    color: 'success' | 'danger',
  ) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      color,
      position: 'top',
    });
    await toast.present();
  }
}
