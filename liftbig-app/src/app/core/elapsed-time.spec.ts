import { fakeAsync, tick } from '@angular/core/testing';
import { ElapsedClock, formatElapsed } from './elapsed-time';

describe('formatElapsed', () => {
  it('shows m:ss under an hour and h:mm:ss from an hour', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(84)).toBe('1:24');
    expect(formatElapsed(1122)).toBe('18:42');
    expect(formatElapsed(3599)).toBe('59:59');
    expect(formatElapsed(3600)).toBe('1:00:00');
    expect(formatElapsed(3725)).toBe('1:02:05');
  });
});

describe('ElapsedClock', () => {
  let clock: ElapsedClock;
  const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

  beforeEach(() => {
    clock = new ElapsedClock();
  });

  afterEach(() => clock.stop());

  it('is idle until started', () => {
    expect(clock.seconds()).toBeNull();
  });

  it('counts whole seconds from the start time', fakeAsync(() => {
    clock.start(ago(1122.4));
    expect(clock.seconds()).toBe(1122);
    tick(599);
    expect(clock.seconds()).toBe(1122);
    tick(1);
    expect(clock.seconds()).toBe(1123);
    tick(60_000);
    expect(clock.seconds()).toBe(1183);
    clock.stop();
  }));

  it('a new start time replaces the old one', fakeAsync(() => {
    clock.start(ago(3600));
    clock.start(ago(10));
    expect(clock.seconds()).toBe(10);
    tick(5000);
    expect(clock.seconds()).toBe(15);
    clock.stop();
  }));

  it('shows 0 for a start time ahead of the device clock', fakeAsync(() => {
    clock.start(new Date(Date.now() + 30_000).toISOString());
    expect(clock.seconds()).toBe(0);
    clock.stop();
  }));

  it('stops with no or an unreadable start time', fakeAsync(() => {
    clock.start(ago(5));
    clock.start(null);
    expect(clock.seconds()).toBeNull();
    clock.start('not a date');
    expect(clock.seconds()).toBeNull();
  }));

  it('stop hides it', fakeAsync(() => {
    clock.start(ago(5));
    clock.stop();
    expect(clock.seconds()).toBeNull();
    tick(2000);
    expect(clock.seconds()).toBeNull();
  }));
});
