import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { DEFAULT_REST_SECONDS, RestTimer, RestTimeService, formatRest } from './rest-time';

describe('formatRest', () => {
  it('shows minutes and two-digit seconds', () => {
    expect(formatRest(120)).toBe('2:00');
    expect(formatRest(84)).toBe('1:24');
    expect(formatRest(5)).toBe('0:05');
    expect(formatRest(600)).toBe('10:00');
  });
});

describe('RestTimeService', () => {
  let service: RestTimeService;

  beforeEach(() => {
    service = TestBed.inject(RestTimeService);
  });

  it('starts at the 120 s default', () => {
    expect(DEFAULT_REST_SECONDS).toBe(120);
    expect(service.seconds()).toBe(120);
  });

  it('takes a stored value, including 0 (off)', () => {
    service.set(90);
    expect(service.seconds()).toBe(90);
    service.set(0);
    expect(service.seconds()).toBe(0);
  });

  it('falls back to the default when the API sends none', () => {
    service.set(45);
    service.set(undefined);
    expect(service.seconds()).toBe(120);
  });
});

describe('RestTimer', () => {
  let timer: RestTimer;

  beforeEach(() => {
    timer = new RestTimer();
  });

  afterEach(() => timer.stop());

  it('is idle until started', () => {
    expect(timer.remaining()).toBeNull();
  });

  it('counts down whole seconds and hides itself at 0', fakeAsync(() => {
    timer.start(3);
    expect(timer.remaining()).toBe(3);
    tick(999);
    expect(timer.remaining()).toBe(3);
    tick(1);
    expect(timer.remaining()).toBe(2);
    tick(1000);
    expect(timer.remaining()).toBe(1);
    tick(1000);
    expect(timer.remaining()).toBeNull();
  }));

  it('+15 s adds to the time left', fakeAsync(() => {
    timer.start(120);
    tick(36_000);
    expect(timer.remaining()).toBe(84);
    timer.add(15);
    expect(timer.remaining()).toBe(99);
    tick(99_000);
    expect(timer.remaining()).toBeNull();
  }));

  it('Skip hides it at once and nothing fires later', fakeAsync(() => {
    timer.start(120);
    tick(1000);
    timer.stop();
    expect(timer.remaining()).toBeNull();
    tick(200_000);
    expect(timer.remaining()).toBeNull();
  }));

  it('starting again restarts from the full time', fakeAsync(() => {
    timer.start(60);
    tick(40_000);
    timer.start(60);
    expect(timer.remaining()).toBe(60);
    tick(59_000);
    expect(timer.remaining()).toBe(1);
    tick(1000);
    expect(timer.remaining()).toBeNull();
  }));

  it('a time of 0 (off) shows nothing and ends a running rest', fakeAsync(() => {
    timer.start(0);
    expect(timer.remaining()).toBeNull();
    timer.start(30);
    timer.start(0);
    expect(timer.remaining()).toBeNull();
    tick(30_000);
  }));

  it('+15 s does nothing while idle', fakeAsync(() => {
    timer.add(15);
    expect(timer.remaining()).toBeNull();
    tick(15_000);
    expect(timer.remaining()).toBeNull();
  }));

  it('counts from the wall clock, so a late timer callback shows the right time', fakeAsync(() => {
    const now = Date.now();
    const clock = spyOn(Date, 'now').and.returnValue(now);
    timer.start(120);
    // The app was in the background for 50 s; the next callback is late
    clock.and.returnValue(now + 50_500);
    tick(1000);
    expect(timer.remaining()).toBe(70);
    clock.and.returnValue(now + 130_000);
    tick(1000);
    expect(timer.remaining()).toBeNull();
  }));
});
