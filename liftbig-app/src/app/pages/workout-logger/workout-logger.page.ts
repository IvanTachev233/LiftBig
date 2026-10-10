import { Component, OnDestroy, OnInit, inject } from '@angular/core';
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
import { AuthService } from '../../core/auth.service';
import { predictPb, PbLift } from '../../shared/pb-predict';
import { ExerciseHistoryModalComponent } from '../../shared/components/exercise-history-modal/exercise-history-modal.component';
import { WeightUnitService } from '../../core/weight-unit.service';

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
  source: WorkoutSource;
  // A coach or program workout: only results, added sets and status can change
  assigned: boolean;
  coachName: string | null;
  programName: string | null;
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

type QueuedRequest = () => Observable<unknown>;

@Component({
  selector: 'app-workout-logger',
  templateUrl: './workout-logger.page.html',
  styleUrls: ['./workout-logger.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, FormsModule],
})
export class WorkoutLoggerPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private workoutService = inject(WorkoutService);
  private toastController = inject(ToastController);
  private modalCtrl = inject(ModalController);
  private alertCtrl = inject(AlertController);
  private authService = inject(AuthService);
  readonly units = inject(WeightUnitService);

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
      this.workoutSubject.next(w);
      this.workoutName = w.name;
    });
  }

  ngOnDestroy() {
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
      source: 'manual',
      assigned: false,
      coachName: null,
      programName: null,
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
        pbBars: card.pbBars,
        isMaxTrackable: card.exercise?.isMaxTrackable,
      }),
    );
    return {
      id: w.id,
      name: w.name,
      date: w.date,
      status: w.status,
      source: workoutSource(w),
      assigned: isPlanLocked(w),
      coachName: w.assignedBy?.name ?? null,
      programName: w.program?.name ?? null,
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

    if (currentWorkout.assigned) {
      this.addAssignedSet(currentWorkout, card, set);
      return;
    }

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
                    if (completing) {
                      draft._pendingComplete = false;
                      draft.status = 'COMPLETED';
                      if (isCurrent) {
                        this.workoutSubject.next(draft);
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
    }
    this.saveResult(set);
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
    const workoutId = this.workoutSubject.value?.id;
    if (!workoutId) return;
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
            tap((saved) => this.adoptPbs(workoutId, set, saved, sentAt)),
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
          this.workoutSubject.next(currentWorkout);
          this.router.navigate([this.dashboardUrl()]);
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
            next: (saved) => this.adoptIds(sent, saved, sentAt),
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
