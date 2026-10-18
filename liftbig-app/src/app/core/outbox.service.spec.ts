import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import type { PluginListenerHandle } from '@capacitor/core';
import { environment } from '../../environments/environment';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { fakeToken } from './auth.testing';
import { OUTBOX_PLATFORM, OutboxEntry, OutboxPlatform, OutboxResult, OutboxService, OutboxWrite } from './outbox.service';

const DAY = 24 * 60 * 60 * 1000;

/** In-memory Preferences, network status and resume events */
class FakePlatform implements OutboxPlatform {
  data = new Map<string, string>();
  connected = true;
  networkListener?: (connected: boolean) => void;
  resumeListener?: () => void;
  private handle: PluginListenerHandle = { remove: () => Promise.resolve() };

  storage: OutboxPlatform['storage'] = {
    get: async ({ key }) => ({ value: this.data.get(key) ?? null }),
    set: async ({ key, value }) => {
      this.data.set(key, value);
    },
    remove: async ({ key }) => {
      this.data.delete(key);
    },
    keys: async () => ({ keys: [...this.data.keys()] }),
  };

  isConnected = async () => this.connected;
  onNetworkChange = async (listener: (connected: boolean) => void) => {
    this.networkListener = listener;
    return this.handle;
  };
  onResume = async (listener: () => void) => {
    this.resumeListener = listener;
    return this.handle;
  };

  stored(userId: string): OutboxEntry[] {
    return JSON.parse(this.data.get(`outbox.${userId}`) ?? '[]');
  }
}

