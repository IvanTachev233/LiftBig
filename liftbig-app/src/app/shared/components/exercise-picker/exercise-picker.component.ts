import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import {
  CheckboxChangeEventDetail,
  IonicModule,
  ModalController,
  SearchbarInputEventDetail,
} from '@ionic/angular';
import { AuthService } from '../../../core/auth.service';
import { Exercise, WorkoutService } from '../../../core/workout.service';
import { ExerciseDetailModalComponent } from '../exercise-detail-modal/exercise-detail-modal.component';
import { CreateExerciseModalComponent } from '../create-exercise-modal/create-exercise-modal.component';

/** Data the picker dismisses with (role 'confirm'). Back dismisses with null and role 'cancel'. */
export interface ExercisePickerResult {
  /** Selected exercises in the order they were selected */
  exercises: Exercise[];
  /** true when the user tapped Superset (at least 2 exercises) */
  superset: boolean;
}

function byName(a: Exercise, b: Exercise): number {
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

@Component({
  selector: 'app-exercise-picker',
  templateUrl: './exercise-picker.component.html',
  styleUrls: ['./exercise-picker.component.scss'],
  standalone: true,
  imports: [IonicModule],
})
export class ExercisePickerComponent implements OnInit {
  private modalCtrl = inject(ModalController);
  private workoutService = inject(WorkoutService);
  private auth = inject(AuthService);

  /** Optional preloaded list (componentProps); otherwise the picker loads it */
  @Input() exercises?: Exercise[];

  readonly allExercises = signal<Exercise[]>([]);
  readonly query = signal('');
  readonly selectedIds = signal<string[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal(false);

  readonly isCoach = computed(() => this.auth.currentUser()?.role === 'COACH');
  readonly selectedSet = computed(() => new Set(this.selectedIds()));
  readonly selectedCount = computed(() => this.selectedIds().length);
  readonly filteredExercises = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.allExercises();
    return q ? all.filter((e) => e.name.toLowerCase().includes(q)) : all;
  });

  // Prevents a double tap from stacking two child modals
  private childModalOpen = false;

  ngOnInit() {
    if (this.exercises) {
      this.allExercises.set([...this.exercises]);
    } else {
      this.load();
    }
  }

  load() {
    this.loading.set(true);
    this.loadError.set(false);
    this.workoutService.getExercises().subscribe({
      next: (list) => {
        this.allExercises.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.loading.set(false);
      },
    });
  }

  onSearch(event: CustomEvent<SearchbarInputEventDetail>) {
    this.query.set(event.detail.value ?? '');
  }

  isSelected(exercise: Exercise): boolean {
    return this.selectedSet().has(exercise.id);
  }

  toggle(exercise: Exercise) {
    this.setSelected(exercise, !this.isSelected(exercise));
  }

  onCheckboxChange(exercise: Exercise, event: CustomEvent<CheckboxChangeEventDetail>) {
    this.setSelected(exercise, event.detail.checked);
  }

  private setSelected(exercise: Exercise, selected: boolean) {
    const ids = this.selectedIds();
    if (selected && !ids.includes(exercise.id)) {
      this.selectedIds.set([...ids, exercise.id]);
    } else if (!selected && ids.includes(exercise.id)) {
      this.selectedIds.set(ids.filter((id) => id !== exercise.id));
    }
  }

  back() {
    return this.modalCtrl.dismiss(null, 'cancel');
  }

  add() {
    if (this.selectedCount() < 1) return;
    this.confirm(false);
  }

  addAsSuperset() {
    if (this.selectedCount() < 2) return;
    this.confirm(true);
  }

  private confirm(superset: boolean) {
    const byId = new Map(this.allExercises().map((e) => [e.id, e]));
    const exercises = this.selectedIds()
      .map((id) => byId.get(id))
      .filter((e): e is Exercise => !!e);
    const result: ExercisePickerResult = { exercises, superset };
    return this.modalCtrl.dismiss(result, 'confirm');
  }

  async openDetails(exercise: Exercise, event?: Event) {
    // Keep the tap from reaching the row, which would toggle the selection
    event?.stopPropagation();
    if (this.childModalOpen) return;
    this.childModalOpen = true;
    try {
      const modal = await this.modalCtrl.create({
        component: ExerciseDetailModalComponent,
        componentProps: { exercise },
      });
      await modal.present();
      await modal.onWillDismiss();
    } finally {
      this.childModalOpen = false;
    }
  }

  async openCreate() {
    if (!this.isCoach() || this.childModalOpen) return;
    this.childModalOpen = true;
    try {
      const modal = await this.modalCtrl.create({
        component: CreateExerciseModalComponent,
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<Exercise>();
      if (role === 'confirm' && data) {
        this.insertCreated(data);
      }
    } finally {
      this.childModalOpen = false;
    }
  }

  // Adds the new exercise in name order (ignoring case) and selects it last
  private insertCreated(exercise: Exercise) {
    const list = this.allExercises().filter((e) => e.id !== exercise.id);
    const index = list.findIndex((e) => byName(e, exercise) > 0);
    list.splice(index === -1 ? list.length : index, 0, exercise);
    this.allExercises.set(list);

    const q = this.query().trim().toLowerCase();
    if (q && !exercise.name.toLowerCase().includes(q)) {
      this.query.set('');
    }
    this.setSelected(exercise, true);
  }
}
