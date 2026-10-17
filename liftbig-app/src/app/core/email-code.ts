import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';

/** Seconds before a new code may be requested after one was sent */
export const RESEND_COOLDOWN_SECONDS = 60;

/** "45 s" up to a minute, else whole minutes rounded up ("3 min") */
export function waitLabel(seconds: number): string {
  return seconds <= 60 ? `${seconds} s` : `${Math.ceil(seconds / 60)} min`;
}

/** The message for a failed code request or code check */
export function emailCodeError(err: HttpErrorResponse): string {
  const body = (err.error ?? {}) as { attemptsLeft?: number; retryAfterSeconds?: number };
  switch (err.status) {
    case 0:
      return 'No connection. Check your internet and try again.';
    case 400:
      if (typeof body.attemptsLeft === 'number') {
        const n = body.attemptsLeft;
        return `Wrong code. ${n} ${n === 1 ? 'try' : 'tries'} left.`;
      }
      return 'Enter the 6-digit code from the email.';
    case 409:
      return 'This code no longer works. Tap Resend code to get a new one.';
    case 429:
      return `Too many codes requested. Try again in ${waitLabel(retryAfter(err))}.`;
    case 503:
      return "We couldn't send the email. Try again in a moment.";
    default:
      return 'Something went wrong. Please try again.';
  }
}

/** retryAfterSeconds of a 429, or the usual cooldown when it is missing */
export function retryAfter(err: HttpErrorResponse): number {
  const seconds = (err.error as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds;
  return typeof seconds === 'number' && seconds > 0 ? seconds : RESEND_COOLDOWN_SECONDS;
}

/** Whole seconds left until a moment, ticking once a second; call stop() when done */
export class Countdown {
  readonly remaining = signal(0);
  private timer?: ReturnType<typeof setInterval>;
  private endsAt = 0;

  start(seconds: number) {
    this.stop();
    this.endsAt = Date.now() + seconds * 1000;
    this.remaining.set(seconds);
    this.timer = setInterval(() => this.tick(), 1000);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private tick() {
    const left = Math.max(0, Math.ceil((this.endsAt - Date.now()) / 1000));
    this.remaining.set(left);
    if (left === 0) this.stop();
  }
}
