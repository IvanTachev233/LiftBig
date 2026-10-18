import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { OutboxService } from './outbox.service';
import { ReadCacheService } from './read-cache.service';
import { STARTUP_TIMEOUT_MS, startUp } from './startup';
import { WorkoutCopyService } from './workout-copy.service';

describe('startUp', () => {
  let restore: jasmine.Spy;
  let outboxStart: jasmine.Spy;
  let copiesStart: jasmine.Spy;
  let cacheStart: jasmine.Spy;

  const never = () => new Promise<void>(() => undefined);

  /** Runs the initializer; `done()` says whether it has resolved */
  const run = () => {
    let resolved = false;
    let rejected = false;
    TestBed.runInInjectionContext(startUp).then(
      () => (resolved = true),
      () => (rejected = true),
    );
    return { done: () => resolved, failed: () => rejected };
  };

  beforeEach(() => {
    restore = jasmine.createSpy('restore').and.resolveTo();
    outboxStart = jasmine.createSpy('outbox.start').and.resolveTo();
    copiesStart = jasmine.createSpy('copies.start').and.resolveTo();
    cacheStart = jasmine.createSpy('cache.start').and.resolveTo();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { restore } },
        { provide: OutboxService, useValue: { start: outboxStart } },
        { provide: WorkoutCopyService, useValue: { start: copiesStart } },
        { provide: ReadCacheService, useValue: { start: cacheStart } },
      ],
    });
  });

  it('restores the session, then starts the outbox, the device copies and the read cache', fakeAsync(() => {
    const startup = run();
    flushMicrotasks();
    expect(startup.done()).toBeTrue();
    expect(restore).toHaveBeenCalledBefore(outboxStart);
    expect(copiesStart).toHaveBeenCalled();
    expect(cacheStart).toHaveBeenCalled();
  }));

  it('still resolves, signed out, and starts the services when restoring the session fails', fakeAsync(() => {
    restore.and.rejectWith(new Error('storage blocked'));
    const startup = run();
    flushMicrotasks();
    expect(startup.failed()).toBeFalse();
    expect(startup.done()).toBeTrue();
    expect(outboxStart).toHaveBeenCalled();
    expect(copiesStart).toHaveBeenCalled();
    expect(cacheStart).toHaveBeenCalled();
  }));

  it('still resolves when a service fails to start', fakeAsync(() => {
    copiesStart.and.rejectWith(new Error('plugin missing'));
    const startup = run();
    flushMicrotasks();
    expect(startup.failed()).toBeFalse();
    expect(startup.done()).toBeTrue();
  }));

  it('resolves after the timeout when a service never finishes starting', fakeAsync(() => {
    outboxStart.and.callFake(never);
    const startup = run();
    tick(STARTUP_TIMEOUT_MS - 1);
    expect(startup.done()).toBeFalse();
    tick(1);
    expect(startup.done()).toBeTrue();
  }));

  it('starts the services and resolves after the timeout when restoring never finishes', fakeAsync(() => {
    restore.and.callFake(never);
    const startup = run();
    tick(STARTUP_TIMEOUT_MS - 1);
    expect(outboxStart).not.toHaveBeenCalled();
    expect(startup.done()).toBeFalse();
    tick(1);
    flushMicrotasks();
    expect(startup.done()).toBeTrue();
    expect(outboxStart).toHaveBeenCalled();
    expect(copiesStart).toHaveBeenCalled();
    expect(cacheStart).toHaveBeenCalled();
  }));
});
