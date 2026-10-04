import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController } from '@ionic/angular';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  ProgramService,
  Program,
  ProgramCard,
  ProgramSet,
} from '../../core/program.service';
import { GroupBlock, toGroupBlocks } from '../../shared/superset';

interface LoggableSet extends ProgramSet {
  dirty: boolean;
  isNew: boolean;
}

// One exercise card; duplicates of an exercise stay separate cards
interface ExerciseGroup {
  cardId: string;
  exerciseName: string;
  supersetGroup: string | null;
  sets: LoggableSet[];
}

// Icons match the Result column in the program editor
const MADE_STATES = {
  made: {
    icon: 'checkmark-circle',
    color: 'success',
    label: 'Made. Tap to mark as missed',
  },
  missed: {
    icon: 'close-circle',
    color: 'danger',
    label: 'Missed. Tap to clear result',
  },
  unset: {
    icon: 'remove-circle-outline',
    color: 'medium',
    label: 'No result. Tap to mark as made',
  },
};

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
  groupBlocks: GroupBlock<ExerciseGroup>[] = [];
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

  private buildGroups(cards: ProgramCard[]) {
    this.exerciseGroups = [...cards]
      .sort((a, b) => a.order - b.order)
      .map((card) => ({
        cardId: card.id,
        exerciseName: card.exercise?.name || 'Exercise',
        supersetGroup: card.supersetGroup,
        sets: [...(card.sets || [])]
          .sort((a, b) => a.order - b.order)
          .map((set) => ({ ...set, dirty: false, isNew: false })),
      }));
    this.groupBlocks = toGroupBlocks(this.exerciseGroups);
  }

  markDirty(set: LoggableSet) {
    set.dirty = true;
  }

  madeState(set: LoggableSet) {
    if (set.made === true) return MADE_STATES.made;
    if (set.made === false) return MADE_STATES.missed;
    return MADE_STATES.unset;
  }

  toggleMade(set: LoggableSet) {
    // Cycle: unset -> true (make) -> false (miss) -> null
    if (set.made === true) {
      set.made = false;
    } else if (set.made === false) {
      set.made = null;
    } else {
      set.made = true;
    }
    set.dirty = true;
  }

  addSet(group: ExerciseGroup) {
    const lastSet = group.sets[group.sets.length - 1];
    const newSet: LoggableSet = {
      id: '',
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
    const dirtySets: { group: ExerciseGroup; set: LoggableSet }[] = [];
    for (const group of this.exerciseGroups) {
      for (const set of group.sets) {
        if (set.dirty) dirtySets.push({ group, set });
      }
    }

    if (dirtySets.length === 0) {
      this.presentToast('No changes to save', 'success');
      return;
    }

    let saved = 0;
    for (const { group, set } of dirtySets) {
      const body = {
        // The API takes whole reps; an emptied field stays empty
        reps: set.reps == null ? set.reps : Math.round(Number(set.reps)),
        weight: set.weight,
        notes: set.notes,
        made: set.made,
      };
      const obs = set.isNew
        ? this.programService.addSet(this.program!.id, group.cardId, body)
        : this.programService.updateSet(this.program!.id, set.id, body);

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
