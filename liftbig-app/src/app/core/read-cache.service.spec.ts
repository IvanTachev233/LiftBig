import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { fakeToken } from './auth.testing';
import { OUTBOX_PLATFORM } from './outbox.service';
import { FakeOutboxPlatform } from './outbox.testing';
import { ReadCacheService } from './read-cache.service';
import { Workout, WorkoutStatus } from './workout.service';

const DAY = 24 * 60 * 60 * 1000;

const workout = (id: string, status: WorkoutStatus = 'PLANNED', date = new Date().toISOString()): Workout => ({
  id,
  name: id,
  date,
  status,
  totalWeightLifted: 0,
  assignedById: null,
  assignedBy: null,
  exercises: [],
});

describe('ReadCacheService', () => {
  const url = `${environment.apiUrl}/workouts`;
  let platform: FakeOutboxPlatform;
  let auth: AuthService;
  let http: HttpTestingController;
  let client: HttpClient;
  let injector: EnvironmentInjector | undefined;
  let cache: ReadCacheService;

  const signIn = (id: string) => auth.setSession(fakeToken('CLIENT', { id }), `r-${id}`);
  /** The service as a fresh app launch creates it, from what's in storage */
  const launch = () => {
    // Lets writes of the previous run finish, as they do before a kill
    flushMicrotasks();
    injector?.destroy();
    injector = createEnvironmentInjector([ReadCacheService], TestBed.inject(EnvironmentInjector));
    cache = injector.get(ReadCacheService);
    void cache.start();
    flushMicrotasks();
  };
  /** Reads the list through the cache; returns what it gave, or the error status */
  const readList = () => {
    let result: Workout[] | number | undefined;
    cache.read('workouts', client.get<Workout[]>(url)).subscribe({
      next: (list) => (result = list),
      error: (e) => (result = e.status),
    });
    return {
      answer: (list: Workout[]) => http.expectOne(url).flush(list),
      offline: () => http.expectOne(url).error(new ProgressEvent('error'), { status: 0, statusText: '' }),
      fail: (status: number) => http.expectOne(url).flush({}, { status, statusText: 'Error' }),
      result: () => result,
    };
  };
  const ids = (value: unknown) => (value as Workout[]).map((w) => w.id);

  beforeEach(() => {
    platform = new FakeOutboxPlatform();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: OUTBOX_PLATFORM, useValue: platform }],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    signIn('userA');
  });

  afterEach(() => {
    injector?.destroy();
    injector = undefined;
    http.verify();
    localStorage.removeItem('token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  });

  it('prefers the network while online, and gives the last answer without a connection, also after a restart', fakeAsync(() => {
    launch();
    const first = readList();
    first.answer([workout('w1')]);
    expect(ids(first.result())).toEqual(['w1']);

    const fresh = readList();
    fresh.answer([workout('w2')]);
    expect(ids(fresh.result())).toEqual(['w2']);

    launch();
    const offline = readList();
    offline.offline();
    expect(ids(offline.result())).toEqual(['w2']);
  }));

  it('passes errors other than a lost connection through', fakeAsync(() => {
    launch();
    readList().answer([workout('w1')]);
    for (const status of [401, 404, 500]) {
      const read = readList();
      read.fail(status);
      expect(read.result()).toBe(status);
    }
    for (const status of [502, 503, 504]) {
      const read = readList();
      read.fail(status);
      expect(ids(read.result())).withContext(`${status}`).toEqual(['w1']);
    }
  }));

  it("never gives one user's answers to another", fakeAsync(() => {
    launch();
    readList().answer([workout('w1')]);
    signIn('userB');
    const read = readList();
    read.offline();
    expect(read.result()).toBe(0);
    expect(cache.get('workouts')).toBeUndefined();
  }));

  it('discards answers older than 30 days on start', fakeAsync(() => {
    platform.data.set(
      'read-cache.userA',
      JSON.stringify({ workouts: { value: [workout('w1')], savedAt: Date.now() - 31 * DAY } }),
    );
    launch();
    expect(cache.get('workouts')).toBeUndefined();
    expect(platform.data.has('read-cache.userA')).toBeFalse();
  }));

  it('keeps the list bounded: open workouts and the last 14 days of completed ones', fakeAsync(() => {
    launch();
    const old = new Date(Date.now() - 20 * DAY).toISOString();
    readList().answer([
      workout('done-old', 'COMPLETED', old),
      workout('done-recent', 'COMPLETED'),
      workout('planned-old', 'PLANNED', old),
      workout('live', 'IN_PROGRESS', old),
    ]);
    expect(ids(cache.get('workouts'))).toEqual(['done-recent', 'planned-old', 'live']);
  }));

  it('keeps the 20 most recently opened workouts', fakeAsync(() => {
    launch();
    for (let i = 0; i < 22; i++) {
      cache.read(`workout:w${i}`, client.get(`${url}/w${i}`)).subscribe();
      http.expectOne(`${url}/w${i}`).flush(workout(`w${i}`));
    }
    expect(cache.get('workout:w0')).toBeUndefined();
    expect(cache.get('workout:w1')).toBeUndefined();
    expect(cache.get('workout:w2')).toBeDefined();
    expect(cache.get('workout:w21')).toBeDefined();
  }));

  it('falls back to a given lookup when the key has no answer yet', fakeAsync(() => {
    launch();
    readList().answer([workout('w1')]);
    let shown: Workout | undefined;
    cache
      .read(`workout:w1`, client.get<Workout>(`${url}/w1`), () => cache.get<Workout[]>('workouts')?.find((w) => w.id === 'w1'))
      .subscribe((w) => (shown = w));
    http.expectOne(`${url}/w1`).error(new ProgressEvent('error'), { status: 0, statusText: '' });
    expect(shown?.id).toBe('w1');
  }));

  it('takes a workout saved from this phone into the list and the opened workouts', fakeAsync(() => {
    launch();
    readList().answer([workout('w1', 'IN_PROGRESS')]);
    cache.adopt('userA', workout('w1', 'COMPLETED'));
    cache.adopt('userA', workout('w2', 'IN_PROGRESS'));
    expect((cache.get<Workout[]>('workouts') ?? []).map((w) => [w.id, w.status])).toEqual([
      ['w1', 'COMPLETED'],
      ['w2', 'IN_PROGRESS'],
    ]);
    expect(cache.get<Workout>('workout:w1')?.status).toBe('COMPLETED');
  }));

  it("forgets a user's answers, also ones stored by an earlier run", fakeAsync(() => {
    launch();
    readList().answer([workout('w1')]);
    flushMicrotasks();
    void cache.forget('userA');
    flushMicrotasks();
    expect(cache.get('workouts')).toBeUndefined();
    expect(platform.data.has('read-cache.userA')).toBeFalse();

    platform.data.set('read-cache.userB', JSON.stringify({ workouts: { value: [], savedAt: Date.now() } }));
    void TestBed.inject(ReadCacheService).forget('userB');
    flushMicrotasks();
    expect(platform.data.has('read-cache.userB')).toBeFalse();
  }));

  it('stores nothing before it has started', fakeAsync(() => {
    cache = TestBed.inject(ReadCacheService);
    cache.read('workouts', client.get<Workout[]>(url)).subscribe();
    http.expectOne(url).flush([workout('w1')]);
    flushMicrotasks();
    expect(cache.get('workouts')).toBeUndefined();
    expect(platform.data.size).toBe(0);
  }));
});
