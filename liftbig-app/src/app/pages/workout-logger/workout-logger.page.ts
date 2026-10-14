import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonicModule,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { addIcons } from 'ionicons';
import { trophy } from 'ionicons/icons';
import {
  Exercise,
  PbBars,
  SetWriteResponse,
  Workout,
  WorkoutCardInput,
  WorkoutService,
  WorkoutSource,
  WorkoutStatus,
  isPlanLocked,
  workoutSource,
} from '../../core/workout.service';
import {
  Observable,
  Subject,
  switchMap,
  BehaviorSubject,
  of,
  EMPTY,
  shareReplay,
  map,
  concatMap,
  catchError,
  tap,
  finalize,
} from 'rxjs';
import {
  ExercisePickerComponent,
  ExercisePickerResult,
} from '../../shared/components/exercise-picker/exercise-picker.component';
import {
  newSupersetId,
  normalizeSupersets,
  toGroupBlocks,
} from '../../shared/superset';
import { ActiveWorkoutService } from '../../core/active-workout.service';
import { AuthService } from '../../core/auth.service';
import { predictPb, PbLift } from '../../shared/pb-predict';
import { ExerciseHistoryModalComponent } from '../../shared/components/exercise-history-modal/exercise-history-modal.component';
import { WeightUnitService } from '../../core/weight-unit.service';
import { RestTimer, RestTimeService, formatRest } from '../../core/rest-time';
import { ElapsedClock, formatElapsed } from '../../core/elapsed-time';
import { ProgramService, sessionPosition } from '../../core/program.service';
import { OverflowAction, OverflowMenuService } from '../../shared/ui/overflow-menu.service';
import { StatusPillComponent } from '../../shared/ui/status-pill.component';
import { ProgressBarComponent } from '../../shared/ui/progress-bar.component';
import { RestBarComponent } from './rest-bar.component';

// Makes element ids unique when more than one page instance is in the DOM
let nextPageId = 0;

interface LoggerSet {
  // From the API; absent until the save that creates the set returns
  id?: string;
  // Planned reps and weight
  reps: number;
  weight: number | null;
  // true = made, false = missed, null = not logged
  made: boolean | null;
  // Logged values; null means "as planned". actualWeight is in the user's
  // unit, as typed; it is sent as kg.
  actualReps: number | null;
  actualWeight: number | null;
  notes: string | null;
  // Program sets: the target is this percent of the reference lift's 1RM
  prescribedPercent?: number | null;
  referenceExerciseId?: string | null;
  // A personal best: predicted on a change, then as the server said
  pb: boolean;
  // pbClock at the set's last local change; older responses leave its pb alone
  pbTouchedAt?: number;
}

interface LoggerCard {
  // From the API; absent until the save that creates the card returns
  id?: string;
  exerciseId: string;
  exerciseName: string;
  sets: LoggerSet[];
  newWeight: number | null;
  newReps: number | null;
  // Cards sharing a value form one superset; null when not in one
  supersetGroup: string | null;
  // The coach's note for the athlete
  notes: string | null;
  // Bars a set must beat to be a PB; unknown until the API sends them
  pbBars?: PbBars;
  // From the card's exercise; undefined falls back to the exercise list
  isMaxTrackable?: boolean;
}

interface LoggerWorkout {
  id?: string;
  name: string;
  date: string;
  status: WorkoutStatus | 'DRAFT';
  // When the API recorded the start; null before that or when it has none
  startedAt: string | null;
  source: WorkoutSource;
  // A coach or program workout: only results, added sets and status can change
  assigned: boolean;
  coachName: string | null;
  programName: string | null;
  enrollmentId: string | null;
  // In display order
  cards: LoggerCard[];
  _pendingComplete?: boolean;
}

// A card as a save sent it, with its sets at that moment
interface SentCard {
  card: LoggerCard;
  sets: LoggerSet[];
}

