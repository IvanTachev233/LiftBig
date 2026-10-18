import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { fakeToken } from './auth.testing';
import { OUTBOX_PLATFORM, OutboxService } from './outbox.service';
import { FakeOutboxPlatform } from './outbox.testing';
import { ReadCacheService } from './read-cache.service';
import { WorkoutCopyService } from './workout-copy.service';
import { Workout, WorkoutStatus } from './workout.service';

const DAY = 24 * 60 * 60 * 1000;

const workout = (id: string, status: WorkoutStatus = 'IN_PROGRESS', name = id): Workout => ({
  id,
  name,
  date: '2026-10-17T08:00:00.000Z',
  status,
  totalWeightLifted: 0,
  assignedById: null,
  assignedBy: null,
  exercises: [],
});

describe('WorkoutCopyService', () => {
  const api = environment.apiUrl;
  let platform: FakeOutboxPlatform;
  let auth: AuthService;
  let outbox: OutboxService;
  let copies: WorkoutCopyService;
  let http: HttpTestingController;
  let injector: EnvironmentInjector | undefined;

  const signIn = (id: string) =>
    auth.setSession(fakeToken('CLIENT', { id, exp: Math.floor(Date.now() / 1000) + 3600 }), `r-${id}`);
  const queue = (workoutId: string) =>
    void outbox.enqueue({ method: 'PATCH', path: `/workouts/${workoutId}`, body: { name: 'x' }, workoutId, label: 'x' });
  const offline = () =>
    http.match(() => true).forEach((r) => r.error(new ProgressEvent('error'), { status: 0, statusText: '' }));

  /** Services as a fresh app launch creates them, from what's in storage */
  const launch = () => {
    injector?.destroy();
    injector = createEnvironmentInjector([OutboxService, WorkoutCopyService], TestBed.inject(EnvironmentInjector));
    outbox = injector.get(OutboxService);
    copies = injector.get(WorkoutCopyService);
    void outbox.start();
    void copies.start();
    flushMicrotasks();
  };
  /** Stops the services and their retry timer; requests still out are left unanswered */
  const end = () => {
    injector?.destroy();
    injector = undefined;
    http.match(() => true);
  };

  beforeEach(() => {
    platform = new FakeOutboxPlatform();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: OUTBOX_PLATFORM, useValue: platform },
        { provide: ToastController, useValue: { create: () => Promise.resolve({ present: () => Promise.resolve() }) } },
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    signIn('userA');
  });

  afterEach(() => {
    end();
    http.verify();
    localStorage.removeItem('token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  });

  it('returns the copy of a workout while it has changes waiting, also after a restart', fakeAsync(() => {
    launch();
    copies.save(workout('w1', 'IN_PROGRESS', 'Leg day'));
    queue('w1');
    flushMicrotasks();
    offline();
    flushMicrotasks();
    expect(copies.get('w1')?.name).toBe('Leg day');

    launch();
    expect(copies.get('w1')?.name).toBe('Leg day');
    expect(copies.queued().map((w) => w.id)).toEqual(['w1']);
    expect(JSON.parse(platform.data.get('workout-copy.userA')!)['w1'].workout.name).toBe('Leg day');
    end();
  }));

  it("has no copy for a workout without changes waiting, and drops a copy once its workout's last change is saved", fakeAsync(() => {
    launch();
    copies.save(workout('w1'));
    expect(copies.get('w1')).toBeNull();

    queue('w1');
    queue('w1');
    flushMicrotasks();
    http.expectOne(`${api}/workouts/w1`).flush({});
    flushMicrotasks();
    expect(copies.get('w1')).not.toBeNull();
    http.expectOne(`${api}/workouts/w1`).flush({});
    flushMicrotasks();

    expect(copies.get('w1')).toBeNull();
    expect(copies.queued()).toEqual([]);
    expect(platform.data.has('workout-copy.userA')).toBeFalse();
  }));

  it('hands a fully saved copy to the read cache, so the workout opens as saved without a connection', fakeAsync(() => {
    const cache = TestBed.inject(ReadCacheService);
    void cache.start();
    launch();
    copies.save(workout('w1', 'COMPLETED', 'Leg day'));
    queue('w1');
    flushMicrotasks();
    http.expectOne(`${api}/workouts/w1`).flush({});
    flushMicrotasks();
    expect(cache.get<Workout>('workout:w1')?.status).toBe('COMPLETED');
  }));

  it("keeps each user's copies apart", fakeAsync(() => {
    launch();
    copies.save(workout('w1'));
    queue('w1');
    flushMicrotasks();
    offline();
    flushMicrotasks();

    signIn('userB');
    expect(copies.get('w1')).toBeNull();
    expect(copies.queued()).toEqual([]);

    signIn('userA');
    flushMicrotasks();
    expect(copies.get('w1')).not.toBeNull();
    end();
  }));

  it("keeps a user's copy while that user's changes still wait, when another user signs in during a send", fakeAsync(() => {
    launch();
    copies.save(workout('w1', 'IN_PROGRESS', 'Leg day'));
    queue('w1');
    queue('w1');
    flushMicrotasks();
    const first = http.expectOne(`${api}/workouts/w1`);

    signIn('userB');
    first.flush({});
    flushMicrotasks();

    expect(outbox.countFor('userA')).toBe(1);
    expect(JSON.parse(platform.data.get('workout-copy.userA')!)['w1'].workout.name).toBe('Leg day');
    signIn('userA');
    flushMicrotasks();
    expect(copies.get('w1')?.name).toBe('Leg day');
    end();
  }));

  it("forgets a user's copies, in memory and in storage", fakeAsync(() => {
    launch();
    copies.save(workout('w1'));
    queue('w1');
    flushMicrotasks();
    void copies.forget('userA');
    flushMicrotasks();
    expect(copies.get('w1')).toBeNull();
    expect(platform.data.has('workout-copy.userA')).toBeFalse();
    end();
  }));

  it('adopts the read cache answer under the entry\'s user when its last change completes while another user is signed in', fakeAsync(() => {
    const cache = TestBed.inject(ReadCacheService);
    void cache.start();
    launch();
    copies.save(workout('w1', 'COMPLETED', 'Leg day'));
    queue('w1');
    queue('w1');
    flushMicrotasks();
    http.expectOne(`${api}/workouts/w1`).flush({});
    flushMicrotasks();
    const last = http.expectOne(`${api}/workouts/w1`);

    signIn('userB');
    last.flush({});
    flushMicrotasks();
    expect(cache.get('workout:w1')).toBeUndefined();

    signIn('userA');
    flushMicrotasks();
    expect(cache.get<Workout>('workout:w1')?.name).toBe('Leg day');
    end();
  }));

  it('discards copies older than 30 days on start', fakeAsync(() => {
    const old = { workout: workout('w1'), savedAt: Date.now() - 31 * DAY };
    platform.data.set('workout-copy.userA', JSON.stringify({ w1: old }));
    launch();
    expect(platform.data.has('workout-copy.userA')).toBeFalse();
  }));

  it("overlays queued copies on the API's list: replaces rows it has and adds the others", fakeAsync(() => {
    launch();
    copies.save(workout('w1', 'COMPLETED', 'Finished offline'));
    copies.save(workout('w2', 'IN_PROGRESS', 'Started offline'));
    copies.save(workout('w3', 'IN_PROGRESS', 'All saved'));
    queue('w1');
    queue('w2');
    flushMicrotasks();
    offline();
    flushMicrotasks();

    const listed = [workout('w1', 'IN_PROGRESS', 'From the API'), workout('w3', 'IN_PROGRESS', 'From the API')];
    expect(copies.overlay(listed).map((w) => [w.id, w.status, w.name])).toEqual([
      ['w1', 'COMPLETED', 'Finished offline'],
      ['w3', 'IN_PROGRESS', 'From the API'],
      ['w2', 'IN_PROGRESS', 'Started offline'],
    ]);
    end();
  }));
});
