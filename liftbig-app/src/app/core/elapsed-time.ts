import { signal } from '@angular/core';

/** e.g. 1122 → "18:42", 3725 → "1:02:05" */
export function formatElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = String(seconds % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}`
    : `${minutes}:${secs}`;
}

/**
 * Time since a workout started. It reads the wall clock on every update, so
 * a callback that runs late (the app was in the background) still shows the
 * right time.
 */
export class ElapsedClock {
  /** Whole seconds since the start; null when not running */
  readonly seconds = signal<number | null>(null);

  private since = 0;
  private timeout: ReturnType<typeof setTimeout> | undefined;

  /** Counts from an ISO start time; none or an unreadable one stops it */
  start(startedAt: string | null | undefined) {
    const since = startedAt ? Date.parse(startedAt) : NaN;
    if (Number.isNaN(since)) {
      this.stop();
      return;
    }
    this.since = since;
    this.update();
  }

  stop() {
    clearTimeout(this.timeout);
    this.timeout = undefined;
    this.seconds.set(null);
  }

  private update() {
    clearTimeout(this.timeout);
    // A start ahead of the device clock shows 0
    const ms = Math.max(0, Date.now() - this.since);
    this.seconds.set(Math.floor(ms / 1000));
    // Runs again when the shown second changes
    this.timeout = setTimeout(() => this.update(), 1000 - (ms % 1000));
  }
}
