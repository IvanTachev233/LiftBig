import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ActiveWorkoutService } from '../../core/active-workout.service';
import { authInterceptor } from '../../core/auth.interceptor';
import { AuthService } from '../../core/auth.service';
import { fakeToken } from '../../core/auth.testing';
import { OUTBOX_PLATFORM, OutboxService } from '../../core/outbox.service';
import { FakeOutboxPlatform } from '../../core/outbox.testing';
import { ReadCacheService } from '../../core/read-cache.service';
import { WorkoutCopyService } from '../../core/workout-copy.service';
import { Exercise, Workout, WorkoutCard, WorkoutService } from '../../core/workout.service';
import { LOGGER_IONIC_TAGS, loadIonicElements } from '../../shared/ionic.testing';
import { WorkoutLoggerPage } from './workout-logger.page';

/**
 * The logger on the real outbox and device copy, over in-memory storage
 * that outlives a simulated app kill
 */
describe('WorkoutLoggerPage on the outbox', () => {
  const api = environment.apiUrl;
  const user = { id: 'u1', email: 'una@x.io' };
  let platform: FakeOutboxPlatform;
  let fixture: ComponentFixture<WorkoutLoggerPage>;
  let component: WorkoutLoggerPage;
  let http: HttpTestingController;
  let queryParams: BehaviorSubject<Record<string, string>>;
  let toastCreate: jasmine.Spy;
  let alertCreate: jasmine.Spy;
  let navigate: jasmine.Spy;

  const token = () => fakeToken('CLIENT', { ...user, exp: Math.floor(Date.now() / 1000) + 3600 });

  function squat(sets: number): WorkoutCard {
    return {
      id: 'c1',
      exerciseId: 'ex1',
      exercise: { id: 'ex1', name: 'Back Squat' },
      order: 1,
      supersetGroup: null,
      sets: Array.from({ length: sets }, (_, i) => ({
        id: `s${i + 1}`,
        reps: 5,
        weight: 100,
        order: i + 1,
        made: null,
        actualReps: null,
        actualWeight: null,
        notes: null,
      })),
    };
  }

  function workout(extra: Partial<Workout> = {}): Workout {
    return {
      id: 'w1',
      name: 'Leg day',
      date: '2026-10-17T08:00:00.000Z',
      status: 'IN_PROGRESS',
      totalWeightLifted: 0,
      assignedById: null,
      assignedBy: null,
      exercises: [squat(1)],
      ...extra,
    };
  }

  /** Starts the app over what's in storage, as a cold start does */
  function boot() {
    queryParams = new BehaviorSubject<Record<string, string>>({});
    TestBed.configureTestingModule({
      imports: [WorkoutLoggerPage],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParams: queryParams.asObservable() } },
        { provide: OUTBOX_PLATFORM, useValue: platform },
      ],
    });
    TestBed.overrideComponent(WorkoutLoggerPage, {
      add: { providers: [{ provide: ModalController, useValue: jasmine.createSpyObj('ModalController', ['create']) }] },
    });
    http = TestBed.inject(HttpTestingController);
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    toastCreate = spyOn(TestBed.inject(ToastController), 'create').and.resolveTo({
      present: () => Promise.resolve(),
    } as unknown as HTMLIonToastElement);
    alertCreate = spyOn(TestBed.inject(AlertController), 'create').and.resolveTo({
      present: () => Promise.resolve(),
      onDidDismiss: () => Promise.resolve({}),
    } as unknown as HTMLIonAlertElement);
    void TestBed.inject(AuthService).restore();
    flushMicrotasks();
    void TestBed.inject(OutboxService).start();
    void TestBed.inject(WorkoutCopyService).start();
    void TestBed.inject(ReadCacheService).start();
    flushMicrotasks();
  }

  /** Opens the logger; `exercises` answers its exercise list, or null for no connection */
  function openLogger(exercises: Exercise[] | null = []) {
    fixture = TestBed.createComponent(WorkoutLoggerPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    const req = http.expectOne(`${api}/workouts/exercises`);
    if (exercises) req.flush(exercises);
    else failOffline(req);
  }

  /** Opens w1, answering its GET with `response` */
  function open(response = workout()) {
    openLogger();
    queryParams.next({ id: response.id });
    http.expectOne((r) => r.method === 'GET' && r.url === `${api}/workouts/${response.id}`).flush(response);
    render();
  }

  /** Kills the app: nothing survives but storage and the stored tokens */
  function kill() {
    // No logger may be open yet in this test
    fixture?.destroy();
    fixture = undefined as unknown as ComponentFixture<WorkoutLoggerPage>;
    TestBed.resetTestingModule();
    boot();
  }

  /** Stops the outbox's retry timer and leaves unanswered requests */
  function end() {
    TestBed.inject(OutboxService).ngOnDestroy();
    http.match(() => true);
    discardPeriodicTasks();
  }

  function render() {
    flushMicrotasks();
    fixture.detectChanges();
  }

  const saveState = () => (fixture.nativeElement.querySelector('.save-state') as HTMLElement | null)?.textContent?.trim();
  const writes = () => http.match((r) => r.method !== 'GET');
  const sent = (): TestRequest => {
    const [req, ...rest] = writes();
    expect(rest.length).withContext('one write at a time').toBe(0);
    return req;
  };
  const failOffline = (req: TestRequest) => req.error(new ProgressEvent('error'), { status: 0, statusText: '' });
  const stored = () => JSON.parse(platform.data.get('outbox.u1') ?? '[]');
  const tickSet = (i: number) => component.toggleSetCompletion(component.cards[0].sets[i]);

  // Ionic must not load element code inside the fakeAsync tests below
  beforeEach(() => loadIonicElements(LOGGER_IONIC_TAGS));

  beforeEach(() => {
    platform = new FakeOutboxPlatform();
    localStorage.setItem('access_token', token());
    localStorage.setItem('refresh_token', 'r1');
  });

  afterEach(() => {
    fixture?.destroy();
    fixture = undefined as unknown as ComponentFixture<WorkoutLoggerPage>;
    localStorage.removeItem('token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  });

  it('shows Saved, Saving… and Offline · N changes on this phone in the header', fakeAsync(() => {
    boot();
    openLogger();
    // A draft nothing has saved yet shows no state
    expect(saveState()).toBeUndefined();

    queryParams.next({ id: 'w1' });
    http.expectOne(`${api}/workouts/w1`).flush(workout({ exercises: [squat(3)] }));
    render();
    expect(saveState()).toBe('Saved');

    tickSet(0);
    render();
    expect(saveState()).toBe('Saving…');
    sent().flush({});
    render();
    expect(saveState()).toBe('Saved');

    platform.setConnected(false);
    tickSet(1);
    render();
    failOffline(sent());
    render();
    expect(saveState()).toBe('Offline · 1 change on this phone');
    tickSet(2);
    render();
    expect(saveState()).toBe('Offline · 2 changes on this phone');
    expect(fixture.nativeElement.querySelector('.save-state').getAttribute('role')).toBe('status');

    platform.setConnected(true);
    render();
    sent().flush({});
    render();
    sent().flush({});
    render();
    expect(saveState()).toBe('Saved');
    expect(stored()).toEqual([]);
  }));

  it('keeps a set whose add fails, says nothing about the connection, and sends it again later', fakeAsync(() => {
    boot();
    open(workout({ status: 'PLANNED', source: 'coach', assignedById: 'k1', assignedBy: { id: 'k1', name: 'Kim' } }));
    const [card] = component.cards;
    card.newWeight = 90;
    card.newReps = 5;
    component.addSetToExercise(card);
    render();

    const first = sent();
    expect(first.request.url).toBe(`${api}/workouts/w1/cards/c1/sets`);
    const setId = first.request.body.id;
    expect(setId).toMatch(/^[0-9a-f-]{36}$/);
    first.flush({}, { status: 500, statusText: 'Server Error' });
    render();

    expect(component.cards[0].sets.map((s) => s.id)).toEqual(['s1', setId]);
    expect(saveState()).toBe('Offline · 1 change on this phone');
    expect(toastCreate).not.toHaveBeenCalled();

    tick(30_000);
    const retry = sent();
    expect(retry.request.body).toEqual({ id: setId, reps: 5, weight: 90, made: true });
    retry.flush({ id: setId, reps: 5, weight: 90, order: 2, made: true, actualReps: null, actualWeight: null, notes: null });
    render();
    expect(saveState()).toBe('Saved');
    expect(component.cards[0].sets.length).toBe(2);
  }));

  it('after an app kill, opens from the device copy with the unsent sets, then saves them in order', fakeAsync(() => {
    boot();
    open();
    platform.setConnected(false);
    const [card] = component.cards;
    component.copyLastSet(card);
    render();
    failOffline(sent());
    render();
    component.copyLastSet(card);
    tickSet(1);
    render();
    expect(stored().length).toBe(3);

    kill();
    // The relaunched outbox tries at once and finds no connection
    failOffline(sent());
    openLogger();
    queryParams.next({ id: 'w1' });
    render();

    http.expectNone(`${api}/workouts/w1`);
    expect(component.cards[0].sets.map((s) => [s.reps, s.made])).toEqual([
      [5, null],
      [5, true],
      [5, null],
    ]);
    expect(saveState()).toBe('Offline · 3 changes on this phone');

    platform.setConnected(true);
    render();
    const bodies: unknown[] = [];
    for (let i = 0; i < 3; i++) {
      const req = sent();
      expect(req.request.url).toBe(`${api}/workouts/w1`);
      bodies.push(req.request.body);
      req.flush({});
      render();
    }
    const setsOf = (body: any) => body.exercises[0].sets.map((s: any) => s.made);
    expect(bodies.map(setsOf)).toEqual([
      [null, null],
      [null, null, null],
      [null, true, null],
    ]);
    expect(saveState()).toBe('Saved');
    expect(TestBed.inject(WorkoutCopyService).get('w1')).toBeNull();
  }));

  describe('without a connection from the start', () => {
    const exercises: Exercise[] = [
      { id: 'ex1', name: 'Back Squat', isMaxTrackable: true },
      { id: 'ex2', name: 'Bench Press' },
    ];
    const planned = () =>
      workout({ id: 'w2', name: 'Coach day', status: 'PLANNED', source: 'coach', assignedById: 'k1', assignedBy: { id: 'k1', name: 'Kim' } });

    /** A cold start with no connection; every API request fails */
    function coldStartOffline() {
      kill();
      platform.connected = false;
    }

    it('opens a workout opened before from its cached copy and queues its results', fakeAsync(() => {
      boot();
      open(planned());
      coldStartOffline();

      openLogger(null);
      queryParams.next({ id: 'w2' });
      failOffline(http.expectOne(`${api}/workouts/w2`));
      render();
      expect(component.cards.map((c) => c.exerciseName)).toEqual(['Back Squat']);

      component.toggleMade(component.cards[0].sets[0]);
      render();
      const req = sent();
      expect(req.request.url).toBe(`${api}/workouts/w2/sets/s1`);
      failOffline(req);
      render();
      expect(saveState()).toBe('Offline · 1 change on this phone');
      expect(stored().map((e: any) => e.path)).toEqual(['/workouts/w2/sets/s1']);
      end();
    }));

    it("starts a planned workout known only from Today's cached list", fakeAsync(() => {
      boot();
      TestBed.inject(ReadCacheService).read('workouts', TestBed.inject(WorkoutService).getAllWorkouts()).subscribe();
      http.expectOne(`${api}/workouts`).flush([planned()]);
      coldStartOffline();

      openLogger(null);
      queryParams.next({ id: 'w2' });
      failOffline(http.expectOne(`${api}/workouts/w2`));
      render();
      expect(component.workoutSubject.value?.name).toBe('Coach day');

      component.toggleMade(component.cards[0].sets[0]);
      render();
      failOffline(sent());
      render();
      expect(stored().map((e: any) => [e.method, e.path, e.body])).toEqual([
        ['PATCH', '/workouts/w2/sets/s1', { made: true, actualReps: null, actualWeight: null }],
      ]);
      end();
    }));

    it('starts an empty workout with the cached exercises, queued under an id the app made', fakeAsync(() => {
      boot();
      openLogger(exercises);
      coldStartOffline();

      openLogger(null);
      render();
      expect(component.exercisesList.map((e) => e.name)).toEqual(['Back Squat', 'Bench Press']);

      component.addExercises([component.exercisesList[0]]);
      const [card] = component.cards;
      card.newWeight = 100;
      card.newReps = 5;
      component.addSetToExercise(card);
      render();
      failOffline(sent());
      render();

      const id = component.workoutSubject.value!.id!;
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(stored().map((e: any) => [e.method, e.path])).toEqual([
        ['POST', '/workouts'],
        ['PATCH', `/workouts/${id}`],
      ]);
      expect(stored()[0].body.id).toBe(id);
      expect(saveState()).toBe('Offline · 2 changes on this phone');
      end();
    }));
  });

  it('finishing without a connection closes with the sync message and leaves the resume bar', fakeAsync(() => {
    boot();
    open();
    platform.setConnected(false);
    tickSet(0);
    render();
    failOffline(sent());
    render();

    component.completeWorkout();
    render();

    expect(toastCreate).toHaveBeenCalledWith(
      jasmine.objectContaining({ message: "Finished. It'll sync when you're back online." }),
    );
    expect(navigate).toHaveBeenCalledWith(['/today']);
    expect(TestBed.inject(ActiveWorkoutService).workout()).toBeNull();
    expect(stored().map((e: any) => e.body.status ?? null)).toEqual([null, 'COMPLETED']);
    end();
  }));

  it('opens a started-offline workout from the device copy after the session ends, and saves it once the same user logs in', fakeAsync(() => {
    boot();
    openLogger();
    component.addExercises([{ id: 'ex1', name: 'Back Squat' }]);
    const [card] = component.cards;
    card.newWeight = 100;
    card.newReps = 5;
    component.addSetToExercise(card);
    render();
    const id = component.workoutSubject.value!.id!;
    expect(navigate).toHaveBeenCalledWith([], jasmine.objectContaining({ queryParams: { id }, replaceUrl: true }));

    // The create is turned away and so is the refresh: the session has ended
    sent().flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${api}/auth/refresh`).flush({}, { status: 401, statusText: 'Unauthorized' });
    render();
    expect(alertCreate).toHaveBeenCalledWith(
      jasmine.objectContaining({
        header: 'Your session ended',
        message: '2 changes from this phone will be saved after you log in.',
      }),
    );
    expect(navigate).toHaveBeenCalledWith(['/login'], jasmine.objectContaining({ queryParams: { email: user.email } }));
    // Nobody is signed in now, but the changes still wait on this phone
    expect(saveState()).toBe('Offline · 2 changes on this phone');
    expect(stored().length).toBe(2);

    TestBed.inject(AuthService)
      .login({ email: user.email, password: 'pw' })
      .subscribe();
    http.expectOne(`${api}/auth/login`).flush({ access_token: token(), refresh_token: 'r2' });
    render();

    const create = sent();
    expect(create.request.url).toBe(`${api}/workouts`);
    expect(create.request.body.id).toBe(id);
    create.flush({ id });
    render();
    const cards = sent();
    expect(cards.request.body.exercises[0].sets.length).toBe(1);
    cards.flush({});
    render();
    expect(stored()).toEqual([]);
  }));
});
