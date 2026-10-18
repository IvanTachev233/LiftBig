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
import { ChipGroupComponent, ChipOption } from '../../ui/chip-group.component';
import { BODY_PARTS } from '../../body-part';
import { exerciseSubtitle, sortCategories } from '../../exercise-category';
import { ReadCacheService } from '../../../core/read-cache.service';

/** Data the picker dismisses with (role 'confirm'). Back dismisses with null and role 'cancel'. */
export interface ExercisePickerResult {
  /** Selected exercises in the order they were selected */
  exercises: Exercise[];
  /** true when the user tapped Superset (at least 2 exercises) */
  superset: boolean;
}

/** Chip values for exercises without a category: a coach's own, or global */
const COACH = '__coach';
const NO_CATEGORY = '__none';

function byName(a: Exercise, b: Exercise): number {
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

@Component({
  selector: 'app-exercise-picker',
  templateUrl: './exercise-picker.component.html',
  styleUrls: ['./exercise-picker.component.scss'],
  standalone: true,
  imports: [IonicModule, ChipGroupComponent],
})
export class ExercisePickerComponent implements OnInit {
  private modalCtrl = inject(ModalController);
  private workoutService = inject(WorkoutService);
  private auth = inject(AuthService);
  private cache = inject(ReadCacheService);

  /** Optional preloaded list (componentProps); otherwise the picker loads it */
  @Input() exercises?: Exercise[];
  /** 'replace' limits selection to one exercise and hides the Superset action */
  @Input() mode: 'add' | 'replace' = 'add';
  /** Ids hidden from the list, e.g. exercises already in the current superset */
  @Input() excludeIds: string[] = [];

  readonly allExercises = signal<Exercise[]>([]);
  readonly query = signal('');
  /** Value of the selected chip; 'all' shows every exercise */
  readonly filter = signal<string | null>('all');
  readonly selectedIds = signal<string[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal(false);

  readonly isCoach = computed(() => this.auth.currentUser()?.role === 'COACH');
  readonly selectedSet = computed(() => new Set(this.selectedIds()));
  readonly selectedCount = computed(() => this.selectedIds().length);
  private readonly listed = computed(() => {
    const excluded = new Set(this.excludeIds);
    return this.allExercises().filter((e) => !excluded.has(e.id));
  });
  /** Chips by category; by body part when no exercise has one (older APIs) */
  readonly byCategory = computed(() => this.listed().some((e) => !!e.category));
  readonly chipLabel = computed(() => (this.byCategory() ? 'Category' : 'Body part'));
  /** "All", then the categories (or body parts) of the listed exercises */
  readonly filterChips = computed<ChipOption[]>(() => {
    const listed = this.listed();
    let chips: ChipOption[];
    if (this.byCategory()) {
      const categories = listed.map((e) => e.category).filter((c): c is string => !!c);
      chips = sortCategories(categories).map((c) => ({ value: c, label: c }));
      const without = new Set(listed.filter((e) => !e.category).map((e) => this.chipOf(e)));
      if (without.has(COACH)) chips.push({ value: COACH, label: 'Coach' });
      if (without.has(NO_CATEGORY)) chips.push({ value: NO_CATEGORY, label: 'Other' });
    } else {
      const present = new Set(listed.map((e) => e.bodyPart));
      chips = BODY_PARTS.filter((p) => present.has(p.code)).map((p) => ({
        value: p.code,
        label: p.name,
      }));
    }
    return [{ value: 'all', label: 'All' }, ...chips];
  });
  readonly filteredExercises = computed(() => {
    const q = this.query().trim().toLowerCase();
    const chip = this.filter();
    return this.listed().filter(
      (e) =>
        (!chip || chip === 'all' || this.chipOf(e) === chip) &&
        (!q || e.name.toLowerCase().includes(q)),
    );
  });
  readonly primaryDisabled = computed(() =>
    this.mode === 'replace' ? this.selectedCount() !== 1 : this.selectedCount() < 1,
  );
  readonly primaryLabel = computed(() => {
    const count = this.selectedCount();
    if (this.mode === 'replace') return 'Replace';
    if (count === 0) return 'Add exercise';
    return count === 1 ? 'Add 1 exercise' : `Add ${count} exercises`;
  });

  readonly subtitle = exerciseSubtitle;

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
    // Without a connection, the list last loaded on this phone
    this.cache.read('exercises', this.workoutService.getExercises()).subscribe({
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

  /** The chip value an exercise falls under */
  private chipOf(exercise: Exercise): string | null | undefined {
    if (!this.byCategory()) return exercise.bodyPart;
    return exercise.category || (exercise.createdById ? COACH : NO_CATEGORY);
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
    if (selected && this.mode === 'replace') {
      this.selectedIds.set([exercise.id]);
    } else if (selected && !ids.includes(exercise.id)) {
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

  replace() {
    if (this.selectedCount() !== 1) return;
    this.confirm(false);
  }

  onPrimary() {
    if (this.mode === 'replace') {
      this.replace();
    } else {
      this.add();
    }
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

  // Adds the new exercise in name order (ignoring case) and selects it last;
  // a search or chip that would hide it is cleared
  private insertCreated(exercise: Exercise) {
    const list = this.allExercises().filter((e) => e.id !== exercise.id);
    const index = list.findIndex((e) => byName(e, exercise) > 0);
    list.splice(index === -1 ? list.length : index, 0, exercise);
    this.allExercises.set(list);

    const q = this.query().trim().toLowerCase();
    if (q && !exercise.name.toLowerCase().includes(q)) {
      this.query.set('');
    }
    const chip = this.filter();
    if (chip !== 'all' && this.chipOf(exercise) !== chip) {
      this.filter.set('all');
    }
    this.setSelected(exercise, true);
  }
}