const MADE_STATES = {
  made: {
    icon: 'checkmark-sharp',
    color: 'success',
    label: 'Made. Tap to mark as missed',
  },
  missed: {
    icon: 'close-sharp',
    color: 'danger',
    label: 'Missed. Tap to clear result',
  },
  unset: {
    icon: 'checkmark-outline',
    color: 'medium',
    label: 'No result. Tap to mark as made',
  },
};

type QueuedRequest = () => Observable<unknown>;

import { ConfirmSheetService } from '../../shared/ui/confirm-sheet.component';
@Component({
  selector: 'app-workout-logger',
  templateUrl: './workout-logger.page.html',
  styleUrls: ['./workout-logger.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonicModule,
    RouterModule,
    FormsModule,
    StatusPillComponent,
    ProgressBarComponent,
    RestBarComponent,
  ],
})
export class WorkoutLoggerPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private workoutService = inject(WorkoutService);
  private toastController = inject(ToastController);
  private modalCtrl = inject(ModalController);
  private confirmSheet = inject(ConfirmSheetService);
  private authService = inject(AuthService);
  private activeWorkout = inject(ActiveWorkoutService);
  private programService = inject(ProgramService);
  private overflowMenu = inject(OverflowMenuService);
  readonly units = inject(WeightUnitService);
  private restTime = inject(RestTimeService);

  // Rest countdown, started when a set is logged
  readonly rest = new RestTimer();
  // Time since the workout started, shown under its name
  readonly elapsed = new ElapsedClock();
  readonly formatElapsed = formatElapsed;

  dashboardUrl = this.authService.dashboardUrl;

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

  // "Week w · Day d" of a program workout, from its active enrollment
  position: { week: number; day: number } | null = null;

  // Cards opened or closed by a tap; the others follow the first unlogged set
  private toggled = new Map<LoggerCard, boolean>();

  // Set results and added sets of an assigned workout run one at a time, so
  // responses apply in the order the server saved them
  private setWrites = new Subject<QueuedRequest>();

  // Ticks on every local change to a set's result, values or trophy
  private pbClock = 0;
  // pbClock as of the newest write that has finished
  private pbAnsweredAt = 0;

  // Card saves run one at a time, so each sends the ids the previous one
  // returned; each request handles its own errors
  private cardSaves = new Subject<QueuedRequest>();

  constructor() {
    // Bundled so a new PB's trophy shows without fetching its SVG
    addIcons({ trophy });
    this.cardSaves
      .pipe(concatMap((send) => send().pipe(catchError(() => EMPTY))))
      .subscribe();
    this.setWrites
      .pipe(
        concatMap((send) =>
          send().pipe(
            catchError(() => {
              this.presentSaveErrorToast();
              return EMPTY;
            }),
          ),
        ),
      )
      .subscribe();
  }

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
      this.toggled.clear();
      this.position = null;
      this.workoutSubject.next(w);
      this.syncElapsed();
      this.workoutName = w.name;
      if (w.source === 'program') this.loadPosition(w);
    });
  }

  ngOnDestroy() {
    this.rest.stop();
    this.elapsed.stop();
    // Requests already queued still go out
    this.setWrites.complete();
    this.cardSaves.complete();
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
      startedAt: null,
      source: 'manual',
      assigned: false,
      coachName: null,
      programName: null,
      enrollmentId: null,
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
          made: set.made,
          actualReps: set.actualReps,
          actualWeight: this.units.toInput(set.actualWeight),
          notes: set.notes,
          prescribedPercent: set.prescribedPercent ?? null,
          referenceExerciseId: set.referenceExerciseId ?? null,
          pb: !!set.pb,
        })),
        newWeight: null,
        newReps: null,
        supersetGroup: card.supersetGroup ?? null,
        notes: card.notes ?? null,
        pbBars: card.pbBars,
        isMaxTrackable: card.exercise?.isMaxTrackable,
      }),
    );
    return {
      id: w.id,
      name: w.name,
      date: w.date,
      status: w.status,
      startedAt: w.startedAt ?? null,
      source: workoutSource(w),
      assigned: isPlanLocked(w),
      coachName: w.assignedBy?.name ?? null,
      programName: w.program?.name ?? null,
      enrollmentId: w.program?.enrollmentId ?? null,
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
        notes: null,
        isMaxTrackable: ex.isMaxTrackable,
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
      card.isMaxTrackable = ex.isMaxTrackable;
      // The old exercise's bars don't apply; the save sends the new ones
      card.pbBars = undefined;
      this.saveCards();
    } finally {
      this.pickerOpen = false;
    }
  }

  /** Rep max history of the card's exercise */
  async openHistory(card: LoggerCard) {
    const modal = await this.modalCtrl.create({
      component: ExerciseHistoryModalComponent,
      componentProps: {
        exerciseId: card.exerciseId,
        exerciseName: card.exerciseName,
      },
      breakpoints: [0, 0.94],
      initialBreakpoint: 0.94,
      handle: true,
    });
    await modal.present();
    await modal.onDidDismiss();
    this.refreshPbBars();
  }

  /**
   * Removing an entry in the history can lower a bar or take a set's trophy;
   * refetches only the bars and trophies
   */
  private refreshPbBars() {
    const workoutId = this.workoutSubject.value?.id;
    if (!workoutId) return;
    // The GET may be served before writes still pending, so it only knows
    // about changes whose write had already finished
    const knownAt = this.pbAnsweredAt;
    this.workoutService.getWorkout(workoutId).subscribe({
      next: (fetched) => {
        if (this.workoutSubject.value?.id !== workoutId) return;
        for (const card of this.cards) {
          const match = fetched.exercises?.find((c) => c.id === card.id);
          if (!match) continue;
          // Bars leave out this workout's own sets, so only a replaced
          // exercise makes them stale
          if (match.exerciseId === card.exerciseId) card.pbBars = match.pbBars;
          for (const set of card.sets) {
            const fetchedSet = set.id ? match.sets?.find((s) => s.id === set.id) : undefined;
            if (fetchedSet) this.adoptPb(set, !!fetchedSet.pb, knownAt);
          }
        }
      },
      // Keeps the old bars; the next save sends fresh ones
      error: () => undefined,
    });
  }

  /** Asks to confirm, then removes every member of the superset and their sets */
  async removeSuperset(supersetGroup: string | null) {
    if (!supersetGroup) return;
    const members = this.cards.filter(
      (c) => c.supersetGroup === supersetGroup,
    );
    if (!members.length) return;

    const confirmed = await this.confirmSheet.confirm({
      title: 'Delete superset?',
      message: `Removes ${members.length} exercises and their sets`,
      confirmLabel: 'Delete superset',
    });
    if (!confirmed) return;

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

    const set: LoggerSet = {
      weight: this.units.toKg(card.newWeight),
      // The API takes whole reps
      reps: Math.max(1, Math.round(Number(card.newReps))),
      made: true,
      actualReps: null,
      actualWeight: null,
      notes: null,
      pb: false,
    };
    card.sets.push(set);
    this.predictPb(set);
    card.newWeight = null;
    card.newReps = null;
    this.saveAddedSet(currentWorkout, card, set);
    this.startRest();
  }

  /** "+ Add set": an unlogged set with the previous set's planned reps and weight */
  copyLastSet(card: LoggerCard) {
    const currentWorkout = this.workoutSubject.value;
    const last = card.sets[card.sets.length - 1];
    if (!currentWorkout || !last) return;
    const set: LoggerSet = {
      reps: last.reps,
      weight: last.weight,
      made: null,
      actualReps: null,
      actualWeight: null,
      notes: null,
      pb: false,
    };
    card.sets.push(set);
    this.saveAddedSet(currentWorkout, card, set);
  }

  /** Saves a set just added to the card; a draft is created by its first set */
  private saveAddedSet(workout: LoggerWorkout, card: LoggerCard, set: LoggerSet) {
    if (workout.assigned) {
      this.addAssignedSet(workout, card, set);
      return;
    }

    if (!workout.id) {
      if (!this.inFlightCreates.has(workout)) {
        this.createDraftWorkout(workout);
      }
      return;
    }

    this.saveCards();
  }

  /**
   * A self-made set's own weight (typed in the user's unit) or reps, committed
   * from its input. Reps below 1 or not a number put the old value back.
   */
  setValueChanged(set: LoggerSet, field: 'weight' | 'reps', event: Event) {
    const value = (event as CustomEvent<{ value?: string | null }>).detail?.value;
    if (field === 'reps') {
      const reps = this.toNumber(value, true);
      if (reps === null || reps < 1) {
        const input = event.target as HTMLIonInputElement | null;
        if (input) input.value = set.reps;
        return;
      }
      if (reps === set.reps) return;
      set.reps = reps;
    } else {
      const typed = this.toNumber(value);
      // An unchanged pound value would otherwise drift by its rounding
      if (typed === this.units.toInput(set.weight)) return;
      set.weight = this.units.toKg(typed);
    }
    this.predictPb(set);
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

          this.cardSaves.next(() => {
            const sent = this.sentCards(draft.cards);
            const sentAt = this.pbClock;
            return this.workoutService
              .updateWorkout(created.id, {
                name: patchName,
                date: draft.date,
                exercises: this.cardsBody(sent),
                status: completing ? 'COMPLETED' : 'IN_PROGRESS',
              })
              .pipe(
                finalize(() => this.answered(sentAt)),
                tap({
                  next: (saved) => {
                    this.adoptIds(sent, saved, sentAt);
                    this.adoptStart(draft, saved?.startedAt);
                    if (completing) {
                      draft._pendingComplete = false;
                      draft.status = 'COMPLETED';
                      this.activeWorkout.completed(created.id);
                      if (isCurrent) {
                        this.workoutSubject.next(draft);
                        this.syncElapsed();
                        this.router.navigate([this.dashboardUrl()]);
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
                }),
              );
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

  /** Self-made tick: made or not logged */
  toggleSetCompletion(set: LoggerSet) {
    set.made = set.made === true ? null : true;
    this.predictPb(set);
    this.saveCards();
    if (set.made !== null) this.startRest();
  }

  madeState(set: LoggerSet) {
    if (set.made === true) return MADE_STATES.made;
    if (set.made === false) return MADE_STATES.missed;
    return MADE_STATES.unset;
  }

  /** Assigned set result: unset -> made -> missed -> unset */
  toggleMade(set: LoggerSet) {
    if (set.made === true) {
      set.made = false;
    } else if (set.made === false) {
      set.made = null;
    } else {
      set.made = true;
      this.startRest();
    }
    this.saveResult(set);
  }

  /** Starts the rest countdown at the user's default; 0 (off) shows none */
  private startRest() {
    this.rest.start(this.restTime.seconds());
  }

  /** " · rest 2:00" after an expanded card's plan; empty when off or no sets */
  restSuffix(card: LoggerCard): string {
    const seconds = this.restTime.seconds();
    return seconds && card.sets.length ? ` · rest ${formatRest(seconds)}` : '';
  }

  /** An actual value was committed; an unlogged set sends it with its result */
  actualChanged(set: LoggerSet) {
    if (set.made === null) return;
    this.saveResult(set);
  }

  coachLabel(workout: LoggerWorkout): string {
    return workout.coachName ? `Coach · ${workout.coachName}` : 'Coach';
  }

  programLabel(workout: LoggerWorkout): string {
    return workout.programName ? `Program · ${workout.programName}` : 'Program';
  }

  /** e.g. "70% of Back Squat" for a program set */
  prescriptionLabel(set: LoggerSet): string {
    const id = set.referenceExerciseId;
    const name =
      this.exercisesList.find((e) => e.id === id)?.name ??
      this.cards.find((c) => c.exerciseId === id)?.exerciseName ??
      'your 1RM';
    return `${set.prescribedPercent}% of ${name}`;
  }

  /** A planned kg weight in the user's unit */
  weightLabel(weight: number | null): string {
    return this.units.format(weight);
  }

  /** Sends the set's whole result, queued behind its earlier requests */
  private saveResult(set: LoggerSet) {
    const workout = this.workoutSubject.value;
    const workoutId = workout?.id;
    if (!workout || !workoutId) return;
    // The API takes whole reps; an empty input means "as planned"
    set.actualReps = this.toNumber(set.actualReps, true);
    set.actualWeight = this.toNumber(set.actualWeight);
    this.predictPb(set);
    const body = {
      made: set.made,
      actualReps: set.actualReps,
      actualWeight: this.units.toKg(set.actualWeight),
    };
    // Set writes go in order, so the server has every change made before this one
    const sentAt = this.pbClock;
    // The id is read when the request runs: a pending add sets it first
    this.setWrites.next(() =>
      set.id
        ? this.workoutService.updateSetResult(workoutId, set.id, body).pipe(
            finalize(() => this.answered(sentAt)),
            tap((saved) => {
              this.adoptPbs(workoutId, set, saved, sentAt);
              this.adoptStart(workout, saved?.workoutStartedAt);
            }),
          )
        : EMPTY,
    );
  }

  private addAssignedSet(workout: LoggerWorkout, card: LoggerCard, set: LoggerSet) {
    if (!workout.id || !card.id) return;
    const { id: workoutId } = workout;
    const cardId = card.id;
    // Built when it runs, so the body and sentAt see the same changes
    this.setWrites.next(() => {
      const sentAt = this.pbClock;
      return this.workoutService
        .addSet(workoutId, cardId, { reps: set.reps, weight: set.weight, made: set.made })
        .pipe(
          finalize(() => this.answered(sentAt)),
          tap({
            next: (saved) => {
              set.id = saved.id;
              this.adoptPbs(workoutId, set, saved, sentAt);
              this.adoptStart(workout, saved?.workoutStartedAt);
            },
            error: () => {
              const i = card.sets.indexOf(set);
              if (i >= 0) card.sets.splice(i, 1);
            },
          }),
        );
    });
  }

  private toNumber(value: unknown, whole = false): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    if (Number.isNaN(n)) return null;
    return whole ? Math.max(0, Math.round(n)) : n;
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
        this.syncElapsed();
        this.router.navigate([this.dashboardUrl()]);
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
          this.activeWorkout.completed(currentWorkout.id!);
          this.workoutSubject.next(currentWorkout);
          this.syncElapsed();
          this.router.navigate([this.dashboardUrl()]);
        },
        error: () => {
          currentWorkout._pendingComplete = false;
          this.workoutSubject.next(currentWorkout);
          this.presentSaveErrorToast();
        },
      });
  }

  /** Sets with a result, made or missed */
  loggedCount(cards: LoggerCard[]): number {
    return cards.reduce((n, c) => n + c.sets.filter((s) => s.made !== null).length, 0);
  }

  setCount(cards: LoggerCard[]): number {
    return cards.reduce((n, c) => n + c.sets.length, 0);
  }

  /** The card holding the first unlogged set, or the first card with no sets */
  private focusCard(): LoggerCard | undefined {
    return this.cards.find((c) => !c.sets.length || c.sets.some((s) => s.made === null));
  }

  /**
   * A block (a card, or a superset's members) is open when tapped open, or
   * when it holds the focus card. With every set logged, all are open.
   */
  isExpanded(cards: LoggerCard[]): boolean {
    const tapped = cards.map((c) => this.toggled.get(c)).find((v) => v !== undefined);
    if (tapped !== undefined) return tapped;
    const focus = this.focusCard();
    return !focus || cards.includes(focus);
  }

  toggleExpanded(cards: LoggerCard[]) {
    const open = !this.isExpanded(cards);
    for (const card of cards) this.toggled.set(card, open);
  }

  /** The row to log next: the focus card's first unlogged set */
  isActiveSet(set: LoggerSet): boolean {
    return this.focusCard()?.sets.find((s) => s.made === null) === set;
  }

  /** e.g. "3 × 5 @ 100 kg · 70%" when every set is the same, else "3 sets" */
  planLine(card: LoggerCard): string {
    const sets = card.sets;
    if (!sets.length) return 'No sets yet';
    const [first] = sets;
    const same = sets.every((s) => s.reps === first.reps && s.weight === first.weight);
    let line = `${sets.length} sets`;
    if (same) {
      line = `${sets.length} × ${first.reps}`;
      if (first.weight !== null) line += ` @ ${this.units.format(first.weight)}`;
    }
    const percent = first.prescribedPercent;
    if (percent && sets.every((s) => s.prescribedPercent === percent)) line += ` · ${percent}%`;
    return line;
  }

  /** The card's `⋯` menu; plan-locked workouts only show the history */
  async openCardMenu(card: LoggerCard) {
    const history: OverflowAction = { id: 'history', text: 'History' };
    const actions: OverflowAction[] = this.workoutSubject.value?.assigned
      ? [history]
      : [
          { id: 'replace', text: 'Replace' },
          history,
          ...(card.supersetGroup
            ? [{ id: 'delete-superset', text: 'Delete superset', destructive: true }]
            : []),
          { id: 'remove', text: 'Remove', destructive: true },
        ];
    switch (await this.overflowMenu.open(actions, card.exerciseName)) {
      case 'replace':
        await this.replaceExercise(card);
        break;
      case 'history':
        await this.openHistory(card);
        break;
      case 'delete-superset':
        await this.removeSuperset(card.supersetGroup);
        break;
      case 'remove':
        this.removeExercise(card);
        break;
    }
  }

  private loadPosition(workout: LoggerWorkout) {
    this.programService.getActive().subscribe({
      next: ({ active }) => {
        if (this.workoutSubject.value !== workout || !workout.id) return;
        this.position =
          active && active.id === workout.enrollmentId
            ? sessionPosition(active, workout.id)
            : null;
      },
      // The week is left out
      error: () => undefined,
    });
  }

  /** Whether any card has a logged set; Complete needs one */
  hasSets(workout: LoggerWorkout): boolean {
    return workout.cards.some((c) => c.sets.length > 0);
  }

  private saveCards() {
    const currentWorkout = this.workoutSubject.value;
    // An assigned workout's cards can't be changed by the client
    if (!currentWorkout || !currentWorkout.id || currentWorkout.assigned) return;
    const workoutId = currentWorkout.id;
    // Built when it runs, so it has the cards and ids as they are then
    this.cardSaves.next(() => {
      const sent = this.sentCards(currentWorkout.cards);
      // The body has every change made so far
      const sentAt = this.pbClock;
      return this.workoutService
        .updateWorkout(workoutId, { exercises: this.cardsBody(sent) })
        .pipe(
          finalize(() => this.answered(sentAt)),
          tap({
            next: (saved) => {
              this.adoptIds(sent, saved, sentAt);
              this.adoptStart(currentWorkout, saved?.startedAt);
            },
            error: () => this.presentSaveErrorToast(),
          }),
        );
    });
  }

  /** Cards with sets in display order, as a save sends them */
  private sentCards(cards: LoggerCard[]): SentCard[] {
    return cards
      .filter((card) => card.sets.length > 0)
      .map((card) => ({ card, sets: [...card.sets] }));
  }

  /**
   * Positions from 1. Cards and sets without an id are created by the API.
   * Actual values are left out, so the API keeps them.
   */
  private cardsBody(sent: SentCard[]): WorkoutCardInput[] {
    return sent.map(({ card, sets }, i) => ({
      ...(card.id ? { id: card.id } : {}),
      exerciseId: card.exerciseId,
      order: i + 1,
      supersetGroup: card.supersetGroup,
      sets: sets.map((set, j) => ({
        ...(set.id ? { id: set.id } : {}),
        reps: set.reps,
        weight: set.weight,
        order: j + 1,
        made: set.made,
      })),
    }));
  }

  /**
   * Shows or clears the set's trophy at once from the card's bars; the save
   * response replaces it. Without bars the trophy waits for the response.
   */
  private predictPb(set: LoggerSet) {
    set.pbTouchedAt = ++this.pbClock;
    const card = this.cards.find((c) => c.sets.includes(set));
    if (!card) return;
    const isMaxTrackable =
      card.isMaxTrackable ??
      !!this.exercisesList.find((e) => e.id === card.exerciseId)?.isMaxTrackable;
    const otherPbs = this.cards
      .filter((c) => c.exerciseId === card.exerciseId)
      .reduce<LoggerSet[]>((all, c) => all.concat(c.sets), [])
      .filter((s) => s !== set && s.pb)
      .map((s) => this.liftKg(s));
    const guess = predictPb(this.liftKg(set), card.pbBars, isMaxTrackable, otherPbs);
    if (guess !== null) set.pb = guess;
  }

  /** The set's values with the actual weight in kg */
  private liftKg(set: LoggerSet): PbLift {
    return {
      made: set.made,
      reps: set.reps,
      actualReps: set.actualReps,
      weight: set.weight,
      actualWeight: this.units.toKg(set.actualWeight),
    };
  }

  /**
   * Gives the cards and sets a save sent the ids the API saved them under,
   * matched by the positions they were sent at. Cards and sets added since
   * get theirs from the next save.
   */
  private adoptIds(sent: SentCard[], saved: Workout | null, sentAt: number) {
    const savedCards = saved?.exercises ?? [];
    sent.forEach(({ card, sets }, i) => {
      const savedCard = savedCards.find((c) => c.order === i + 1);
      if (!savedCard) return;
      card.id = savedCard.id;
      // A save sent before the exercise was replaced has the old bars
      if (savedCard.pbBars && savedCard.exerciseId === card.exerciseId) {
        card.pbBars = savedCard.pbBars;
      }
      sets.forEach((set, j) => {
        const savedSet = savedCard.sets?.find((s) => s.order === j + 1);
        if (!savedSet) return;
        set.id = savedSet.id;
        this.adoptPb(set, !!savedSet.pb, sentAt);
      });
    });
  }

  /**
   * Trophies from a set write's answer: every shown set from the workout's
   * PB set ids, or only the set itself when they are missing
   */
  private adoptPbs(
    workoutId: string,
    set: LoggerSet,
    saved: SetWriteResponse | null,
    sentAt: number,
  ) {
    const pbSetIds = saved?.workoutPb?.pbSetIds;
    if (!pbSetIds) {
      if (saved && saved.id === set.id) this.adoptPb(set, !!saved.pb, sentAt);
      return;
    }
    // Another workout may be shown by now
    if (this.workoutSubject.value?.id !== workoutId) return;
    for (const card of this.cards) {
      for (const s of card.sets) {
        if (s.id) this.adoptPb(s, pbSetIds.includes(s.id), sentAt);
      }
    }
  }

  /** The server's trophy, unless the set changed after the request was sent */
  private adoptPb(set: LoggerSet, pb: boolean, sentAt: number) {
    if ((set.pbTouchedAt ?? 0) <= sentAt) set.pb = pb;
  }

  /** The start time from a save's answer; the first one stays */
  private adoptStart(workout: LoggerWorkout, startedAt: string | null | undefined) {
    if (!startedAt || workout.startedAt) return;
    workout.startedAt = startedAt;
    if (this.workoutSubject.value === workout) this.syncElapsed();
  }

  /** Runs the elapsed clock for the shown workout while it is started and not completed */
  private syncElapsed() {
    const workout = this.workoutSubject.value;
    if (workout?.startedAt && workout.status !== 'COMPLETED') {
      this.elapsed.start(workout.startedAt);
    } else {
      this.elapsed.stop();
    }
  }

  private answered(sentAt: number) {
    this.pbAnsweredAt = Math.max(this.pbAnsweredAt, sentAt);
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
