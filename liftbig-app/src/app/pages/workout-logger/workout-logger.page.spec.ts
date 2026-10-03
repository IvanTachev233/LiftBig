import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { ToastController } from '@ionic/angular';
import { WorkoutLoggerPage } from './workout-logger.page';
import { environment } from '../../../environments/environment';

describe('WorkoutLoggerPage', () => {
  let component: WorkoutLoggerPage;
  let fixture: ComponentFixture<WorkoutLoggerPage>;
  let httpTesting: HttpTestingController;
  let queryParamsSubject: BehaviorSubject<any>;
  let router: Router;
  let toastControllerSpy: jasmine.SpyObj<ToastController>;
  let toastSpy: jasmine.SpyObj<HTMLIonToastElement>;

  const workoutsUrl = `${environment.apiUrl}/workouts`;

  beforeEach(() => {
    queryParamsSubject = new BehaviorSubject<any>({});

    toastSpy = jasmine.createSpyObj('HTMLIonToastElement', ['present']);
    toastSpy.present.and.resolveTo();
    toastControllerSpy = jasmine.createSpyObj('ToastController', ['create']);
    toastControllerSpy.create.and.resolveTo(toastSpy);

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
      ],
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
    expect(component.workoutSubject.value.id).toBeUndefined();
    expect(component.workoutSubject.value.name).toBe('New Workout');
    expect(component.workoutSubject.value.sets).toEqual([]);
  });

  it('adding an exercise and renaming/re-dating the draft sends no requests to /workouts', () => {
    createComponentWithNoId();

    component.exercisesList = [{ id: 'ex1', name: 'Bench Press' }];
    component.selectedExerciseId = 'ex1';
    component.addExercise();

    component.workoutName = 'Push Day';
    component.updateWorkoutName();

    component.updateWorkoutDate({
      detail: { value: '2026-01-01T00:00:00.000Z' },
    });

    httpTesting.expectNone(
      (req) => req.url === workoutsUrl || req.url.startsWith(`${workoutsUrl}/`),
    );
    expect(component.groupedSets.length).toBe(1);
    expect(component.workoutSubject.value.name).toBe('Push Day');
    expect(component.workoutSubject.value.date).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });

  it('adding the first set sends exactly 1 POST, then PATCHes with the typed name, date, sets and IN_PROGRESS status', () => {
    createComponentWithNoId();

    component.exercisesList = [{ id: 'ex1', name: 'Bench Press' }];
    component.selectedExerciseId = 'ex1';
    component.addExercise();
    component.workoutName = 'Push Day';

    const draftDate = component.workoutSubject.value.date;
    const group = component.groupedSets[0];
    group.newWeight = 100;
    group.newReps = 5;

    component.addSetToExercise(group);

    const postReq = httpTesting.expectOne(
      (req) => req.method === 'POST' && req.url === workoutsUrl,
    );
    expect(postReq.request.body.name).toBe('Push Day');
    expect(postReq.request.body.date).toBe(draftDate);
    postReq.flush({ id: 'w1', name: 'Push Day', date: draftDate, sets: [] });

    const patchReq = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w1`,
    );
    expect(patchReq.request.body.name).toBe('Push Day');
    expect(patchReq.request.body.date).toBe(draftDate);
    expect(patchReq.request.body.status).toBe('IN_PROGRESS');
    expect(patchReq.request.body.sets.length).toBe(1);
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
    component.selectedExerciseId = 'ex1';
    component.addExercise();

    const group = component.groupedSets[0];
    group.newWeight = 100;
    group.newReps = 5;
    component.addSetToExercise(group);

    // Double tap: a second set is added before the first create resolves.
    group.newWeight = 90;
    group.newReps = 8;
    component.addSetToExercise(group);

    const postReqs = httpTesting.match(
      (req) => req.method === 'POST' && req.url === workoutsUrl,
    );
    expect(postReqs.length).toBe(1);

    const draftDate = component.workoutSubject.value.date;
    postReqs[0].flush({
      id: 'w1',
      name: 'New Workout',
      date: draftDate,
      sets: [],
    });

    const patchReq = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w1`,
    );
    expect(patchReq.request.body.sets.length).toBe(2);
    patchReq.flush({});

    // Once saved, new sets PATCH instead of POST
    group.newWeight = 80;
    group.newReps = 3;
    component.addSetToExercise(group);

    const patchReq2 = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w1`,
    );
    patchReq2.flush({});

    httpTesting.expectNone(
      (req) => req.method === 'POST' && req.url === workoutsUrl,
    );
  });

  it('a stale create for draft A does not hijack draft B once the view has moved on', () => {
    createComponentWithNoId();

    component.exercisesList = [{ id: 'ex1', name: 'Bench Press' }];
    component.selectedExerciseId = 'ex1';
    component.addExercise();

    const groupA = component.groupedSets[0];
    groupA.newWeight = 100;
    groupA.newReps = 5;
    component.addSetToExercise(groupA);

    const postReq = httpTesting.expectOne(
      (req) => req.method === 'POST' && req.url === workoutsUrl,
    );

    // User opens a new draft (B) before A's create resolves
    (router.navigate as jasmine.Spy).calls.reset();
    queryParamsSubject.next({});

    expect(component.workoutSubject.value.id).toBeUndefined();
    expect(component.workoutSubject.value.name).toBe('New Workout');
    expect(component.groupedSets.length).toBe(0);

    postReq.flush({ id: 'a1', name: 'New Workout', date: new Date().toISOString(), sets: [] });

    const patchReq = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/a1`,
    );
    patchReq.flush({});

    expect(router.navigate).not.toHaveBeenCalled();
    httpTesting.expectNone(
      (req) => req.method === 'GET' && req.url === `${workoutsUrl}/a1`,
    );
    expect(component.workoutSubject.value.id).toBeUndefined();
    expect(component.workoutSubject.value.name).toBe('New Workout');
    expect(component.groupedSets.length).toBe(0);
  });

  it('completing the workout while its create is still in flight completes it as COMPLETED once created, and navigates only after that', () => {
    createComponentWithNoId();

    component.exercisesList = [{ id: 'ex1', name: 'Bench Press' }];
    component.selectedExerciseId = 'ex1';
    component.addExercise();

    const group = component.groupedSets[0];
    group.newWeight = 100;
    group.newReps = 5;
    component.addSetToExercise(group);

    const postReq = httpTesting.expectOne(
      (req) => req.method === 'POST' && req.url === workoutsUrl,
    );

    component.completeWorkout();

    // Stays on the page until the workout is saved
    expect(router.navigate).not.toHaveBeenCalled();

    postReq.flush({ id: 'w2', name: 'New Workout', date: new Date().toISOString(), sets: [] });

    const patchReq = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w2`,
    );
    expect(patchReq.request.body.status).toBe('COMPLETED');
    patchReq.flush({});

    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('shows a toast when saving a set fails, and retries the POST on the next set after a failed create', () => {
    createComponentWithNoId();

    component.exercisesList = [{ id: 'ex1', name: 'Bench Press' }];
    component.selectedExerciseId = 'ex1';
    component.addExercise();

    const group = component.groupedSets[0];
    group.newWeight = 100;
    group.newReps = 5;
    component.addSetToExercise(group);

    const postReq = httpTesting.expectOne(
      (req) => req.method === 'POST' && req.url === workoutsUrl,
    );
    postReq.flush('failed', { status: 500, statusText: 'Server Error' });

    expect(toastControllerSpy.create).toHaveBeenCalled();

    // Adding another set retries the create POST (no id yet).
    group.newWeight = 90;
    group.newReps = 8;
    component.addSetToExercise(group);

    const retryReq = httpTesting.expectOne(
      (req) => req.method === 'POST' && req.url === workoutsUrl,
    );
    retryReq.flush({ id: 'w3', name: 'New Workout', date: new Date().toISOString(), sets: [] });

    const patchReq = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w3`,
    );
    patchReq.flush({});
  });

  it('shows a toast when a set update PATCH fails', () => {
    createComponentWithNoId();

    component.exercisesList = [{ id: 'ex1', name: 'Bench Press' }];
    component.selectedExerciseId = 'ex1';
    component.addExercise();

    const group = component.groupedSets[0];
    group.newWeight = 100;
    group.newReps = 5;
    component.addSetToExercise(group);

    const postReq = httpTesting.expectOne(
      (req) => req.method === 'POST' && req.url === workoutsUrl,
    );
    postReq.flush({ id: 'w4', name: 'New Workout', date: new Date().toISOString(), sets: [] });

    const createPatchReq = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w4`,
    );
    createPatchReq.flush({});

    toastControllerSpy.create.calls.reset();

    group.newWeight = 80;
    group.newReps = 3;
    component.addSetToExercise(group);

    const patchReq = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w4`,
    );
    patchReq.flush('failed', { status: 500, statusText: 'Server Error' });

    expect(toastControllerSpy.create).toHaveBeenCalled();
  });

  it('completing after a failed create (not retried) creates the draft, then PATCHes COMPLETED, and navigates only after that', () => {
    createComponentWithNoId();

    component.exercisesList = [{ id: 'ex1', name: 'Bench Press' }];
    component.selectedExerciseId = 'ex1';
    component.addExercise();

    const group = component.groupedSets[0];
    group.newWeight = 100;
    group.newReps = 5;
    component.addSetToExercise(group);

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
      sets: [],
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
    component.selectedExerciseId = 'ex1';
    component.addExercise();

    const group = component.groupedSets[0];
    group.newWeight = 100;
    group.newReps = 5;
    component.addSetToExercise(group);

    const postReq = httpTesting.expectOne(
      (req) => req.method === 'POST' && req.url === workoutsUrl,
    );

    component.completeWorkout();

    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.workoutSubject.value.status).not.toBe('COMPLETED');

    postReq.flush({
      id: 'w7',
      name: 'New Workout',
      date: new Date().toISOString(),
      sets: [],
    });

    const patchReq = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w7`,
    );
    expect(patchReq.request.body.status).toBe('COMPLETED');
    patchReq.flush('failed', { status: 500, statusText: 'Server Error' });

    expect(router.navigate).not.toHaveBeenCalled();
    expect(toastControllerSpy.create).toHaveBeenCalled();
    expect(component.workoutSubject.value.status).not.toBe('COMPLETED');
    expect(component.workoutSubject.value._pendingComplete).toBeFalsy();

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
    queryParamsSubject.next({ id: 'w8' });

    const getReq = httpTesting.expectOne(
      (req) => req.method === 'GET' && req.url === `${workoutsUrl}/w8`,
    );
    getReq.flush({
      id: 'w8',
      name: 'Saved Workout',
      date: new Date().toISOString(),
      status: 'IN_PROGRESS',
      sets: [{ exerciseId: 'ex1', weight: 100, reps: 5 }],
    });

    component.completeWorkout();

    const patchReq = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w8`,
    );
    expect(patchReq.request.body.status).toBe('COMPLETED');
    patchReq.flush('failed', { status: 500, statusText: 'Server Error' });

    expect(router.navigate).not.toHaveBeenCalled();
    expect(toastControllerSpy.create).toHaveBeenCalled();
    expect(component.workoutSubject.value.status).not.toBe('COMPLETED');
    expect(component.workoutSubject.value._pendingComplete).toBeFalsy();

    // Complete is still available: tapping again re-sends the PATCH.
    component.completeWorkout();

    const retryPatchReq = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w8`,
    );
    expect(retryPatchReq.request.body.status).toBe('COMPLETED');
    retryPatchReq.flush({});

    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('re-emitting queryParams for the already-loaded workout does not rebuild groups or drop empty exercise groups', () => {
    createComponentWithNoId();

    component.exercisesList = [
      { id: 'ex1', name: 'Bench Press' },
      { id: 'ex2', name: 'Squat' },
    ];

    component.selectedExerciseId = 'ex1';
    component.addExercise();
    component.selectedExerciseId = 'ex2';
    component.addExercise();

    expect(component.groupedSets.length).toBe(2);

    const groupA = component.groupedSets[0];
    groupA.newWeight = 100;
    groupA.newReps = 5;
    component.addSetToExercise(groupA);

    const postReq = httpTesting.expectOne(
      (req) => req.method === 'POST' && req.url === workoutsUrl,
    );
    postReq.flush({ id: 'w5', name: 'New Workout', date: new Date().toISOString(), sets: [] });

    const patchReq = httpTesting.expectOne(
      (req) => req.method === 'PATCH' && req.url === `${workoutsUrl}/w5`,
    );
    patchReq.flush({});

    // Re-emit the id set by replaceUrl
    queryParamsSubject.next({ id: 'w5' });

    httpTesting.expectNone(
      (req) => req.method === 'GET' && req.url === `${workoutsUrl}/w5`,
    );
    expect(component.groupedSets.length).toBe(2);
  });
});