describe('OutboxService', () => {
  const api = environment.apiUrl;
  let platform: FakePlatform;
  let outbox: OutboxService;
  let auth: AuthService;
  let httpMock: HttpTestingController;
  let toastCreate: jasmine.Spy;
  let results: OutboxResult[];

  const exp = () => Math.floor(Date.now() / 1000) + 3600;
  const signIn = (id: string, refreshToken = `r-${id}`) =>
    auth.setSession(fakeToken('CLIENT', { id, email: `${id}@x.io`, exp: exp() }), refreshToken);
  const write = (n: number, extra: Partial<OutboxWrite> = {}): OutboxWrite => ({
    method: 'POST',
    path: `/workouts/w1/cards/c1/sets`,
    body: { id: `set-${n}`, n },
    workoutId: 'w1',
    label: 'Leg day',
    ...extra,
  });
  const setsUrl = `${api}/workouts/w1/cards/c1/sets`;
  /** The one request in flight; fails if there are none or several */
  const sent = (): TestRequest => httpMock.expectOne(() => true);
  const offline = (req: TestRequest) => req.error(new ProgressEvent('error'), { status: 0, statusText: '' });
  const answer = (req: TestRequest, status: number) => req.flush({}, { status, statusText: 'Error' });
  const settle = () => flushMicrotasks();

  /** Creates the service as a fresh app launch would, from what's in storage */
  const launch = () => {
    outbox?.ngOnDestroy();
    outbox = TestBed.runInInjectionContext(() => new OutboxService());
    outbox.completed$.subscribe((r) => results.push(r));
    void outbox.start();
    settle();
  };

  beforeEach(() => {
    platform = new FakePlatform();
    results = [];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: OUTBOX_PLATFORM, useValue: platform },
      ],
    });
    auth = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    spyOn(TestBed.inject(AlertController), 'create').and.resolveTo({
      present: () => Promise.resolve(),
      onDidDismiss: () => Promise.resolve({}),
    } as unknown as HTMLIonAlertElement);
    toastCreate = spyOn(TestBed.inject(ToastController), 'create').and.resolveTo({
      present: () => Promise.resolve(),
    } as unknown as HTMLIonToastElement);
    signIn('userA');
  });

  afterEach(() => {
    outbox?.ngOnDestroy();
    outbox = undefined as unknown as OutboxService;
    httpMock.verify();
    localStorage.removeItem('token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  });

  it('stores an entry before sending it and removes it on a 2xx', fakeAsync(() => {
    launch();
    void outbox.enqueue(write(1));
    httpMock.expectNone(setsUrl);
    settle();
    const [stored] = platform.stored('userA');
    expect(stored).toEqual(
      jasmine.objectContaining({
        userId: 'userA',
        method: 'POST',
        path: '/workouts/w1/cards/c1/sets',
        body: { id: 'set-1', n: 1 },
        workoutId: 'w1',
        label: 'Leg day',
      }),
    );
    expect(stored.createdAt).toBe(Date.now());
    expect(outbox.pendingCount()).toBe(1);
    expect(outbox.state()).toBe('saving');

    const req = httpMock.expectOne(setsUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ id: 'set-1', n: 1 });
    req.flush({ id: 'set-1', weight: 100 });
    settle();

    expect(platform.stored('userA')).toEqual([]);
    expect(outbox.pendingCount()).toBe(0);
    expect(outbox.state()).toBe('idle');
    expect(results).toEqual([{ entry: stored, outcome: 'saved', response: { id: 'set-1', weight: 100 } }]);
  }));

  it('sends one entry at a time, in order, and keeps that order across a restart', fakeAsync(() => {
    launch();
    void outbox.enqueue(write(1));
    void outbox.enqueue(write(2, { method: 'PATCH', path: '/workouts/w1', body: { name: 'Legs' } }));
    void outbox.enqueue(write(3));
    settle();
    offline(sent());
    settle();
    expect(platform.stored('userA').map((e) => e.body)).toEqual([{ id: 'set-1', n: 1 }, { name: 'Legs' }, { id: 'set-3', n: 3 }]);

    launch();
    expect(outbox.pendingCount()).toBe(3);
    const first = sent();
    expect(first.request.body).toEqual({ id: 'set-1', n: 1 });
    first.flush({});
    settle();
    const second = sent();
    expect(second.request.method).toBe('PATCH');
    expect(second.request.url).toBe(`${api}/workouts/w1`);
    second.flush({});
    settle();
    const third = sent();
    expect(third.request.body).toEqual({ id: 'set-3', n: 3 });
    third.flush({});
    settle();
    expect(platform.stored('userA')).toEqual([]);
    expect(results.map((r) => r.outcome)).toEqual(['saved', 'saved', 'saved']);
  }));

  it('stops at a failing entry, keeps it and the ones after it, and backs off from 30 s to 5 min', fakeAsync(() => {
    launch();
    void outbox.enqueue(write(1));
    void outbox.enqueue(write(2));
    settle();
    answer(sent(), 503);
    settle();
    httpMock.expectNone(setsUrl);
    expect(platform.stored('userA').length).toBe(2);
    expect(outbox.state()).toBe('offline');

    const failures: ((req: TestRequest) => void)[] = [
      offline,
      (r) => answer(r, 500),
      (r) => answer(r, 408),
      (r) => answer(r, 429),
      offline,
    ];
    const delays = [30_000, 60_000, 120_000, 240_000, 300_000];
    delays.forEach((delay, i) => {
      tick(delay - 1);
      httpMock.expectNone(setsUrl);
      tick(1);
      failures[i](sent());
      settle();
    });
    // Capped at 5 minutes
    tick(299_999);
    httpMock.expectNone(setsUrl);
    tick(1);
    sent().flush({});
    settle();
    sent().flush({});
    settle();
    expect(platform.stored('userA')).toEqual([]);
    expect(outbox.state()).toBe('idle');
    // Nothing waiting, so no timer
    tick(600_000);
    httpMock.expectNone(setsUrl);
    expect(toastCreate).not.toHaveBeenCalled();
  }));

  it('starts again at 30 s after a success', fakeAsync(() => {
    launch();
    void outbox.enqueue(write(1));
    settle();
    offline(sent());
    settle();
    tick(30_000);
    offline(sent());
    settle();
    tick(60_000);
    sent().flush({});
    settle();
    void outbox.enqueue(write(2));
    settle();
    offline(sent());
    settle();
    tick(30_000);
    sent().flush({});
    settle();
  }));

  it('holds a change queued while waiting to retry until the timer, without backing off further', fakeAsync(() => {
    launch();
    void outbox.enqueue(write(1));
    settle();
    offline(sent());
    settle();
    void outbox.enqueue(write(2));
    void outbox.enqueue(write(3));
    settle();
    httpMock.expectNone(setsUrl);
    expect(platform.stored('userA').length).toBe(3);
    tick(30_000);
    offline(sent());
    settle();
    // Second failure: 60 s
    tick(60_000);
    [1, 2, 3].forEach((n) => {
      const req = sent();
      expect(req.request.body).toEqual({ id: `set-${n}`, n });
      req.flush({});
      settle();
    });
  }));

  it('replays at once when the network comes back', fakeAsync(() => {
    launch();
    void outbox.enqueue(write(1));
    settle();
    offline(sent());
    settle();
    platform.networkListener!(false);
    expect(outbox.online()).toBeFalse();
    httpMock.expectNone(setsUrl);
    platform.networkListener!(true);
    settle();
    expect(outbox.online()).toBeTrue();
    sent().flush({});
    settle();
    expect(platform.stored('userA')).toEqual([]);
  }));

  it('replays at once when the app resumes', fakeAsync(() => {
    launch();
    void outbox.enqueue(write(1));
    settle();
    offline(sent());
    settle();
    platform.resumeListener!();
    settle();
    sent().flush({});
    settle();
    expect(platform.stored('userA')).toEqual([]);
  }));

  it('replays at once after a refresh succeeds', fakeAsync(() => {
    launch();
    void outbox.enqueue(write(1));
    settle();
    offline(sent());
    settle();
    auth.refresh().subscribe();
    httpMock
      .expectOne(`${api}/auth/refresh`)
      .flush({ access_token: fakeToken('CLIENT', { id: 'userA', exp: exp() }), refresh_token: 'r2' });
    settle();
    sent().flush({});
    settle();
    expect(platform.stored('userA')).toEqual([]);
  }));

  it('resends the same request with the same client id after a lost response and takes the 200 as saved', fakeAsync(() => {
    // Relies on the API answering a repeated client id with the existing row
    launch();
    void outbox.enqueue({ method: 'POST', path: '/workouts', body: { id: 'w-client', name: 'Legs' }, workoutId: 'w-client', label: 'Legs' });
    settle();
    const first = httpMock.expectOne(`${api}/workouts`);
    offline(first);
    settle();
    tick(30_000);
    const again = httpMock.expectOne(`${api}/workouts`);
    expect(again.request.body).toEqual(first.request.body);
    again.flush({ id: 'w-client', name: 'Legs' }, { status: 200, statusText: 'OK' });
    settle();
    expect(platform.stored('userA')).toEqual([]);
    expect(results.map((r) => r.outcome)).toEqual(['saved']);
    tick(600_000);
    httpMock.expectNone(`${api}/workouts`);
  }));

  it("never sends another user's entries and leaves them stored until that user signs in again", fakeAsync(() => {
    launch();
    void outbox.enqueue(write(1));
    settle();
    offline(sent());
    settle();
    const storedA = platform.data.get('outbox.userA');

    signIn('userB');
    settle();
    expect(outbox.pendingCount()).toBe(0);
    expect(outbox.countFor('userA')).toBe(1);
    void outbox.enqueue(write(2, { body: { id: 'set-b' } }));
    settle();
    const b = sent();
    expect(b.request.body).toEqual({ id: 'set-b' });
    b.flush({});
    settle();
    platform.networkListener!(true);
    platform.resumeListener!();
    tick(600_000);
    httpMock.expectNone(setsUrl);
    expect(platform.data.get('outbox.userA')).toBe(storedA);
    expect(platform.stored('userB')).toEqual([]);

    // A restart while B is signed in doesn't send A's entries either
    launch();
    httpMock.expectNone(setsUrl);
    expect(platform.data.get('outbox.userA')).toBe(storedA);

    signIn('userA');
    settle();
    const a = sent();
    expect(a.request.body).toEqual({ id: 'set-1', n: 1 });
    expect(a.request.headers.get('Authorization')).toBe(`Bearer ${auth.getToken()}`);
    a.flush({});
    settle();
    expect(platform.data.has('outbox.userA')).toBeFalse();
  }));

  it('discards entries older than 30 days without sending them', fakeAsync(() => {
    const entry = (id: string, age: number): OutboxEntry => ({
      id,
      userId: 'userA',
      method: 'POST',
      path: '/workouts/w1/cards/c1/sets',
      body: { id },
      label: 'Leg day',
      createdAt: Date.now() - age,
    });
    const otherUser = { ...entry('old-b', 31 * DAY), userId: 'userB' };
    platform.data.set('outbox.userA', JSON.stringify([entry('old', 31 * DAY), entry('recent', 29 * DAY)]));
    platform.data.set('outbox.userB', JSON.stringify([otherUser]));
    launch();
    expect(platform.stored('userA').map((e) => e.id)).toEqual(['recent']);
    expect(platform.data.has('outbox.userB')).toBeFalse();
    const req = sent();
    expect(req.request.body).toEqual({ id: 'recent' });
    req.flush({});
    settle();
    expect(results.map((r) => r.entry.id)).toEqual(['recent']);
  }));

  it('drops a change the API rejects with a 4xx, says so, and carries on with the next', fakeAsync(() => {
    launch();
    void outbox.enqueue(write(1));
    void outbox.enqueue(write(2, { label: 'Push day' }));
    void outbox.enqueue(write(3, { label: 'Pull day' }));
    void outbox.enqueue(write(4));
    settle();
    answer(sent(), 404);
    settle();
    answer(sent(), 409);
    settle();
    answer(sent(), 400);
    settle();
    sent().flush({});
    settle();
    expect(platform.stored('userA')).toEqual([]);
    expect(results.map((r) => (r.outcome === 'dropped' ? r.status : r.outcome))).toEqual([404, 409, 400, 'saved']);
    expect(toastCreate.calls.allArgs().map(([o]) => o.message)).toEqual([
      "Couldn't save a change to Leg day.",
      "Couldn't save a change to Push day.",
      "Couldn't save a change to Pull day.",
    ]);
    expect(toastCreate).toHaveBeenCalledWith(jasmine.objectContaining({ color: 'danger' }));
  }));

  it('keeps every entry when a 401 ends the session, and sends them once the same user signs in again', fakeAsync(() => {
    launch();
    void outbox.enqueue(write(1));
    void outbox.enqueue(write(2));
    settle();
    answer(sent(), 401);
    httpMock.expectOne(`${api}/auth/refresh`).flush({}, { status: 401, statusText: 'Unauthorized' });
    settle();
    expect(auth.hasSession()).toBeFalse();
    expect(platform.stored('userA').length).toBe(2);
    expect(outbox.countFor('userA')).toBe(2);
    expect(toastCreate).not.toHaveBeenCalled();
    tick(600_000);
    httpMock.expectNone(setsUrl);

    signIn('userA');
    settle();
    sent().flush({});
    settle();
    sent().flush({});
    settle();
    expect(platform.stored('userA')).toEqual([]);
  }));

  it('gives the session-ended alert the number of changes waiting for that user', fakeAsync(() => {
    const alertCreate = TestBed.inject(AlertController).create as jasmine.Spy;
    launch();
    void outbox.enqueue(write(1));
    void outbox.enqueue(write(2));
    settle();
    answer(sent(), 401);
    httpMock.expectOne(`${api}/auth/refresh`).flush({}, { status: 401, statusText: 'Unauthorized' });
    settle();
    expect(alertCreate).toHaveBeenCalledWith(
      jasmine.objectContaining({ message: '2 changes from this phone will be saved after you log in.' }),
    );
  }));

  it('keeps the entry and stops when the session changes during a refresh', fakeAsync(() => {
    auth.setSession(fakeToken('CLIENT', { id: 'userA', exp: Math.floor(Date.now() / 1000) + 10 }), 'r1');
    launch();
    void outbox.enqueue(write(1));
    void outbox.enqueue(write(2));
    settle();
    const refresh = httpMock.expectOne(`${api}/auth/refresh`);
    signIn('userA', 'r-other');
    refresh.flush({ access_token: fakeToken('CLIENT', { id: 'userA', exp: exp() }), refresh_token: 'r2' });
    settle();
    // The new session's sign-in replays from the first entry
    const req = sent();
    expect(req.request.body).toEqual({ id: 'set-1', n: 1 });
    expect(platform.stored('userA').length).toBe(2);
    req.flush({});
    settle();
    sent().flush({});
    settle();
    expect(results.map((r) => r.outcome)).toEqual(['saved', 'saved']);
  }));

  it('is offline while changes wait after a failure or without a connection', fakeAsync(() => {
    platform.connected = false;
    launch();
    expect(outbox.online()).toBeFalse();
    expect(outbox.state()).toBe('idle');
    void outbox.enqueue(write(1));
    settle();
    expect(outbox.state()).toBe('saving');
    offline(sent());
    settle();
    expect(outbox.state()).toBe('offline');
    expect(outbox.pending().map((e) => e.body)).toEqual([{ id: 'set-1', n: 1 }]);
    // Stops the retry timer, which fakeAsync would otherwise run
    outbox.ngOnDestroy();
  }));

  it("forgets a user's entries for good, so none is sent when that id signs in again", fakeAsync(() => {
    launch();
    void outbox.enqueue(write(1));
    void outbox.enqueue(write(2));
    settle();
    offline(sent());
    settle();

    void outbox.forget('userA');
    settle();
    expect(outbox.countFor('userA')).toBe(0);
    expect(platform.data.has('outbox.userA')).toBeFalse();

    signIn('userA');
    settle();
    httpMock.expectNone(setsUrl);
  }));

  it('keeps a change queued while stored entries were still loading, after them', fakeAsync(() => {
    const earlier: OutboxEntry = { ...write(1), id: 'e1', userId: 'userA', createdAt: Date.now() };
    platform.data.set('outbox.userA', JSON.stringify([earlier]));
    let loaded!: () => void;
    const keys = platform.storage.keys;
    platform.storage.keys = () => new Promise((resolve) => (loaded = () => resolve(keys())));
    outbox = TestBed.runInInjectionContext(() => new OutboxService());
    void outbox.start();
    void outbox.enqueue(write(2));
    settle();
    httpMock.expectNone(setsUrl);

    loaded();
    settle();

    expect(platform.stored('userA').map((e) => e.body)).toEqual([{ id: 'set-1', n: 1 }, { id: 'set-2', n: 2 }]);
    expect(outbox.pendingCount()).toBe(2);
    const first = sent();
    expect(first.request.body).toEqual({ id: 'set-1', n: 1 });
    first.flush({});
    settle();
    const second = sent();
    expect(second.request.body).toEqual({ id: 'set-2', n: 2 });
    second.flush({});
    settle();
  }));

  it('refuses to queue a change with nobody signed in', fakeAsync(() => {
    launch();
    auth.logout();
    httpMock.expectOne(`${api}/auth/logout`).flush(null);
    let error: unknown;
    outbox.enqueue(write(1)).catch((e) => (error = e));
    settle();
    expect(error).toEqual(jasmine.any(Error));
    expect(platform.data.size).toBe(0);
  }));
});
