import { HttpErrorResponse } from '@angular/common/http';

const plural = (n: number, word: string, many: string) => `${n} ${n === 1 ? word : many}`;

/**
 * Text for a failed password check: 403 says how many tries are left, 429
 * how long the lock lasts, anything else `fallback`
 */
export function passwordErrorMessage(
  err: HttpErrorResponse,
  wrong: string,
  fallback: string,
): string {
  const body = (err.error ?? {}) as { attemptsLeft?: number; retryAfterMinutes?: number };
  if (err.status === 403) {
    const left = body.attemptsLeft;
    return left === undefined ? wrong : `${wrong} ${plural(left, 'try', 'tries')} left.`;
  }
  if (err.status === 429) {
    const minutes = body.retryAfterMinutes ?? 15;
    return `Too many wrong passwords. Try again in ${plural(minutes, 'minute', 'minutes')}.`;
  }
  return fallback;
}
