import { Injectable, signal } from '@angular/core';

export const DEFAULT_REST_SECONDS = 120;

/** e.g. 84 → "1:24" */
export function formatRest(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

// The signed-in user's default rest between sets; 0 turns the timer off
@Injectable({ providedIn: 'root' })
export class RestTimeService {
  readonly seconds = signal(DEFAULT_REST_SECONDS);

  /** An API without the setting sends none, which means the default */
  set(seconds: number | undefined) {
    this.seconds.set(seconds ?? DEFAULT_REST_SECONDS);
  }
}

/**
 * A rest countdown. It counts to a wall-clock end time, so a callback that
 * runs late (the app was in the background) still shows the right time.
 */
export class RestTimer {
  /** Whole seconds left, rounded up; null when no rest is running */
  readonly remaining = signal<number | null>(null);

  private endsAt = 0;
  private timeout: ReturnType<typeof setTimeout> | undefined;

  /** Starts over from `seconds`; 0 ends a running rest */
  start(seconds: number) {
    if (seconds <= 0) {
      this.stop();
      return;
    }
    this.endsAt = Date.now() + seconds * 1000;
    this.update();
  }

  add(seconds: number) {
    if (this.remaining() === null) return;
    this.endsAt += seconds * 1000;
    this.update();
  }

  stop() {
    clearTimeout(this.timeout);
    this.timeout = undefined;
    this.remaining.set(null);
  }

  private update() {
    clearTimeout(this.timeout);
    const left = this.endsAt - Date.now();
    if (left <= 0) {
      this.stop();
      return;
    }
    this.remaining.set(Math.ceil(left / 1000));
    // Runs again when the shown second changes
    this.timeout = setTimeout(() => this.update(), left % 1000 || 1000);
  }
}
