import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { OutboxService } from './outbox.service';
import { ReadCacheService } from './read-cache.service';
import { WorkoutCopyService } from './workout-copy.service';

/**
 * How long startup waits on device storage before routing anyway. Reads take
 * milliseconds even on a slow phone, so this is only reached by a plugin
 * call that never answers; past it the user sees Login or their screen
 * instead of a blank app.
 */
export const STARTUP_TIMEOUT_MS = 5000;

/**
 * Restores the session before routing, so guards see it on a cold start;
 * then loads what an earlier run left waiting, so the logger opens its
 * device copies, and the outbox starts sending it; and the answers kept for
 * screens that open without a connection. Never rejects and resolves within
 * STARTUP_TIMEOUT_MS: a failed restore leaves the user signed out, a failed
 * start leaves that service empty, and work still running carries on after
 * routing.
 */
export function startUp(): Promise<void> {
  const auth = inject(AuthService);
  const services = [inject(OutboxService), inject(WorkoutCopyService), inject(ReadCacheService)];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => (timer = setTimeout(resolve, STARTUP_TIMEOUT_MS)));
  const byDeadline = (...steps: (() => Promise<unknown>)[]) =>
    Promise.race([Promise.all(steps.map(settled)), deadline]);
  return byDeadline(() => auth.restore())
    .then(() => byDeadline(...services.map((service) => () => service.start())))
    .then(() => clearTimeout(timer));
}

/** The step's promise, resolved whether it succeeds, rejects or throws */
function settled(step: () => Promise<unknown>): Promise<void> {
  return new Promise<unknown>((resolve) => resolve(step())).then(
    () => undefined,
    () => undefined,
  );
}
