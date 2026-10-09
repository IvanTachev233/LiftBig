import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import {
  AlertController,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { WorkoutLoggerPage } from './workout-logger.page';
import {
  ExercisePickerComponent,
  ExercisePickerResult,
} from '../../shared/components/exercise-picker/exercise-picker.component';
import { Workout, WorkoutCard, WorkoutSet } from '../../core/workout.service';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { fakeToken } from '../../core/auth.testing';
import { WeightUnitService } from '../../core/weight-unit.service';
import { ExerciseHistoryModalComponent } from '../../shared/components/exercise-history-modal/exercise-history-modal.component';

describe('WorkoutLoggerPage', () => {
  let component: WorkoutLoggerPage;
  let fixture: ComponentFixture<WorkoutLoggerPage>;
  let httpTesting: HttpTestingController;
  let queryParamsSubject: BehaviorSubject<any>;
  let router: Router;
  let toastControllerSpy: jasmine.SpyObj<ToastController>;
  let toastSpy: jasmine.SpyObj<HTMLIonToastElement>;
  let modalCtrlSpy: jasmine.SpyObj<ModalController>;
  let alertCtrlSpy: jasmine.SpyObj<AlertController>;

  const workoutsUrl = `${environment.apiUrl}/workouts`;

  beforeEach(() => {
    queryParamsSubject = new BehaviorSubject<any>({});

    toastSpy = jasmine.createSpyObj('HTMLIonToastElement', ['present']);
    toastSpy.present.and.resolveTo();
    toastControllerSpy = jasmine.createSpyObj('ToastController', ['create']);
    toastControllerSpy.create.and.resolveTo(toastSpy);
    modalCtrlSpy = jasmine.createSpyObj('ModalController', ['create']);
    alertCtrlSpy = jasmine.createSpyObj('AlertController', ['create']);

    TestBed.configureTestingModule({
      imports: [WorkoutLoggerPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { queryParams: queryParamsSubject.asObservable() },
        },
        { provide: ToastController, useValue: toastControllerSpy },
        { provide: AlertController, useValue: alertCtrlSpy },
      ],
    });
    // IonicModule gives the standalone page its own ModalController (which
    // needs IonicModule.forRoot), so stub it at the component level
    TestBed.overrideComponent(WorkoutLoggerPage, {
      add: { providers: [{ provide: ModalController, useValue: modalCtrlSpy }] },
    });

    httpTesting = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  function createComponentWithNoId() {
    fixture = TestBed.createComponent(WorkoutLoggerPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    httpTesting.expectOne(`${workoutsUrl}/exercises`).flush([]);
  }

  function current() {
    return component.workoutSubject.value!;
  }

  /** An API card; set ids are `<card id>-s<n>`, card order 0 = its position in the response */
  function card(
    id: string,
    exerciseId: string,
    name: string,
    reps: number[],
    supersetGroup: string | null = null,
    weight = 100,
  ): WorkoutCard {
    return {
      id,
      workoutId: 'w',
      exerciseId,
      exercise: { id: exerciseId, name },
      order: 0,
      supersetGroup,
      sets: reps.map((r, j) => ({
        id: `${id}-s${j + 1}`,
        workoutExerciseId: id,
        reps: r,
        weight,
        order: j + 1,
        made: true,
        actualReps: null,
        actualWeight: null,
        notes: null,
      })),
    };
  }

  function workoutResponse(id: string, cards: WorkoutCard[]): Workout {
    return {
      id,
      name: 'Saved Workout',
      date: new Date().toISOString(),
      status: 'IN_PROGRESS',
      totalWeightLifted: 0,
      assignedById: null,
      assignedBy: null,
      exercises: cards.map((c, i) => ({ ...c, order: c.order || i + 1 })),
    };
  }

  /** What the API returns for a PATCH body: given ids kept, new rows get ids */
  function savedResponse(id: string, body: any, names: Record<string, string>): Workout {
    return workoutResponse(
      id,
      body.exercises.map((c: any, i: number) => {
        const cardId = c.id ?? `${id}-new${i + 1}`;
        return {
          id: cardId,
          workoutId: id,
          exerciseId: c.exerciseId,
          exercise: { id: c.exerciseId, name: names[c.exerciseId] },
          order: c.order,
          supersetGroup: c.supersetGroup ?? null,
          sets: c.sets.map((s: any, j: number) => ({
            id: s.id ?? `${cardId}-new${j + 1}`,
            workoutExerciseId: cardId,
            reps: s.reps,
            weight: s.weight,
            order: s.order,
            made: s.made ?? null,
            actualReps: null,
            actualWeight: null,
            notes: null,
          })),
        };
      }),
    );
  }

  function loadWorkout(id: string, cards: WorkoutCard[]) {
    loadResponse(workoutResponse(id, cards));
  }

  function loadResponse(workout: Workout) {
    queryParamsSubject.next({ id: workout.id });
    httpTesting
      .expectOne((req) => req.method === 'GET' && req.url === `${workoutsUrl}/${workout.id}`)
      .flush(workout);
    fixture.detectChanges();
  }

  function patchBody(id: string) {
    const patch = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/${id}`,
    );
    const body = JSON.parse(JSON.stringify(patch.request.body));
    patch.flush({});
    return body;
  }

  /** [exerciseId, order, supersetGroup, reps per set] of each card in a PATCH body */
  function cardSummary(body: any) {
    return body.exercises.map((c: any) => [
      c.exerciseId,
      c.order,
      c.supersetGroup,
      c.sets.map((s: any) => s.reps),
    ]);
  }

  function titles(): string[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.exercise-title')).map(
      (t: any) => t.textContent.trim(),
    );
  }

  function memberTitles(): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('.superset-card .exercise-title'),
    ).map((t: any) => t.textContent.trim());
  }

  function el(selector: string): HTMLElement {
    return fixture.nativeElement.querySelector(selector);
  }

  function stubPicker(data: ExercisePickerResult | null, role: string) {
    const modal = jasmine.createSpyObj<HTMLIonModalElement>(
      'HTMLIonModalElement',
      ['present', 'onWillDismiss'],
    );
    modal.present.and.resolveTo();
    modal.onWillDismiss.and.resolveTo({ data, role } as any);
    modalCtrlSpy.create.and.resolveTo(modal);
    return modalCtrlSpy.create;
  }

  function stubAlert(role: string) {
    const alert = jasmine.createSpyObj<HTMLIonAlertElement>(
      'HTMLIonAlertElement',
      ['present', 'onDidDismiss'],
    );
    alert.present.and.resolveTo();
    alert.onDidDismiss.and.resolveTo({ role } as any);
    alertCtrlSpy.create.and.resolveTo(alert);
    return alertCtrlSpy.create;
  }

  it('should create', () => {
    createComponentWithNoId();
    expect(component).toBeTruthy();
  });

  it('opens a local draft with no id and sends no POST other than the exercises GET', () => {
    createComponentWithNoId();

    httpTesting.expectNone(
      (req) => req.method === 'POST' && req.url === workoutsUrl,
    );
    expect(component.workoutSubject.value).toBeTruthy();
    expect(current().id).toBeUndefined();
    expect(current().name).toBe('New Workout');
    expect(current().cards).toEqual([]);
    expect(component.cards).toEqual([]);
  });

  it('adding an exercise and renaming/re-dating the draft sends no requests to /workouts', () => {
    createComponentWithNoId();

    component.exercisesList = [{ id: 'ex1', name: 'Bench Press' }];
    component.addExercises([{ id: 'ex1', name: 'Bench Press' }]);

    component.workoutName = 'Push Day';
    component.updateWorkoutName();

    component.updateWorkoutDate({
      detail: { value: '2026-01-01T00:00:00.000Z' },
    });

    httpTesting.expectNone(
      (req) => req.url === workoutsUrl || req.url.startsWith(`${workoutsUrl}/`),
    );
    expect(component.cards.length).toBe(1);
    expect(current().name).toBe('Push Day');
    expect(current().date).toBe('2026-01-01T00:00:00.000Z');
  });

  it('adding the first set sends exactly 1 POST, then PATCHes with the typed name, date, the card with its set and IN_PROGRESS status', () => {
    createComponentWithNoId();

    component.exercisesList = [{ id: 'ex1', name: 'Bench Press' }];
    component.addExercises([{ id: 'ex1', name: 'Bench Press' }]);
    component.workoutName = 'Push Day';

    const draftDate = current().date;
    const c = component.cards[0];
    c.newWeight = 100;
    c.newReps = 5;

    component.addSetToExercise(c);

    const postReq = httpTesting.expectOne(
      (req) => req.method === 'POST' && req.url === workoutsUrl,
    );
    expect(postReq.request.body.name).toBe('Push Day');
    expect(postReq.request.body.date).toBe(draftDate);
    postReq.flush({ id: 'w1', name: 'Push Day', date: draftDate, exercises: [] });

    const patchReq = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w1`,
    );
    const body = JSON.parse(JSON.stringify(patchReq.request.body));
    expect(body.name).toBe('Push Day');
    expect(body.date).toBe(draftDate);
    expect(body.status).toBe('IN_PROGRESS');
    // New card and set: no ids, positions from 1, no per-set exercise data
    expect(body.exercises).toEqual([
      {
        exerciseId: 'ex1',
        order: 1,
        supersetGroup: null,
        sets: [{ reps: 5, weight: 100, order: 1, made: true }],
      },
    ]);
    patchReq.flush({});

    expect(router.navigate).toHaveBeenCalledWith(
      [],
      jasmine.objectContaining({
        queryParams: { id: 'w1' },
        replaceUrl: true,
      }),
    );

    // Re-emitted id after replaceUrl does not refetch
    queryParamsSubject.next({ id: 'w1' });
    httpTesting.expectNone(
      (req) => req.method === 'GET' && req.url === `${workoutsUrl}/w1`,
    );
  });

  it('adding a second set, including one added while the create POST is still pending, sends no additional POST', () => {
    createComponentWithNoId();

    component.exercisesList = [{ id: 'ex1', name: 'Bench Press' }];
    component.addExercises([{ id: 'ex1', name: 'Bench Press' }]);

    const c = component.cards[0];
    c.newWeight = 100;
    c.newReps = 5;
    component.addSetToExercise(c);

    // Double tap: a second set is added before the first create resolves.
    c.newWeight = 90;
    c.newReps = 8;
    component.addSetToExercise(c);

    const postReqs = httpTesting.match(
      (req) => req.method === 'POST' && req.url === workoutsUrl,
    );
    expect(postReqs.length).toBe(1);

    const draftDate = current().date;
    postReqs[0].flush({
      id: 'w1',
      name: 'New Workout',
      date: draftDate,
      exercises: [],
    });

    const patchReq = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w1`,
    );
    expect(patchReq.request.body.exercises.length).toBe(1);
    expect(
      patchReq.request.body.exercises[0].sets.map((s: any) => [s.reps, s.order]),
    ).toEqual([
      [5, 1],
      [8, 2],
    ]);
    patchReq.flush({});

    // Once saved, new sets PATCH instead of POST
    c.newWeight = 80;
    c.newReps = 3;
    component.addSetToExercise(c);

    const patchReq2 = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w1`,
    );
    expect(patchReq2.request.body.exercises[0].sets.length).toBe(3);
    patchReq2.flush({});

    httpTesting.expectNone(
      (req) => req.method === 'POST' && req.url === workoutsUrl,
    );
  });

  it('sends a decimal reps entry as a whole number', () => {
    createComponentWithNoId();
    loadWorkout('w70', [card('c1', 'ex1', 'Bench Press', [5])]);
    const [bench] = component.cards;

    bench.newWeight = 102.5;
    bench.newReps = '8.5' as any;
    component.addSetToExercise(bench);

    expect(patchBody('w70').exercises).toEqual([
      {
        id: 'c1',
        exerciseId: 'ex1',
        order: 1,
        supersetGroup: null,
        sets: [
          { id: 'c1-s1', reps: 5, weight: 100, order: 1, made: true },
          { reps: 9, weight: 102.5, order: 2, made: true },
        ],
      },
    ]);
  });

  it('a stale create for draft A does not hijack draft B once the view has moved on', () => {
    createComponentWithNoId();

    component.exercisesList = [{ id: 'ex1', name: 'Bench Press' }];
    component.addExercises([{ id: 'ex1', name: 'Bench Press' }]);

    const cardA = component.cards[0];
    cardA.newWeight = 100;
    cardA.newReps = 5;
    component.addSetToExercise(cardA);

    const postReq = httpTesting.expectOne(
      (req) => req.method === 'POST' && req.url === workoutsUrl,
    );

    // User opens a new draft (B) before A's create resolves
    (router.navigate as jasmine.Spy).calls.reset();
    queryParamsSubject.next({});

    expect(current().id).toBeUndefined();
    expect(current().name).toBe('New Workout');
    expect(component.cards.length).toBe(0);

    postReq.flush({ id: 'a1', name: 'New Workout', date: new Date().toISOString(), exercises: [] });

    const patchReq = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/a1`,
    );
    patchReq.flush({});

    expect(router.navigate).not.toHaveBeenCalled();
    httpTesting.expectNone(
      (req) => req.method === 'GET' && req.url === `${workoutsUrl}/a1`,
    );
    expect(current().id).toBeUndefined();
    expect(current().name).toBe('New Workout');
    expect(component.cards.length).toBe(0);
  });

  it('a stale create saves the left draft\'s own cards in card order with their superset, not logging order', () => {
    createComponentWithNoId();
    component.addExercises([{ id: 'ex3', name: 'Curl' }]);
    component.addExercises(
      [
        { id: 'ex1', name: 'Bench Press' },
        { id: 'ex2', name: 'Row' },
      ],
      true,
    );
    const [curl, bench, row] = component.cards;
    const sg = bench.supersetGroup;

    // Logged last card first
    for (const [c, reps] of [[row, 8], [bench, 5], [curl, 10]] as const) {
      c.newWeight = 50;
      c.newReps = reps;
      component.addSetToExercise(c);
    }
    const postReq = httpTesting.expectOne(
      (req) => req.method === 'POST' && req.url === workoutsUrl,
    );

    // Leave for a new draft before the create resolves
    queryParamsSubject.next({});
    expect(component.cards.length).toBe(0);

    postReq.flush({ id: 'a2', name: 'New Workout', date: new Date().toISOString(), exercises: [] });

    expect(cardSummary(patchBody('a2'))).toEqual([
      ['ex3', 1, null, [10]],
      ['ex1', 2, sg, [5]],
      ['ex2', 3, sg, [8]],
    ]);
  });

  it('completing the workout while its create is still in flight completes it as COMPLETED once created, and navigates only after that', () => {
    createComponentWithNoId();

    component.exercisesList = [{ id: 'ex1', name: 'Bench Press' }];
    component.addExercises([{ id: 'ex1', name: 'Bench Press' }]);

    const c = component.cards[0];
    c.newWeight = 100;
    c.newReps = 5;
    component.addSetToExercise(c);

    const postReq = httpTesting.expectOne(
      (req) => req.method === 'POST' && req.url === workoutsUrl,
    );

    component.completeWorkout();

    // Stays on the page until the workout is saved
    expect(router.navigate).not.toHaveBeenCalled();

    postReq.flush({ id: 'w2', name: 'New Workout', date: new Date().toISOString(), exercises: [] });

    const patchReq = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w2`,
    );
    expect(patchReq.request.body.status).toBe('COMPLETED');
    expect(patchReq.request.body.exercises.length).toBe(1);
    patchReq.flush({});

    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('shows a toast when saving a set fails, and retries the POST on the next set after a failed create', () => {
    createComponentWithNoId();

    component.exercisesList = [{ id: 'ex1', name: 'Bench Press' }];
    component.addExercises([{ id: 'ex1', name: 'Bench Press' }]);

    const c = component.cards[0];
    c.newWeight = 100;
    c.newReps = 5;
    component.addSetToExercise(c);

    const postReq = httpTesting.expectOne(
      (req) => req.method === 'POST' && req.url === workoutsUrl,
    );
    postReq.flush('failed', { status: 500, statusText: 'Server Error' });

    expect(toastControllerSpy.create).toHaveBeenCalled();

    // Adding another set retries the create POST (no id yet).
    c.newWeight = 90;
    c.newReps = 8;
    component.addSetToExercise(c);

    const retryReq = httpTesting.expectOne(
      (req) => req.method === 'POST' && req.url === workoutsUrl,
    );
    retryReq.flush({ id: 'w3', name: 'New Workout', date: new Date().toISOString(), exercises: [] });

    const patchReq = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w3`,
    );
    expect(patchReq.request.body.exercises[0].sets.length).toBe(2);
    patchReq.flush({});
  });

  it('shows a toast when a set update PATCH fails', () => {
    createComponentWithNoId();

    component.exercisesList = [{ id: 'ex1', name: 'Bench Press' }];
    component.addExercises([{ id: 'ex1', name: 'Bench Press' }]);

    const c = component.cards[0];
    c.newWeight = 100;
    c.newReps = 5;
    component.addSetToExercise(c);

    const postReq = httpTesting.expectOne(
      (req) => req.method === 'POST' && req.url === workoutsUrl,
    );
    postReq.flush({ id: 'w4', name: 'New Workout', date: new Date().toISOString(), exercises: [] });

    const createPatchReq = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w4`,
    );
    createPatchReq.flush({});

    toastControllerSpy.create.calls.reset();

    c.newWeight = 80;
    c.newReps = 3;
    component.addSetToExercise(c);

    const patchReq = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w4`,
    );
    patchReq.flush('failed', { status: 500, statusText: 'Server Error' });

    expect(toastControllerSpy.create).toHaveBeenCalled();
  });

  it('completing after a failed create (not retried) creates the draft, then PATCHes COMPLETED, and navigates only after that', () => {
    createComponentWithNoId();

    component.exercisesList = [{ id: 'ex1', name: 'Bench Press' }];
    component.addExercises([{ id: 'ex1', name: 'Bench Press' }]);

    const c = component.cards[0];
    c.newWeight = 100;
    c.newReps = 5;
    component.addSetToExercise(c);

    const firstPostReq = httpTesting.expectOne(
      (req) => req.method === 'POST' && req.url === workoutsUrl,
    );
    firstPostReq.flush('failed', { status: 500, statusText: 'Server Error' });

    expect(toastControllerSpy.create).toHaveBeenCalled();

    // Complete after a failed create retries the create first
    component.completeWorkout();

    expect(router.navigate).not.toHaveBeenCalled();

    const retryPostReqs = httpTesting.match(
      (req) => req.method === 'POST' && req.url === workoutsUrl,
    );
    expect(retryPostReqs.length).toBe(1);

    retryPostReqs[0].flush({
      id: 'w6',
      name: 'New Workout',
      date: new Date().toISOString(),
      exercises: [],
    });

    const patchReq = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w6`,
    );
    expect(patchReq.request.body.status).toBe('COMPLETED');
    expect(router.navigate).not.toHaveBeenCalled();

    patchReq.flush({});

    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('completing during an in-flight create whose follow-up PATCH fails does not navigate, re-enables completion, and a retry PATCHes the created id', () => {
    createComponentWithNoId();

    component.exercisesList = [{ id: 'ex1', name: 'Bench Press' }];
    component.addExercises([{ id: 'ex1', name: 'Bench Press' }]);

    const c = component.cards[0];
    c.newWeight = 100;
    c.newReps = 5;
    component.addSetToExercise(c);

    const postReq = httpTesting.expectOne(
      (req) => req.method === 'POST' && req.url === workoutsUrl,
    );

    component.completeWorkout();

    expect(router.navigate).not.toHaveBeenCalled();
    expect(current().status).not.toBe('COMPLETED');

    postReq.flush({
      id: 'w7',
      name: 'New Workout',
      date: new Date().toISOString(),
      exercises: [],
    });

    const patchReq = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w7`,
    );
    expect(patchReq.request.body.status).toBe('COMPLETED');
    patchReq.flush('failed', { status: 500, statusText: 'Server Error' });

    expect(router.navigate).not.toHaveBeenCalled();
    expect(toastControllerSpy.create).toHaveBeenCalled();
    expect(current().status).not.toBe('COMPLETED');
    expect(current()._pendingComplete).toBeFalsy();

    // Retry uses PATCH now that the workout has an id
    component.completeWorkout();

    const retryPatchReq = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w7`,
    );
    expect(retryPatchReq.request.body.status).toBe('COMPLETED');
    retryPatchReq.flush({});

    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('completing a saved workout whose PATCH fails does not navigate and leaves completion available', () => {
    createComponentWithNoId();
    loadWorkout('w8', [card('c1', 'ex1', 'Bench Press', [5])]);

    component.completeWorkout();

    const patchReq = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w8`,
    );
    expect(patchReq.request.body.status).toBe('COMPLETED');
    // Completing leaves the cards as they are
    expect(patchReq.request.body.exercises).toBeUndefined();
    patchReq.flush('failed', { status: 500, statusText: 'Server Error' });

    expect(router.navigate).not.toHaveBeenCalled();
    expect(toastControllerSpy.create).toHaveBeenCalled();
    expect(current().status).not.toBe('COMPLETED');
    expect(current()._pendingComplete).toBeFalsy();

    // Complete is still available: tapping again re-sends the PATCH.
    component.completeWorkout();

    const retryPatchReq = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w8`,
    );
    expect(retryPatchReq.request.body.status).toBe('COMPLETED');
    retryPatchReq.flush({});

    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('re-emitting queryParams for the already-loaded workout does not rebuild cards or drop empty cards', () => {
    createComponentWithNoId();

    component.exercisesList = [
      { id: 'ex1', name: 'Bench Press' },
      { id: 'ex2', name: 'Squat' },
    ];

    component.addExercises([{ id: 'ex1', name: 'Bench Press' }]);
    component.addExercises([{ id: 'ex2', name: 'Squat' }]);

    expect(component.cards.length).toBe(2);

    const cardA = component.cards[0];
    cardA.newWeight = 100;
    cardA.newReps = 5;
    component.addSetToExercise(cardA);

    const postReq = httpTesting.expectOne(
      (req) => req.method === 'POST' && req.url === workoutsUrl,
    );
    postReq.flush({ id: 'w5', name: 'New Workout', date: new Date().toISOString(), exercises: [] });

    const patchReq = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w5`,
    );
    // A card with no sets yet is not saved
    expect(patchReq.request.body.exercises.map((c: any) => c.exerciseId)).toEqual(['ex1']);
    patchReq.flush({});

    // Re-emit the id set by replaceUrl
    queryParamsSubject.next({ id: 'w5' });

    httpTesting.expectNone(
      (req) => req.method === 'GET' && req.url === `${workoutsUrl}/w5`,
    );
    expect(component.cards.length).toBe(2);
  });

  describe('loading cards', () => {
    it('maps each API card to one UI card with its id, exercise name, superset and sets in order', () => {
      createComponentWithNoId();
      const sg = '88888888-8888-4888-8888-888888888888';
      loadWorkout('w60', [
        card('c1', 'ex3', 'Curl', [10, 8]),
        card('c2', 'ex1', 'Bench Press', [5], sg),
        card('c3', 'ex2', 'Row', [8, 6, 4], sg),
      ]);

      expect(
        component.cards.map((c) => [
          c.id,
          c.exerciseId,
          c.exerciseName,
          c.supersetGroup,
          c.sets.map((s) => [s.id, s.reps]),
        ]),
      ).toEqual([
        ['c1', 'ex3', 'Curl', null, [['c1-s1', 10], ['c1-s2', 8]]],
        ['c2', 'ex1', 'Bench Press', sg, [['c2-s1', 5]]],
        ['c3', 'ex2', 'Row', sg, [['c3-s1', 8], ['c3-s2', 6], ['c3-s3', 4]]],
      ]);
      expect(titles()).toEqual(['Curl', 'Bench Press', 'Row']);
      expect(memberTitles()).toEqual(['Bench Press', 'Row']);
    });

    it('new cards and sets in a saved workout go without ids, and the next save sends the ids the response gave them', () => {
      createComponentWithNoId();
      loadWorkout('w61', [card('c1', 'ex1', 'Bench Press', [5])]);
      component.addExercises([{ id: 'ex2', name: 'Row' }]);
      const [bench, row] = component.cards;

      row.newWeight = 60;
      row.newReps = 8;
      component.addSetToExercise(row);
      const patch = httpTesting.expectOne(
        (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w61`,
      );
      const body = JSON.parse(JSON.stringify(patch.request.body));
      expect(body.exercises).toEqual([
        {
          id: 'c1',
          exerciseId: 'ex1',
          order: 1,
          supersetGroup: null,
          sets: [{ id: 'c1-s1', reps: 5, weight: 100, order: 1, made: true }],
        },
        {
          exerciseId: 'ex2',
          order: 2,
          supersetGroup: null,
          sets: [{ reps: 8, weight: 60, order: 1, made: true }],
        },
      ]);
      patch.flush(savedResponse('w61', body, { ex1: 'Bench Press', ex2: 'Row' }));

      bench.newWeight = 100;
      bench.newReps = 4;
      component.addSetToExercise(bench);
      const next = patchBody('w61');
      expect(next.exercises[0].id).toBe('c1');
      expect(next.exercises[0].sets.map((s: any) => s.id)).toEqual(['c1-s1', undefined]);
      expect(next.exercises[1].id).toBe('w61-new2');
      expect(next.exercises[1].sets[0].id).toBe('w61-new2-new1');
    });
  });

  describe('ids returned by a save', () => {
    const names = { ex1: 'Back Squat', ex2: 'Row', ex3: 'Curl' };

    function pendingPatch(id: string) {
      return httpTesting.expectOne(
        (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/${id}`,
      );
    }

    function addSet(c: (typeof component.cards)[number], weight: number, reps: number) {
      c.newWeight = weight;
      c.newReps = reps;
      component.addSetToExercise(c);
    }

    it('a set added to a saved manual workout gets its API id and is sent with that id on the next save', () => {
      createComponentWithNoId();
      loadWorkout('w80', [card('c1', 'ex1', 'Back Squat', [5])]);
      const [squat] = component.cards;

      addSet(squat, 120, 1);
      const patch = pendingPatch('w80');
      const body = JSON.parse(JSON.stringify(patch.request.body));
      patch.flush(savedResponse('w80', body, names));

      expect(squat.sets.map((s) => s.id)).toEqual(['c1-s1', 'c1-new2']);

      addSet(squat, 100, 3);
      expect(patchBody('w80').exercises[0].sets.map((s: any) => s.id)).toEqual([
        'c1-s1',
        'c1-new2',
        undefined,
      ]);
    });

    it("a draft's first save gives every saved card and set an id; a card without sets gets none", () => {
      createComponentWithNoId();
      component.addExercises([
        { id: 'ex1', name: 'Back Squat' },
        { id: 'ex2', name: 'Row' },
        { id: 'ex3', name: 'Curl' },
      ]);
      const [squat, row, curl] = component.cards;
      addSet(squat, 100, 5);
      addSet(squat, 110, 3);
      addSet(curl, 20, 10);

      httpTesting
        .expectOne((req) => req.method === 'POST' && req.url === workoutsUrl)
        .flush({ id: 'w81', name: 'New Workout', date: new Date().toISOString(), exercises: [] });
      const patch = pendingPatch('w81');
      const body = JSON.parse(JSON.stringify(patch.request.body));
      patch.flush(savedResponse('w81', body, names));

      expect(component.cards.map((c) => [c.id, c.sets.map((s) => s.id)])).toEqual([
        ['w81-new1', ['w81-new1-new1', 'w81-new1-new2']],
        [undefined, []],
        ['w81-new2', ['w81-new2-new1']],
      ]);

      addSet(row, 60, 8);
      const next = patchBody('w81');
      expect(next.exercises.map((c: any) => c.id)).toEqual(['w81-new1', undefined, 'w81-new2']);
      expect(next.exercises[0].sets.map((s: any) => s.id)).toEqual([
        'w81-new1-new1',
        'w81-new1-new2',
      ]);
      expect(squat.id).toBe('w81-new1');
      expect(row.id).toBeUndefined();
    });

    it('a set added while a save is in flight gets no id from that response and gets its own from the next save', () => {
      createComponentWithNoId();
      loadWorkout('w82', [card('c1', 'ex1', 'Back Squat', [5])]);
      const [squat] = component.cards;

      addSet(squat, 120, 1);
      const first = pendingPatch('w82');
      const firstBody = JSON.parse(JSON.stringify(first.request.body));

      addSet(squat, 125, 1);
      // Waits for the first save, so it can send the id that save returns
      httpTesting.expectNone((req) => req.method === 'PATCH');

      first.flush(savedResponse('w82', firstBody, names));
      expect(squat.sets.map((s) => s.id)).toEqual(['c1-s1', 'c1-new2', undefined]);

      const second = pendingPatch('w82');
      const secondBody = JSON.parse(JSON.stringify(second.request.body));
      expect(secondBody.exercises[0].sets.map((s: any) => [s.id, s.weight])).toEqual([
        ['c1-s1', 100],
        ['c1-new2', 120],
        [undefined, 125],
      ]);
      second.flush(savedResponse('w82', secondBody, names));
      expect(squat.sets.map((s) => s.id)).toEqual(['c1-s1', 'c1-new2', 'c1-new3']);
    });

    it('ids go to the sets the request sent, by their position in it, not by the current list', () => {
      createComponentWithNoId();
      loadWorkout('w83', [card('c1', 'ex1', 'Back Squat', [5])]);
      const [squat] = component.cards;

      addSet(squat, 120, 1);
      const [loaded, added] = squat.sets;
      const first = pendingPatch('w83');
      const firstBody = JSON.parse(JSON.stringify(first.request.body));

      // The loaded set is removed before the response arrives
      component.removeSet(loaded);
      first.flush(savedResponse('w83', firstBody, names));

      expect(added.id).toBe('c1-new2');
      expect(patchBody('w83').exercises[0].sets.map((s: any) => s.id)).toEqual(['c1-new2']);
    });

    it('a failed save leaves ids unchanged and the next save still goes out', () => {
      createComponentWithNoId();
      loadWorkout('w84', [card('c1', 'ex1', 'Back Squat', [5])]);
      component.addExercises([{ id: 'ex2', name: 'Row' }]);
      const [squat, row] = component.cards;

      addSet(row, 60, 8);
      pendingPatch('w84').flush('failed', { status: 500, statusText: 'Server Error' });

      expect(toastControllerSpy.create).toHaveBeenCalled();
      expect(squat.id).toBe('c1');
      expect(squat.sets.map((s) => s.id)).toEqual(['c1-s1']);
      expect(row.id).toBeUndefined();
      expect(row.sets.map((s) => s.id)).toEqual([undefined]);

      addSet(squat, 100, 3);
      const next = patchBody('w84');
      expect(next.exercises[0].sets.map((s: any) => s.id)).toEqual(['c1-s1', undefined]);
      expect('id' in next.exercises[1]).toBeFalse();
      expect('id' in next.exercises[1].sets[0]).toBeFalse();
    });
  });

  describe('exercise picker and supersets', () => {
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    it('has no exercise ion-select; the Add Exercise button opens the picker and appends 2 returned exercises as 2 cards in order', async () => {
      createComponentWithNoId();
      const createSpy = stubPicker(
        {
          exercises: [
            { id: 'ex2', name: 'Squat' },
            { id: 'ex1', name: 'Bench Press' },
          ],
          superset: false,
        },
        'confirm',
      );

      expect(fixture.nativeElement.querySelector('ion-select')).toBeNull();
      const button: HTMLElement =
        fixture.nativeElement.querySelector('.add-exercise-btn');
      expect(button.textContent).toContain('Add Exercise');
      button.click();
      await fixture.whenStable();

      expect(createSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({ component: ExercisePickerComponent }),
      );
      expect(component.cards.map((c) => c.exerciseName)).toEqual([
        'Squat',
        'Bench Press',
      ]);
      expect(component.cards.every((c) => c.supersetGroup === null)).toBeTrue();
      expect(component.cards.every((c) => c.id === undefined)).toBeTrue();
      httpTesting.expectNone(
        (req) => req.url === workoutsUrl || req.url.startsWith(`${workoutsUrl}/`),
      );
    });

    it('dismissing the picker with nothing (back/cancel) changes nothing', async () => {
      createComponentWithNoId();
      component.addExercises([{ id: 'ex1', name: 'Bench Press' }]);
      stubPicker(null, 'cancel');

      await component.openExercisePicker();

      expect(component.cards.length).toBe(1);
      expect(component.cards[0].exerciseId).toBe('ex1');
    });

    it('adds picked exercises already in the workout as new cards and adds a coach-created exercise to the list', async () => {
      createComponentWithNoId();
      component.exercisesList = [{ id: 'ex1', name: 'Bench Press' }];
      component.addExercises([{ id: 'ex1', name: 'Bench Press' }]);
      stubPicker(
        {
          exercises: [
            { id: 'ex1', name: 'Bench Press' },
            { id: 'new1', name: 'LB21 Test Lift', createdById: 'coach1' },
          ],
          superset: true,
        },
        'confirm',
      );

      await component.openExercisePicker();

      expect(component.cards.map((c) => c.exerciseId)).toEqual([
        'ex1',
        'ex1',
        'new1',
      ]);
      expect(component.cards[0].supersetGroup).toBeNull();
      expect(component.cards[1].supersetGroup).toMatch(uuidPattern);
      expect(component.cards[2].supersetGroup).toBe(
        component.cards[1].supersetGroup,
      );
      expect(component.exercisesList.some((e) => e.id === 'new1')).toBeTrue();
    });

    it('adding the same superset twice gives 2 separate superset blocks', async () => {
      createComponentWithNoId();
      const pair = [
        { id: 'ex1', name: 'Bench Press' },
        { id: 'ex2', name: 'Row' },
      ];
      component.addExercises(pair, true);
      component.addExercises(pair, true);
      fixture.detectChanges();

      const groups = component.cards.map((c) => c.supersetGroup);
      expect(component.cards.map((c) => c.exerciseId)).toEqual([
        'ex1',
        'ex2',
        'ex1',
        'ex2',
      ]);
      expect(groups[0]).toBe(groups[1]);
      expect(groups[2]).toBe(groups[3]);
      expect(groups[2]).not.toBe(groups[0]);
      expect(
        fixture.nativeElement.querySelectorAll('ion-card.superset-card').length,
      ).toBe(2);
    });

    it('a superset of 2 gives both cards one shared id, and every card in the PATCH body carries it', async () => {
      createComponentWithNoId();
      stubPicker(
        {
          exercises: [
            { id: 'ex1', name: 'Bench Press' },
            { id: 'ex2', name: 'Row' },
          ],
          superset: true,
        },
        'confirm',
      );

      await component.openExercisePicker();

      const [a, b] = component.cards;
      expect(a.supersetGroup).toMatch(uuidPattern);
      expect(b.supersetGroup).toBe(a.supersetGroup);
      const id = a.supersetGroup;

      a.newWeight = 100;
      a.newReps = 5;
      component.addSetToExercise(a);
      httpTesting
        .expectOne((req) => req.method === 'POST' && req.url === workoutsUrl)
        .flush({ id: 'w9', name: 'New Workout', date: new Date().toISOString(), exercises: [] });
      expect(cardSummary(patchBody('w9'))).toEqual([['ex1', 1, id, [5]]]);

      b.newWeight = 60;
      b.newReps = 10;
      component.addSetToExercise(b);
      expect(cardSummary(patchBody('w9'))).toEqual([
        ['ex1', 1, id, [5]],
        ['ex2', 2, id, [10]],
      ]);

      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('.superset-block').length).toBe(1);
    });

    it('non-superset cards are saved with supersetGroup null, keeping their card and set ids', () => {
      createComponentWithNoId();
      loadWorkout('w10', [card('c1', 'ex1', 'Bench Press', [5])]);

      component.toggleSetCompletion(component.cards[0].sets[0]);

      expect(patchBody('w10').exercises).toEqual([
        {
          id: 'c1',
          exerciseId: 'ex1',
          order: 1,
          supersetGroup: null,
          sets: [{ id: 'c1-s1', reps: 5, weight: 100, order: 1, made: null }],
        },
      ]);
    });

    it('a self tick sends made true in the full PATCH, an untick sends made null, and no result fields are sent', () => {
      createComponentWithNoId();
      const unticked = card('c1', 'ex1', 'Bench Press', [5]);
      unticked.sets[0].made = null;
      loadWorkout('w14', [unticked]);
      const tick = () =>
        (el('.set-row ion-button ion-icon[name="checkmark"]').parentElement as HTMLElement).click();

      tick();
      const ticked = patchBody('w14');
      expect(ticked.exercises[0].sets).toEqual([
        { id: 'c1-s1', reps: 5, weight: 100, order: 1, made: true },
      ]);
      expect(ticked.status).toBeUndefined();

      tick();
      expect(patchBody('w14').exercises[0].sets[0].made).toBeNull();
      httpTesting.expectNone((req) => req.url.includes('/sets/'));
    });

    it('loading cards that share a supersetGroup renders one superset block with both members next to each other', () => {
      createComponentWithNoId();
      const sg = '11111111-1111-4111-8111-111111111111';
      loadWorkout('w11', [
        card('c1', 'ex1', 'Bench Press', [5], sg),
        card('c2', 'ex3', 'Curl', [10]),
        card('c3', 'ex2', 'Row', [8], sg),
      ]);

      const blocks = fixture.nativeElement.querySelectorAll('.superset-block');
      expect(blocks.length).toBe(1);
      expect(blocks[0].querySelector('.superset-label').textContent).toContain('SUPERSET');
      const blockTitles = Array.from(
        blocks[0].querySelectorAll('.exercise-card .exercise-title'),
      ).map((e: any) => e.textContent.trim());
      expect(blockTitles).toEqual(['Bench Press', 'Row']);
      expect(fixture.nativeElement.querySelectorAll('.exercise-card').length).toBe(3);
    });

    it('removing 1 of 2 superset exercises clears the remaining card, and the next save sends supersetGroup null', () => {
      createComponentWithNoId();
      const sg = '22222222-2222-4222-8222-222222222222';
      loadWorkout('w12', [
        card('c1', 'ex1', 'Bench Press', [5], sg),
        card('c2', 'ex2', 'Row', [8, 8], sg),
      ]);
      expect(fixture.nativeElement.querySelectorAll('.superset-block').length).toBe(1);

      component.removeExercise(component.cards[0]);

      const body = patchBody('w12');
      expect(body.exercises.length).toBe(1);
      expect(body.exercises[0]).toEqual(
        jasmine.objectContaining({ id: 'c2', order: 1, supersetGroup: null }),
      );
      expect(body.exercises[0].sets.length).toBe(2);

      expect(component.cards[0].supersetGroup).toBeNull();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('.superset-block').length).toBe(0);
    });

    it('a stored superset with only 1 member left loads as a normal card with no supersetGroup', () => {
      createComponentWithNoId();
      loadWorkout('w13', [
        card('c1', 'ex1', 'Bench Press', [5], '33333333-3333-4333-8333-333333333333'),
      ]);

      expect(component.cards[0].supersetGroup).toBeNull();
      expect(fixture.nativeElement.querySelectorAll('.superset-block').length).toBe(0);
    });

    describe('card order', () => {
      const sg = '66666666-6666-4666-8666-666666666666';
      const names = { ex1: 'Back Squat', ex2: 'Front Squat', ex3: 'Curl', ex9: 'Snatch' };

      // Curl, then a superset [Back Squat (2 sets) + Front Squat], saved with
      // gaps in order and returned in shuffled order; replaces Back Squat
      // with Snatch and returns the PATCH body
      async function replaceFirstSupersetMember(id: string) {
        const curl = { ...card('c3', 'ex3', 'Curl', [10]), order: 10 };
        const back = { ...card('c1', 'ex1', 'Back Squat', [5, 3], sg), order: 20 };
        const front = { ...card('c2', 'ex2', 'Front Squat', [6], sg), order: 40 };
        back.sets = [back.sets[1], back.sets[0]];
        loadWorkout(id, [front, back, curl]);
        stubPicker({ exercises: [{ id: 'ex9', name: 'Snatch' }], superset: false }, 'confirm');

        (fixture.nativeElement.querySelector(
          'ion-button[aria-label="Replace Back Squat"]',
        ) as HTMLElement).click();
        await fixture.whenStable();

        return patchBody(id);
      }

      it('renders cards, superset members and sets in saved order when the API returns them out of order', () => {
        createComponentWithNoId();
        const row = { ...card('c2', 'ex2', 'Row', [8], sg), order: 3 };
        const curl = { ...card('c3', 'ex3', 'Curl', [10], null), order: 1 };
        const bench = { ...card('c1', 'ex1', 'Bench Press', [5, 4], sg), order: 2 };
        bench.sets = [bench.sets[1], bench.sets[0]];
        loadWorkout('w40', [row, curl, bench]);

        expect(component.cards.map((c) => c.exerciseId)).toEqual(['ex3', 'ex1', 'ex2']);
        expect(component.cards[1].sets.map((s) => s.reps)).toEqual([5, 4]);
        expect(titles()).toEqual(['Curl', 'Bench Press', 'Row']);
        expect(memberTitles()).toEqual(['Bench Press', 'Row']);
      });

      it('after replacing the first superset member, the PATCH sends cards by position with the replaced card first in the superset, keeping its id and sets', async () => {
        createComponentWithNoId();
        const body = await replaceFirstSupersetMember('w41');

        expect(body.exercises).toEqual([
          {
            id: 'c3',
            exerciseId: 'ex3',
            order: 1,
            supersetGroup: null,
            sets: [{ id: 'c3-s1', reps: 10, weight: 100, order: 1, made: true }],
          },
          {
            id: 'c1',
            exerciseId: 'ex9',
            order: 2,
            supersetGroup: sg,
            sets: [
              { id: 'c1-s1', reps: 5, weight: 100, order: 1, made: true },
              { id: 'c1-s2', reps: 3, weight: 100, order: 2, made: true },
            ],
          },
          {
            id: 'c2',
            exerciseId: 'ex2',
            order: 3,
            supersetGroup: sg,
            sets: [{ id: 'c2-s1', reps: 6, weight: 100, order: 1, made: true }],
          },
        ]);
      });

      it('a reload of the saved cards, in any response order, shows the same cards in the same order', async () => {
        createComponentWithNoId();
        const body = await replaceFirstSupersetMember('w42');

        // Same component, another workout id, so the GET runs again
        const saved = savedResponse('w42b', body, names);
        saved.exercises.reverse();
        loadResponse(saved);

        expect(titles()).toEqual(['Curl', 'Snatch', 'Front Squat']);
        expect(memberTitles()).toEqual(['Snatch', 'Front Squat']);
        expect(component.cards[1].sets.map((s) => s.reps)).toEqual([5, 3]);
      });

      it('a set added to an earlier card after a later card has sets stays in its card; card order is unchanged', () => {
        createComponentWithNoId();
        loadWorkout('w43', [
          card('c1', 'ex1', 'Bench Press', [5]),
          card('c2', 'ex2', 'Row', [8]),
        ]);

        const bench = component.cards[0];
        bench.newWeight = 100;
        bench.newReps = 4;
        component.addSetToExercise(bench);

        const body = patchBody('w43');
        expect(cardSummary(body)).toEqual([
          ['ex1', 1, null, [5, 4]],
          ['ex2', 2, null, [8]],
        ]);
        expect(body.exercises[0].sets.map((s: any) => [s.id, s.order])).toEqual([
          ['c1-s1', 1],
          [undefined, 2],
        ]);
      });

      it('the draft-create PATCH orders cards by position, not logging time', () => {
        createComponentWithNoId();
        component.addExercises([{ id: 'ex3', name: 'Curl' }]);
        component.addExercises(
          [
            { id: 'ex1', name: 'Bench Press' },
            { id: 'ex2', name: 'Row' },
          ],
          true,
        );
        const [curl, , row] = component.cards;

        // The later card gets its set first, then the earlier one while the POST is pending
        row.newWeight = 60;
        row.newReps = 8;
        component.addSetToExercise(row);
        curl.newWeight = 20;
        curl.newReps = 10;
        component.addSetToExercise(curl);

        httpTesting
          .expectOne((req) => req.method === 'POST' && req.url === workoutsUrl)
          .flush({ id: 'w44', name: 'New Workout', date: new Date().toISOString(), exercises: [] });
        expect(cardSummary(patchBody('w44'))).toEqual([
          ['ex3', 1, null, [10]],
          ['ex2', 2, row.supersetGroup, [8]],
        ]);
      });
    });

    describe('superset card', () => {
      const sg = '44444444-4444-4444-8444-444444444444';

      // Curl, then a superset of Bench Press (2 sets) and Row
      function loadSuperset(id: string) {
        loadWorkout(id, [
          card('c3', 'ex3', 'Curl', [10], null, 20),
          card('c1', 'ex1', 'Bench Press', [5, 4], sg),
          card('c2', 'ex2', 'Row', [8], sg, 60),
        ]);
      }

      it('draws a superset of 2 as exactly 1 ion-card holding both members', () => {
        createComponentWithNoId();
        loadWorkout('w20', [
          card('c1', 'ex1', 'Bench Press', [5], sg),
          card('c2', 'ex2', 'Row', [8], sg),
        ]);

        const cards = fixture.nativeElement.querySelectorAll('ion-card');
        expect(cards.length).toBe(1);
        expect(cards[0].getAttribute('role')).toBe('group');
        expect(cards[0].getAttribute('aria-label')).toBe('Superset');
        expect(cards[0].textContent).toContain('SUPERSET');
        expect(cards[0].textContent).toContain('Bench Press');
        expect(cards[0].textContent).toContain('Row');
        expect(cards[0].querySelectorAll('ion-card').length).toBe(0);
        expect(cards[0].querySelectorAll('.set-row').length).toBe(2);
        expect(cards[0].querySelectorAll('.add-set-row').length).toBe(2);
      });

      // ion-card drops a host aria-label once it loads, so the name must come
      // from aria-labelledby pointing at the SUPERSET label inside the group
      function expectNamedSuperset(group: HTMLElement, memberNames: string[]) {
        const labelId = group.getAttribute('aria-labelledby');
        expect(labelId).toBeTruthy();
        const label = document.getElementById(labelId!);
        expect(label).toBeTruthy();
        expect(label!.textContent!.trim().toLowerCase()).toBe('superset');
        expect(group.contains(label)).toBeTrue();
        const groupTitles = Array.from(group.querySelectorAll('.exercise-title')).map(
          (t) => t.textContent!.trim(),
        );
        expect(groupTitles).toEqual(memberNames);
      }

      it('each superset group is named by its own SUPERSET label, which contains both members', () => {
        createComponentWithNoId();
        const sg2 = '55555555-5555-4555-8555-555555555555';
        loadWorkout('w29', [
          card('c1', 'ex1', 'Bench Press', [5], sg),
          card('c2', 'ex2', 'Row', [8], sg),
          card('c3', 'ex3', 'Curl', [10], sg2),
          card('c4', 'ex4', 'Dip', [12], sg2),
        ]);

        const groups = Array.from(
          fixture.nativeElement.querySelectorAll('[role="group"]'),
        ) as HTMLElement[];
        expect(groups.length).toBe(2);
        expect(groups[0].getAttribute('aria-labelledby')).not.toBe(
          groups[1].getAttribute('aria-labelledby'),
        );
        expectNamedSuperset(groups[0], ['Bench Press', 'Row']);
        expectNamedSuperset(groups[1], ['Curl', 'Dip']);
      });

      it('the Delete superset button is full size; member Replace and delete buttons are small', () => {
        createComponentWithNoId();
        loadSuperset('w21');

        const deleteSuperset = el('ion-button[aria-label="Delete superset"]');
        expect(deleteSuperset).toBeTruthy();
        expect(deleteSuperset.getAttribute('size')).not.toBe('small');
        for (const name of ['Bench Press', 'Row']) {
          expect(el(`ion-button[aria-label="Remove ${name}"]`).getAttribute('size')).toBe('small');
          expect(el(`ion-button[aria-label="Replace ${name}"]`).getAttribute('size')).toBe('small');
        }
        // Standalone cards get the same small Replace button
        expect(el('ion-button[aria-label="Replace Curl"]').getAttribute('size')).toBe('small');
      });

      it('confirming Delete superset removes both members, and the PATCH has neither card', async () => {
        createComponentWithNoId();
        loadSuperset('w22');
        const createSpy = stubAlert('destructive');

        el('ion-button[aria-label="Delete superset"]').click();
        await fixture.whenStable();

        expect(createSpy).toHaveBeenCalledWith(
          jasmine.objectContaining({
            header: 'Delete superset?',
            message: 'Removes 2 exercises and their sets',
          }),
        );
        expect(component.cards.map((c) => c.exerciseId)).toEqual(['ex3']);
        expect(cardSummary(patchBody('w22'))).toEqual([['ex3', 1, null, [10]]]);

        fixture.detectChanges();
        expect(fixture.nativeElement.querySelectorAll('.superset-card').length).toBe(0);
        expect(fixture.nativeElement.querySelectorAll('ion-card').length).toBe(1);
      });

      it('cancelling Delete superset changes nothing and sends no request', async () => {
        createComponentWithNoId();
        loadSuperset('w23');
        stubAlert('cancel');

        await component.removeSuperset(sg);

        httpTesting.expectNone(
          (req) => req.url === workoutsUrl || req.url.startsWith(`${workoutsUrl}/`),
        );
        expect(component.cards.map((c) => c.exerciseId)).toEqual(['ex3', 'ex1', 'ex2']);
        expect(component.cards.map((c) => c.sets.length)).toEqual([1, 2, 1]);
        expect(component.cards.map((c) => c.supersetGroup)).toEqual([null, sg, sg]);
      });

      it('deleting one member turns the other into a standalone card, saved with supersetGroup null', () => {
        createComponentWithNoId();
        loadSuperset('w24');

        el('ion-button[aria-label="Remove Bench Press"]').click();

        expect(alertCtrlSpy.create).not.toHaveBeenCalled();
        const body = patchBody('w24');
        expect(cardSummary(body)).toEqual([
          ['ex3', 1, null, [10]],
          ['ex2', 2, null, [8]],
        ]);
        expect(body.exercises.map((c: any) => c.id)).toEqual(['c3', 'c2']);

        fixture.detectChanges();
        expect(fixture.nativeElement.querySelectorAll('.superset-card').length).toBe(0);
        const cardTitles = Array.from(
          fixture.nativeElement.querySelectorAll('ion-card.exercise-card .exercise-title'),
        ).map((t: any) => t.textContent.trim());
        expect(cardTitles).toEqual(['Curl', 'Row']);
      });

      it('Replace swaps the exercise in place and PATCHes the card with the new exerciseId, same id, superset and sets', async () => {
        createComponentWithNoId();
        loadSuperset('w25');
        const createSpy = stubPicker(
          { exercises: [{ id: 'ex9', name: 'Incline Press' }], superset: false },
          'confirm',
        );

        el('ion-button[aria-label="Replace Bench Press"]').click();
        await fixture.whenStable();

        const props = createSpy.calls.mostRecent().args[0]!.componentProps as any;
        expect(props.mode).toBe('replace');
        expect(props.excludeIds).toBeUndefined();

        expect(component.cards.map((c) => c.exerciseId)).toEqual(['ex3', 'ex9', 'ex2']);
        expect(component.cards[1].exerciseName).toBe('Incline Press');
        expect(component.cards[1].supersetGroup).toBe(sg);
        expect(component.cards[1].sets.length).toBe(2);
        expect(component.exercisesList.some((e) => e.id === 'ex9')).toBeTrue();

        const body = patchBody('w25');
        expect(body.exercises.map((c: any) => c.exerciseId)).toEqual(['ex3', 'ex9', 'ex2']);
        expect(body.exercises[1]).toEqual({
          id: 'c1',
          exerciseId: 'ex9',
          order: 2,
          supersetGroup: sg,
          sets: [
            { id: 'c1-s1', reps: 5, weight: 100, order: 1, made: true },
            { id: 'c1-s2', reps: 4, weight: 100, order: 2, made: true },
          ],
        });

        fixture.detectChanges();
        expect(memberTitles()).toEqual(['Incline Press', 'Row']);
      });

      it('the standalone card delete button is labelled with the exercise name', () => {
        createComponentWithNoId();
        loadSuperset('w27');

        const remove = el('ion-card.exercise-card ion-button[aria-label="Remove Curl"]');
        expect(remove).toBeTruthy();
        expect(remove.getAttribute('size')).toBe('small');
      });

      it('Replace on a standalone card swaps the exercise in place, keeps its sets and leaves supersetGroup null', async () => {
        createComponentWithNoId();
        loadSuperset('w28');
        stubPicker(
          { exercises: [{ id: 'ex9', name: 'Hammer Curl' }], superset: false },
          'confirm',
        );

        el('ion-card.exercise-card ion-button[aria-label="Replace Curl"]').click();
        await fixture.whenStable();

        expect(component.cards.map((c) => c.exerciseId)).toEqual(['ex9', 'ex1', 'ex2']);
        expect(component.cards[0].exerciseName).toBe('Hammer Curl');
        expect(component.cards[0].supersetGroup).toBeNull();

        const body = patchBody('w28');
        expect(cardSummary(body)).toEqual([
          ['ex9', 1, null, [10]],
          ['ex1', 2, sg, [5, 4]],
          ['ex2', 3, sg, [8]],
        ]);
        expect(body.exercises[0]).toEqual(
          jasmine.objectContaining({ id: 'c3', exerciseId: 'ex9', supersetGroup: null }),
        );
        expect(body.exercises[0].sets[0]).toEqual(
          jasmine.objectContaining({ id: 'c3-s1', weight: 20, reps: 10 }),
        );

        fixture.detectChanges();
        expect(el('ion-card.exercise-card .exercise-title').textContent!.trim()).toBe('Hammer Curl');
      });

      it('dismissing the replace picker with nothing changes nothing and sends no request', async () => {
        createComponentWithNoId();
        loadSuperset('w26');
        stubPicker(null, 'cancel');

        await component.replaceExercise(component.cards[1]);

        httpTesting.expectNone(
          (req) => req.url === workoutsUrl || req.url.startsWith(`${workoutsUrl}/`),
        );
        expect(component.cards.map((c) => c.exerciseId)).toEqual(['ex3', 'ex1', 'ex2']);
        expect(component.cards[1].exerciseName).toBe('Bench Press');
        expect(component.cards[1].sets.length).toBe(2);
      });
    });

    describe('remove set guard', () => {
      function removeSetButtons(): any[] {
        return Array.from(
          fixture.nativeElement.querySelectorAll('ion-button[aria-label^="Remove set"]'),
        );
      }

      it('disables the remove-set button of a card with 1 set, and removeSet on it changes nothing and sends no PATCH', () => {
        createComponentWithNoId();
        loadWorkout('w30', [card('c1', 'ex1', 'Bench Press', [5])]);

        const buttons = removeSetButtons();
        expect(buttons.length).toBe(1);
        expect(buttons[0].getAttribute('aria-label')).toBe('Remove set 1');
        expect(buttons[0].disabled).toBeTrue();

        const set = component.cards[0].sets[0];
        component.removeSet(set);

        httpTesting.expectNone(
          (req) => req.url === workoutsUrl || req.url.startsWith(`${workoutsUrl}/`),
        );
        expect(component.cards[0].sets).toEqual([set]);
        expect(current().cards[0].sets).toEqual([set]);
      });

      it('with 2 sets, removing one PATCHes 1 set and the remaining button becomes disabled', () => {
        createComponentWithNoId();
        loadWorkout('w31', [card('c1', 'ex1', 'Bench Press', [5, 4])]);

        let buttons = removeSetButtons();
        expect(buttons.length).toBe(2);
        expect(buttons.every((b) => !b.disabled)).toBeTrue();

        buttons[0].click();

        const body = patchBody('w31');
        expect(body.exercises[0].sets).toEqual([
          { id: 'c1-s2', reps: 4, weight: 100, order: 1, made: true },
        ]);

        fixture.detectChanges();
        buttons = removeSetButtons();
        expect(buttons.length).toBe(1);
        expect(buttons[0].disabled).toBeTrue();
      });

      it('disables the remove-set button of a superset member with 1 set', () => {
        createComponentWithNoId();
        const sg = '99999999-9999-4999-8999-999999999999';
        loadWorkout('w32', [
          card('c1', 'ex1', 'Bench Press', [5, 4], sg),
          card('c2', 'ex2', 'Row', [8], sg),
        ]);

        const rowCard = component.cards.find((c) => c.exerciseId === 'ex2')!;
        expect(rowCard.sets.length).toBe(1);
        const disabled = removeSetButtons().filter((b) => b.disabled);
        expect(disabled.length).toBe(1);

        component.removeSet(rowCard.sets[0]);
        httpTesting.expectNone((req) => req.method === 'PATCH');
        expect(rowCard.sets.length).toBe(1);
      });
    });

    describe('same exercise on more than one card', () => {
      const sg = '77777777-7777-4777-8777-777777777777';

      it('replace mode lists all exercises: the picker gets the full list and no excludeIds', async () => {
        createComponentWithNoId();
        loadWorkout('w50', [
          card('c1', 'ex1', 'Bench Press', [5]),
          card('c2', 'ex2', 'Row', [8]),
        ]);
        const all = [
          { id: 'ex1', name: 'Bench Press' },
          { id: 'ex2', name: 'Row' },
          { id: 'ex3', name: 'Curl' },
        ];
        component.exercisesList = all;
        const createSpy = stubPicker(null, 'cancel');

        await component.replaceExercise(component.cards[0]);

        const props = createSpy.calls.mostRecent().args[0]!.componentProps as any;
        expect(props.mode).toBe('replace');
        expect(props.exercises).toBe(all);
        expect(props.excludeIds).toBeUndefined();
      });

      it('replacing a card with an exercise already on another card shows it on both, saves it in place and reloads as separate cards', async () => {
        createComponentWithNoId();
        loadWorkout('w51', [
          card('c3', 'ex3', 'Curl', [10]),
          card('c1', 'ex1', 'Bench Press', [5, 4], sg),
          card('c2', 'ex2', 'Row', [8], sg),
        ]);
        stubPicker({ exercises: [{ id: 'ex3', name: 'Curl' }], superset: false }, 'confirm');

        await component.replaceExercise(component.cards[1]);

        expect(component.cards.map((c) => [c.exerciseId, c.supersetGroup])).toEqual([
          ['ex3', null],
          ['ex3', sg],
          ['ex2', sg],
        ]);
        const body = patchBody('w51');
        expect(body.exercises.map((c: any) => c.id)).toEqual(['c3', 'c1', 'c2']);
        expect(cardSummary(body)).toEqual([
          ['ex3', 1, null, [10]],
          ['ex3', 2, sg, [5, 4]],
          ['ex2', 3, sg, [8]],
        ]);
        fixture.detectChanges();
        expect(titles()).toEqual(['Curl', 'Curl', 'Row']);
        expect(memberTitles()).toEqual(['Curl', 'Row']);

        // Same component, another workout id, so the GET runs again
        loadResponse(savedResponse('w51b', body, { ex2: 'Row', ex3: 'Curl' }));

        expect(titles()).toEqual(['Curl', 'Curl', 'Row']);
        expect(memberTitles()).toEqual(['Curl', 'Row']);
        expect(
          component.cards.map((c) => [c.exerciseId, c.supersetGroup, c.sets.map((s) => s.reps)]),
        ).toEqual([
          ['ex3', null, [10]],
          ['ex3', sg, [5, 4]],
          ['ex2', sg, [8]],
        ]);
      });

      it('2 adjacent cards with the same exercise in one superset are saved as 2 cards and reload as 2 cards in one superset block', async () => {
        createComponentWithNoId();
        loadWorkout('w55', [
          card('c1', 'ex1', 'Bench Press', [5], sg),
          card('c2', 'ex2', 'Row', [8], sg),
        ]);
        stubPicker({ exercises: [{ id: 'ex1', name: 'Bench Press' }], superset: false }, 'confirm');

        await component.replaceExercise(component.cards[1]);

        const body = patchBody('w55');
        expect(body.exercises.length).toBe(2);
        expect(body.exercises.map((c: any) => c.id)).toEqual(['c1', 'c2']);
        expect(cardSummary(body)).toEqual([
          ['ex1', 1, sg, [5]],
          ['ex1', 2, sg, [8]],
        ]);

        loadResponse(savedResponse('w55b', body, { ex1: 'Bench Press' }));

        expect(component.cards.length).toBe(2);
        expect(fixture.nativeElement.querySelectorAll('.superset-block').length).toBe(1);
        expect(fixture.nativeElement.querySelectorAll('ion-card').length).toBe(1);
        expect(memberTitles()).toEqual(['Bench Press', 'Bench Press']);
        expect(
          component.cards.map((c) => [c.id, c.supersetGroup, c.sets.map((s) => s.reps)]),
        ).toEqual([
          ['c1', sg, [5]],
          ['c2', sg, [8]],
        ]);
      });

      it('2 adjacent standalone cards with the same exercise are saved as 2 cards and reload as 2 cards', async () => {
        createComponentWithNoId();
        loadWorkout('w56', [
          card('c1', 'ex1', 'Bench Press', [5]),
          card('c2', 'ex2', 'Row', [8, 6]),
        ]);
        stubPicker({ exercises: [{ id: 'ex1', name: 'Bench Press' }], superset: false }, 'confirm');

        await component.replaceExercise(component.cards[1]);

        const body = patchBody('w56');
        expect(cardSummary(body)).toEqual([
          ['ex1', 1, null, [5]],
          ['ex1', 2, null, [8, 6]],
        ]);

        loadResponse(savedResponse('w56b', body, { ex1: 'Bench Press' }));

        expect(component.cards.map((c) => [c.id, c.sets.map((s) => s.reps)])).toEqual([
          ['c1', [5]],
          ['c2', [8, 6]],
        ]);
        expect(fixture.nativeElement.querySelectorAll('.superset-block').length).toBe(0);
        expect(fixture.nativeElement.querySelectorAll('ion-card.exercise-card').length).toBe(2);
        expect(titles()).toEqual(['Bench Press', 'Bench Press']);
      });

      it('deleting one of two cards with the same exercise removes only that card', () => {
        createComponentWithNoId();
        loadWorkout('w52', [
          card('c1', 'ex1', 'Bench Press', [5, 4]),
          card('c2', 'ex2', 'Row', [8]),
          card('c3', 'ex1', 'Bench Press', [3]),
        ]);
        expect(component.cards.map((c) => c.exerciseId)).toEqual(['ex1', 'ex2', 'ex1']);

        const removeButtons = fixture.nativeElement.querySelectorAll(
          'ion-button[aria-label="Remove Bench Press"]',
        );
        expect(removeButtons.length).toBe(2);
        (removeButtons[0] as HTMLElement).click();

        const body = patchBody('w52');
        expect(body.exercises.map((c: any) => c.id)).toEqual(['c2', 'c3']);
        expect(cardSummary(body)).toEqual([
          ['ex2', 1, null, [8]],
          ['ex1', 2, null, [3]],
        ]);
        expect(component.cards.map((c) => [c.exerciseId, c.sets.length])).toEqual([
          ['ex2', 1],
          ['ex1', 1],
        ]);
      });

      it('Delete superset keeps a standalone card with the same exercise as a member', async () => {
        createComponentWithNoId();
        loadWorkout('w53', [
          card('c1', 'ex1', 'Bench Press', [5]),
          card('c2', 'ex1', 'Bench Press', [3], sg),
          card('c3', 'ex2', 'Row', [8], sg),
        ]);
        const createSpy = stubAlert('destructive');

        (fixture.nativeElement.querySelector(
          'ion-button[aria-label="Delete superset"]',
        ) as HTMLElement).click();
        await fixture.whenStable();

        expect(createSpy).toHaveBeenCalledWith(
          jasmine.objectContaining({ message: 'Removes 2 exercises and their sets' }),
        );
        const body = patchBody('w53');
        expect(body.exercises.map((c: any) => c.id)).toEqual(['c1']);
        expect(cardSummary(body)).toEqual([['ex1', 1, null, [5]]]);
        expect(component.cards.map((c) => [c.exerciseId, c.sets.length])).toEqual([['ex1', 1]]);
      });

      it('non-adjacent cards with the same exercise load as separate cards', () => {
        createComponentWithNoId();
        loadWorkout('w54', [
          card('c1', 'ex1', 'Bench Press', [5]),
          card('c2', 'ex2', 'Row', [8]),
          card('c3', 'ex1', 'Bench Press', [4]),
        ]);

        expect(component.cards.map((c) => [c.exerciseId, c.sets.map((s) => s.reps)])).toEqual([
          ['ex1', [5]],
          ['ex2', [8]],
          ['ex1', [4]],
        ]);
        expect(titles()).toEqual(['Bench Press', 'Row', 'Bench Press']);
        expect(fixture.nativeElement.querySelectorAll('ion-card').length).toBe(3);
      });
    });
  });

  describe('assigned workout', () => {
    const sg = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    function plannedSet(
      id: string,
      reps: number,
      weight: number | null,
      made: boolean | null = null,
      notes: string | null = null,
    ): WorkoutSet {
      return { id, reps, weight, order: 0, made, actualReps: null, actualWeight: null, notes };
    }

    function plannedCard(
      id: string,
      exerciseId: string,
      name: string,
      sets: WorkoutSet[],
      supersetGroup: string | null = null,
    ): WorkoutCard {
      return {
        id,
        exerciseId,
        exercise: { id: exerciseId, name },
        order: 0,
        supersetGroup,
        sets: sets.map((s, j) => ({ ...s, workoutExerciseId: id, order: j + 1 })),
      };
    }

    // Squat (made, missed, unset with a null weight), Squat again,
    // then a superset of Bench and Row
    function loadAssigned(id = 'a1', coachName: string | null = 'Coach Kim') {
      const response: Workout = {
        ...workoutResponse(id, [
          plannedCard('c1', 'squat', 'Squat', [
            plannedSet('s1', 5, 100, true, 'Pause at the bottom'),
            plannedSet('s2', 5, 100, false),
            plannedSet('s3', 3, null),
          ]),
          plannedCard('c2', 'squat', 'Squat', [plannedSet('s4', 8, 80)]),
          plannedCard('c3', 'bench', 'Bench', [plannedSet('s5', 6, 60)], sg),
          plannedCard('c4', 'row', 'Row', [plannedSet('s6', 10, 50)], sg),
        ]),
        name: 'Day 1',
        status: 'PLANNED',
        assignedById: 'coach1',
        assignedBy: { id: 'coach1', name: coachName },
      };
      createComponentWithNoId();
      loadResponse(response);
    }

    function setUrl(workoutId: string, setId: string) {
      return `${workoutsUrl}/${workoutId}/sets/${setId}`;
    }

    function resultRequests(workoutId: string, setId: string) {
      return httpTesting.match(
        (req) => req.method === 'PATCH' && req.url === setUrl(workoutId, setId),
      );
    }

    /** Flushes the single pending result PATCH of a set and returns its body */
    function resultBody(workoutId: string, setId: string) {
      const req = httpTesting.expectOne(
        (r) => r.method === 'PATCH' && r.url === setUrl(workoutId, setId),
      );
      const body = JSON.parse(JSON.stringify(req.request.body));
      req.flush({});
      return body;
    }

    function setRows(): HTMLElement[] {
      return Array.from(fixture.nativeElement.querySelectorAll('.set-row:not(.set-head)'));
    }

    function madeButtons(): HTMLElement[] {
      return Array.from(fixture.nativeElement.querySelectorAll('ion-button.made-col'));
    }

    /** Sets an actual input's model and fires its ionChange, as a commit on blur does */
    function enterActual(rowIndex: number, field: 'actualReps' | 'actualWeight', value: any) {
      const set = component.cards.reduce<any[]>((all, c) => all.concat(c.sets), [])[rowIndex];
      set[field] = value;
      const input = setRows()[rowIndex].querySelector(
        field === 'actualReps' ? 'ion-input.actual-reps' : 'ion-input.actual-weight',
      )!;
      input.dispatchEvent(new CustomEvent('ionChange'));
    }

    it('shows the coach badge, the name and date read-only, and the plan per set', () => {
      loadAssigned();

      expect(el('.coach-badge').textContent!.trim()).toBe('Coach · Coach Kim');
      expect(el('.workout-title').textContent!.trim()).toBe('Day 1');
      expect(
        Array.from(fixture.nativeElement.querySelectorAll('.set-row:not(.set-head) .set-plan')).map((p: any) =>
          p.textContent.trim(),
        ),
      ).toEqual(['5 × 100 kg', '5 × 100 kg', '3 × —', '8 × 80 kg', '6 × 60 kg', '10 × 50 kg']);
      expect(el('.set-notes').textContent!.trim()).toBe('Pause at the bottom');
      expect(fixture.nativeElement.querySelectorAll('.set-notes').length).toBe(1);

      // Actual inputs show the planned value as placeholder
      const first = setRows()[0];
      expect((first.querySelector('ion-input.actual-reps') as any).placeholder).toBe('5');
      expect((first.querySelector('ion-input.actual-weight') as any).placeholder).toBe('100');
      expect((setRows()[2].querySelector('ion-input.actual-weight') as any).placeholder).toBe('kg');

      // One block per card in card order: duplicates stay separate, the superset is one block
      expect(titles()).toEqual(['Squat', 'Squat', 'Bench', 'Row']);
      expect(memberTitles()).toEqual(['Bench', 'Row']);
      expect(fixture.nativeElement.querySelectorAll('.superset-label').length).toBe(1);
      expect(fixture.nativeElement.querySelectorAll('.add-set-row').length).toBe(4);
      expect(el('.complete-btn')).toBeTruthy();
    });

    it('renders no structural controls: no name or date editing, add exercise, delete, superset delete, replace or self tick', () => {
      loadAssigned();

      for (const selector of [
        '.workout-name-input',
        'ion-datetime-button',
        'ion-datetime',
        '.add-exercise-btn',
        'ion-button[aria-label="Delete superset"]',
        'ion-button[aria-label^="Replace"]',
        'ion-button[aria-label^="Remove"]',
        'ion-icon[name="checkmark"]',
      ]) {
        expect(fixture.nativeElement.querySelector(selector))
          .withContext(selector)
          .toBeNull();
      }
    });

    it('falls back to "Coach" when the coach has no name', () => {
      loadAssigned('a2', null);

      expect(el('.coach-badge').textContent!.trim()).toBe('Coach');
    });

    it('renders made, missed and unset sets with distinct icon, color and label', () => {
      loadAssigned();

      // Angular binds name/color as element properties on Ionic components
      const rendered = madeButtons()
        .slice(0, 3)
        .map((b) => [
          (b.querySelector('ion-icon') as HTMLIonIconElement).name,
          (b as HTMLIonButtonElement).color,
          b.getAttribute('aria-label'),
        ]);

      expect(rendered).toEqual([
        ['checkmark-circle', 'success', 'Made. Tap to mark as missed'],
        ['close-circle', 'danger', 'Missed. Tap to clear result'],
        ['remove-circle-outline', 'medium', 'No result. Tap to mark as made'],
      ]);
    });

    it('entering actual 3 × 105 sends nothing while the set is unlogged; tapping made then sends exactly {actualReps:3, actualWeight:105, made:true}', () => {
      loadAssigned();

      enterActual(2, 'actualReps', 3);
      enterActual(2, 'actualWeight', 105);
      httpTesting.expectNone((req) => req.method === 'PATCH');

      madeButtons()[2].click();

      expect(resultBody('a1', 's3')).toEqual({ actualReps: 3, actualWeight: 105, made: true });
      httpTesting.expectNone((req) => req.url === `${workoutsUrl}/a1`);
    });

    it('cycles unset -> made -> missed -> unset with one PATCH per tap, each sent after the previous response', () => {
      loadAssigned();
      const button = madeButtons()[2];

      button.click();
      button.click();
      button.click();
      expect(component.cards[0].sets[2].made).toBeNull();

      const bodies = [0, 1, 2].map(() => {
        const pending = resultRequests('a1', 's3');
        expect(pending.length).toBe(1);
        const body = JSON.parse(JSON.stringify(pending[0].request.body));
        pending[0].flush({});
        return body;
      });

      expect(bodies).toEqual([
        { made: true, actualReps: null, actualWeight: null },
        { made: false, actualReps: null, actualWeight: null },
        { made: null, actualReps: null, actualWeight: null },
      ]);
    });

    it('set writes send in order: each waits for the previous response, on the same set or another', () => {
      loadAssigned();

      enterActual(0, 'actualReps', 4);
      madeButtons()[0].click(); // made -> missed

      const first = resultRequests('a1', 's1');
      expect(first.length).toBe(1);
      expect(first[0].request.body).toEqual({ made: true, actualReps: 4, actualWeight: null });

      // Another set waits too, so responses apply in the order the server saw the writes
      madeButtons()[3].click();
      httpTesting.expectNone((req) => req.url === setUrl('a1', 's4'));

      first[0].flush({});
      expect(resultBody('a1', 's1')).toEqual({ made: false, actualReps: 4, actualWeight: null });
      expect(resultBody('a1', 's4')).toEqual({ made: true, actualReps: null, actualWeight: null });
    });

    it('a failed result save shows a toast, keeps the value and still sends the next queued save', () => {
      loadAssigned();

      madeButtons()[2].click();
      madeButtons()[2].click();
      resultRequests('a1', 's3')[0].flush('failed', { status: 500, statusText: 'Server Error' });

      expect(toastControllerSpy.create).toHaveBeenCalled();
      expect(component.cards[0].sets[2].made).toBeFalse();
      expect(resultBody('a1', 's3')).toEqual({ made: false, actualReps: null, actualWeight: null });
    });

    it('editing an actual value of a logged set sends its whole result, rounding decimal reps and sending a cleared input as null', () => {
      loadAssigned();

      enterActual(0, 'actualReps', '8.5');
      expect(resultBody('a1', 's1')).toEqual({ made: true, actualReps: 9, actualWeight: null });

      enterActual(0, 'actualWeight', 102.5);
      expect(resultBody('a1', 's1')).toEqual({ made: true, actualReps: 9, actualWeight: 102.5 });

      // Cleared = as planned
      enterActual(0, 'actualReps', '');
      expect(resultBody('a1', 's1')).toEqual({ made: true, actualReps: null, actualWeight: 102.5 });
    });

    it('Add set posts the entered set to its own card, rounding reps, and keeps the returned id', () => {
      loadAssigned();
      // The second Squat card, so the request must target its own card id
      const squat2 = component.cards[1];
      squat2.newWeight = 90;
      squat2.newReps = '7.4' as any;

      component.addSetToExercise(squat2);

      const req = httpTesting.expectOne(
        (r) => r.method === 'POST' && r.url === `${workoutsUrl}/a1/cards/c2/sets`,
      );
      expect(req.request.body).toEqual({ reps: 7, weight: 90, made: true });
      expect(squat2.sets.length).toBe(2);
      expect(squat2.newWeight).toBeNull();
      req.flush({ ...plannedSet('s7', 7, 90, true), order: 2, workoutExerciseId: 'c2' });

      expect(squat2.sets[1].id).toBe('s7');
      fixture.detectChanges();
      expect(setRows().length).toBe(7);
      httpTesting.expectNone((r) => r.url === `${workoutsUrl}/a1`);
    });

    it('a result tapped on a set whose add is still pending waits for the POST, then PATCHes the new id', () => {
      loadAssigned();
      const squat2 = component.cards[1];
      squat2.newWeight = 90;
      squat2.newReps = 7;
      component.addSetToExercise(squat2);
      fixture.detectChanges();

      madeButtons()[4].click(); // the new set: made -> missed
      httpTesting.expectNone((r) => r.method === 'PATCH');

      httpTesting
        .expectOne((r) => r.method === 'POST' && r.url === `${workoutsUrl}/a1/cards/c2/sets`)
        .flush({ ...plannedSet('s7', 7, 90, true), order: 2 });

      expect(resultBody('a1', 's7')).toEqual({ made: false, actualReps: null, actualWeight: null });
    });

    it('a failed Add set removes the set and shows a toast', () => {
      loadAssigned();
      const squat2 = component.cards[1];
      squat2.newWeight = 90;
      squat2.newReps = 7;
      component.addSetToExercise(squat2);

      httpTesting
        .expectOne((r) => r.method === 'POST' && r.url === `${workoutsUrl}/a1/cards/c2/sets`)
        .flush('failed', { status: 500, statusText: 'Server Error' });

      expect(squat2.sets.map((s) => s.id)).toEqual(['s4']);
      expect(toastControllerSpy.create).toHaveBeenCalled();
    });

    it('Finish sends a PATCH with only status COMPLETED, then goes to the dashboard', () => {
      loadAssigned();

      (el('.complete-btn') as HTMLElement).click();

      expect(patchBody('a1')).toEqual({ status: 'COMPLETED' });
      expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
      expect(current().status).toBe('COMPLETED');
    });

    it('works in pounds for an lb user: plans in lb, typed 225 sent as 102.06 kg and shown as 225', () => {
      TestBed.inject(WeightUnitService).setUnit('lb');
      loadAssigned();

      expect(
        Array.from(fixture.nativeElement.querySelectorAll('.set-row:not(.set-head) .set-plan')).map((p: any) =>
          p.textContent.trim(),
        ),
      ).toEqual(['5 × 220.5 lb', '5 × 220.5 lb', '3 × —', '8 × 176.4 lb', '6 × 132.3 lb', '10 × 110.2 lb']);
      expect((setRows()[0].querySelector('ion-input.actual-weight') as any).placeholder).toBe('220.5');
      expect((setRows()[2].querySelector('ion-input.actual-weight') as any).placeholder).toBe('lb');

      enterActual(0, 'actualWeight', 225);
      expect(resultBody('a1', 's1')).toEqual({ made: true, actualReps: null, actualWeight: 102.06 });
      fixture.detectChanges();
      expect(current().cards[0].sets[0].actualWeight).toBe(225);
    });

    it('converts a pound value added on an assigned card to kg', () => {
      TestBed.inject(WeightUnitService).setUnit('lb');
      loadAssigned();
      const squat = current().cards[1];
      squat.newWeight = 225;
      squat.newReps = 5;
      component.addSetToExercise(squat);
      const req = httpTesting.expectOne(
        (r) => r.method === 'POST' && r.url === `${workoutsUrl}/a1/cards/c2/sets`,
      );
      expect(req.request.body).toEqual({ reps: 5, weight: 102.06, made: true });
      req.flush({ id: 's-new' });
    });
  });

  describe('program workout', () => {
    function programSet(id: string, weight: number, percent: number, reference: string): WorkoutSet {
      return {
        id,
        reps: 3,
        weight,
        order: 1,
        made: null,
        actualReps: null,
        actualWeight: null,
        notes: null,
        prescribedPercent: percent,
        referenceExerciseId: reference,
      };
    }

    function loadProgramWorkout() {
      const squat = card('c1', 'squat', 'Back Squat', [5]);
      squat.sets = [programSet('s1', 97.5, 70, 'squat')];
      const pause = card('c2', 'pause', 'Pause Squat', [3]);
      pause.sets = [programSet('s2', 77.5, 55, 'squat')];
      const row = card('c3', 'row', 'Barbell Row', [8]);
      row.sets[0].weight = null;
      const response: Workout = {
        ...workoutResponse('pw1', [squat, pause, row]),
        name: 'Sample: Squat Day',
        status: 'PLANNED',
        source: 'program',
        program: { enrollmentId: 'en1', name: 'Sample Powerlifting Program' },
      };
      createComponentWithNoId();
      loadResponse(response);
    }

    it('shows a "Program · name" badge linking to the active program', () => {
      loadProgramWorkout();
      expect(el('.program-badge').textContent!.trim()).toBe('Program · Sample Powerlifting Program');
      expect(el('.coach-badge')).toBeNull();
    });

    it('renders no structural controls, like an assigned workout', () => {
      loadProgramWorkout();
      expect(current().assigned).toBeTrue();
      for (const selector of [
        '.workout-name-input',
        'ion-datetime-button',
        '.add-exercise-btn',
        'ion-button[aria-label="Delete superset"]',
        'ion-button[aria-label^="Replace"]',
        'ion-button[aria-label^="Remove"]',
        'ion-icon[name="checkmark"]',
      ]) {
        expect(fixture.nativeElement.querySelector(selector)).withContext(selector).toBeNull();
      }
      expect(fixture.nativeElement.querySelectorAll('ion-button.made-col').length).toBe(3);
    });

    it('logs a set with the same PATCH body as an assigned workout', () => {
      loadProgramWorkout();
      component.toggleMade(current().cards[0].sets[0]);
      const req = httpTesting.expectOne(
        (r) => r.method === 'PATCH' && r.url === `${workoutsUrl}/pw1/sets/s1`,
      );
      expect(req.request.body).toEqual({ made: true, actualReps: null, actualWeight: null });
      req.flush({});
    });

    it('shows the prescribed percent and reference lift under the target', () => {
      loadProgramWorkout();
      const prescriptions = Array.from<HTMLElement>(
        fixture.nativeElement.querySelectorAll('.set-prescription'),
      ).map((p) => p.textContent!.trim());
      expect(prescriptions).toEqual(['70% of Back Squat', '55% of Back Squat']);
    });
  });

  describe('personal best trophy', () => {
    const names = { ex1: 'Back Squat' };

    /** Per shown set row, whether it has a trophy */
    function trophies(): boolean[] {
      return Array.from<HTMLElement>(
        fixture.nativeElement.querySelectorAll('.set-row:not(.set-head)'),
      ).map((row) => !!row.querySelector('.pb-trophy'));
    }

    /** Answers the pending PATCH of a manual workout, marking the sets with the given ids as PBs */
    function flushSave(id: string, pbIds: string[]) {
      const req = httpTesting.expectOne(
        (r) => r.method === 'PATCH' && r.url === `${workoutsUrl}/${id}`,
      );
      const saved = savedResponse(id, JSON.parse(JSON.stringify(req.request.body)), names);
      saved.exercises.forEach((c) => c.sets.forEach((s) => (s.pb = pbIds.includes(s.id))));
      saved.hasPb = pbIds.length > 0;
      req.flush(saved);
      fixture.detectChanges();
    }

    it('shows a labelled trophy on loaded sets marked pb', () => {
      const squat = card('c1', 'ex1', 'Back Squat', [1, 1]);
      squat.sets[1].pb = true;
      createComponentWithNoId();
      loadWorkout('w90', [squat]);

      expect(trophies()).toEqual([false, true]);
      expect(el('.set-row .pb-trophy').getAttribute('aria-label')).toBe('Personal best');
    });

    it('a self save response marking a set pb shows its trophy at once; a later pb false hides it', () => {
      createComponentWithNoId();
      loadWorkout('w91', [card('c1', 'ex1', 'Back Squat', [5])]);
      const [squat] = component.cards;

      squat.newWeight = 120;
      squat.newReps = 1;
      component.addSetToExercise(squat);
      flushSave('w91', ['c1-new2']);
      expect(trophies()).toEqual([false, true]);

      component.toggleSetCompletion(squat.sets[1]);
      flushSave('w91', []);
      expect(trophies()).toEqual([false, false]);
    });

    it("a draft's first save shows the trophies its response marks", () => {
      createComponentWithNoId();
      component.addExercises([{ id: 'ex1', name: 'Back Squat' }]);
      const [squat] = component.cards;
      squat.newWeight = 120;
      squat.newReps = 1;
      component.addSetToExercise(squat);

      httpTesting
        .expectOne((r) => r.method === 'POST' && r.url === workoutsUrl)
        .flush({ id: 'w92', name: 'New Workout', date: new Date().toISOString(), exercises: [] });
      flushSave('w92', ['w92-new1-new1']);

      expect(trophies()).toEqual([true]);
    });

    describe('assigned and program sets', () => {
      function assignedSet(id: string, overrides: Partial<WorkoutSet> = {}): WorkoutSet {
        return {
          id,
          reps: 1,
          weight: 120,
          order: 1,
          made: null,
          actualReps: null,
          actualWeight: null,
          notes: null,
          ...overrides,
        };
      }

      function loadLocked(id: string, extra: Partial<Workout>) {
        const squat = card('c1', 'ex1', 'Back Squat', [1]);
        squat.sets = [assignedSet('s1'), { ...assignedSet('s2'), order: 2 }];
        createComponentWithNoId();
        loadResponse({ ...workoutResponse(id, [squat]), status: 'PLANNED', ...extra });
      }

      function resultRequest(workoutId: string, setId: string) {
        return httpTesting.expectOne(
          (r) => r.method === 'PATCH' && r.url === `${workoutsUrl}/${workoutId}/sets/${setId}`,
        );
      }

      const coach = { assignedById: 'coach1', assignedBy: { id: 'coach1', name: 'Kim' } };
      const program = {
        source: 'program' as const,
        program: { enrollmentId: 'en1', name: 'Sample Powerlifting Program' },
      };

      for (const [label, extra] of [
        ['assigned', coach],
        ['program', program],
      ] as const) {
        it(`${label}: a set result response with pb true shows the trophy; pb false hides it`, () => {
          loadLocked('a9', extra);
          const set = component.cards[0].sets[0];

          component.toggleMade(set);
          resultRequest('a9', 's1').flush(assignedSet('s1', { made: true, pb: true }));
          fixture.detectChanges();
          expect(trophies()).toEqual([true, false]);

          component.toggleMade(set);
          resultRequest('a9', 's1').flush(assignedSet('s1', { made: false, pb: false }));
          fixture.detectChanges();
          expect(trophies()).toEqual([false, false]);
        });
      }

      it("a set result's workoutPb moves the trophy to the set it names and clears the set itself", () => {
        loadLocked('a9', coach);
        const [first, second] = component.cards[0].sets;

        component.toggleMade(second);
        resultRequest('a9', 's2').flush({
          ...assignedSet('s2', { made: true }),
          order: 2,
          pb: true,
          workoutPb: { hasPb: true, pbSetIds: ['s2'] },
        });
        fixture.detectChanges();
        expect(trophies()).toEqual([false, true]);

        // Missing the heavier set makes the earlier one the PB
        component.toggleMade(second);
        resultRequest('a9', 's2').flush({
          ...assignedSet('s2', { made: false }),
          order: 2,
          pb: false,
          workoutPb: { hasPb: true, pbSetIds: ['s1'] },
        });
        fixture.detectChanges();
        expect(first.pb).toBeTrue();
        expect(trophies()).toEqual([true, false]);
      });

      it('an added set shows the trophy its response marks', () => {
        loadLocked('a9', coach);
        const [squat] = component.cards;
        squat.newWeight = 125;
        squat.newReps = 1;
        component.addSetToExercise(squat);
        httpTesting
          .expectOne((r) => r.method === 'POST' && r.url === `${workoutsUrl}/a9/cards/c1/sets`)
          .flush({ ...assignedSet('s3', { made: true, weight: 125, pb: true }), order: 3 });
        fixture.detectChanges();

        expect(squat.sets[2].id).toBe('s3');
        expect(trophies()).toEqual([false, false, true]);
      });

      it('writes to two sets apply in order, so the trophies match the later write', () => {
        loadLocked('a9', coach);
        const [first, second] = component.cards[0].sets;

        component.toggleMade(first);
        component.toggleMade(second);
        // The second write is held until the first answers
        httpTesting.expectNone((r) => r.url === `${workoutsUrl}/a9/sets/s2`);

        resultRequest('a9', 's1').flush({
          ...assignedSet('s1', { made: true }),
          pb: true,
          workoutPb: { hasPb: true, pbSetIds: ['s1'] },
        });
        resultRequest('a9', 's2').flush({
          ...assignedSet('s2', { made: true }),
          order: 2,
          pb: true,
          workoutPb: { hasPb: true, pbSetIds: ['s2'] },
        });
        fixture.detectChanges();

        expect(trophies()).toEqual([false, true]);
      });

      it("an added set's workoutPb updates the other sets too", () => {
        const squat = card('c1', 'ex1', 'Back Squat', [1]);
        squat.sets = [{ ...assignedSet('s1', { made: true }), pb: true }, { ...assignedSet('s2'), order: 2 }];
        createComponentWithNoId();
        loadResponse({ ...workoutResponse('a9', [squat]), status: 'PLANNED', ...coach });
        expect(trophies()).toEqual([true, false]);

        const [loggerCard] = component.cards;
        loggerCard.newWeight = 125;
        loggerCard.newReps = 1;
        component.addSetToExercise(loggerCard);
        httpTesting
          .expectOne((r) => r.method === 'POST' && r.url === `${workoutsUrl}/a9/cards/c1/sets`)
          .flush({
            ...assignedSet('s3', { made: true, weight: 125 }),
            order: 3,
            pb: true,
            workoutPb: { hasPb: true, pbSetIds: ['s2', 's3'] },
          });
        fixture.detectChanges();

        expect(loggerCard.sets[2].id).toBe('s3');
        expect(trophies()).toEqual([false, true, true]);
      });
    });
  });

  describe('exercise history', () => {
    it('opens the history modal of the exercise from its name', async () => {
      const squat = card('c1', 'squat', 'Back Squat', [3, 2]);
      const modal = jasmine.createSpyObj<HTMLIonModalElement>('HTMLIonModalElement', ['present']);
      modal.present.and.resolveTo();
      modalCtrlSpy.create.and.resolveTo(modal);
      createComponentWithNoId();
      loadResponse(workoutResponse('w1', [squat]));

      (el('.exercise-name-btn') as HTMLButtonElement).click();
      await fixture.whenStable();

      expect(modalCtrlSpy.create).toHaveBeenCalledWith(
        jasmine.objectContaining({
          component: ExerciseHistoryModalComponent,
          componentProps: {
            exerciseId: 'squat',
            exerciseName: 'Back Squat',
          },
        }),
      );
      expect(modal.present).toHaveBeenCalled();
    });
  });

  describe('leaving to the dashboard', () => {
    afterEach(() => {
      localStorage.removeItem('token');
    });

    const cases = [
      { role: 'COACH', url: '/coach/dashboard' },
      { role: 'CLIENT', url: '/dashboard' },
    ] as const;

    for (const { role, url } of cases) {
      describe(`as a ${role}`, () => {
        beforeEach(() => {
          TestBed.inject(AuthService).setSession(fakeToken(role));
        });

        it(`the back button falls back to ${url}`, () => {
          createComponentWithNoId();
          expect((el('ion-back-button') as any).defaultHref).toBe(url);
        });

        it(`completing an empty draft goes to ${url}`, () => {
          createComponentWithNoId();
          component.completeWorkout();
          expect(router.navigate).toHaveBeenCalledWith([url]);
        });

        it(`completing a draft goes to ${url} once it is created`, () => {
          createComponentWithNoId();
          component.addExercises([{ id: 'ex1', name: 'Bench Press' }]);
          const c = component.cards[0];
          c.newWeight = 100;
          c.newReps = 5;
          component.addSetToExercise(c);
          component.completeWorkout();

          httpTesting
            .expectOne((req) => req.method === 'POST' && req.url === workoutsUrl)
            .flush({ id: 'w2', name: 'New Workout', date: new Date().toISOString(), exercises: [] });
          expect(patchBody('w2').status).toBe('COMPLETED');

          expect(router.navigate).toHaveBeenCalledWith([url]);
        });

        it(`completing a saved workout goes to ${url}`, () => {
          createComponentWithNoId();
          loadWorkout('w9', [card('c1', 'ex1', 'Bench Press', [5])]);
          component.completeWorkout();

          expect(patchBody('w9').status).toBe('COMPLETED');
          expect(router.navigate).toHaveBeenCalledWith([url]);
        });
      });
    }
  });
});
