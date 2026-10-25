import { Injectable, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, of, tap, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { OUTBOX_PLATFORM } from './outbox.service';
import { Workout } from './workout.service';

/** The workout list, the exercise list, or one opened workout */
export type ReadCacheKey = 'workouts' | 'exercises' | `workout:${string}`;

interface CachedAnswer {
  value: unknown;
  /** Milliseconds since the epoch */
  savedAt: number;
}

type UserCache = Partial<Record<ReadCacheKey, CachedAnswer>>;

const KEY_PREFIX = 'read-cache.';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_AGE_MS = 30 * DAY_MS;
// Completed workouts older than this aren't needed by Today
const COMPLETED_KEPT_MS = 14 * DAY_MS;
const MAX_OPENED = 20;
const MAX_EXERCISES = 2000;

/** No answer from the API: no connection, or the proxy in front of it couldn't reach it */
const isOffline = (error: unknown) =>
  error instanceof HttpErrorResponse && [0, 502, 503, 504].includes(error.status);

/**
 * The signed-in user's last answers to the reads that Today, the logger and
 * the exercise picker need, on the device. A read goes to the API first; only
 * when it can't be reached does it give the stored answer. Answers are kept
 * per user for 30 days, and only once `start()` has loaded what's stored.
 */
@Injectable({ providedIn: 'root' })
export class ReadCacheService {
  private auth = inject(AuthService);
  private storage = inject(OUTBOX_PLATFORM).storage;

  private caches = signal<Record<string, UserCache>>({});
  private ready: Promise<void> | null = null;
  private started = false;
  private writes: Promise<unknown> = Promise.resolve();

  /** Loads stored answers; safe to call more than once */
  start(): Promise<void> {
    this.ready ??= this.load().then(() => {
      this.started = true;
    });
    return this.ready;
  }

  /**
   * The request's answer, stored for the signed-in user; without a
   * connection, their stored answer for the key, else `fallback`'s
   */
  read<T>(key: ReadCacheKey, request: Observable<T>, fallback?: () => T | undefined): Observable<T> {
    const userId = this.auth.currentUser()?.id;
    return request.pipe(
      tap((value) => {
        if (userId) this.put(userId, key, value);
      }),
      catchError((error: unknown) => {
        const stored = isOffline(error) && userId ? (this.answer<T>(userId, key) ?? fallback?.()) : undefined;
        return stored === undefined ? throwError(() => error) : of(stored);
      }),
    );
  }

  /** The signed-in user's stored answer for the key */
  get<T>(key: ReadCacheKey): T | undefined {
    const userId = this.auth.currentUser()?.id;
    return userId ? this.answer<T>(userId, key) : undefined;
  }

  /** A workout as saved from this phone, so later reads without a connection show it */
  adopt(userId: string, workout: Workout) {
    if (!this.started) return;
    const listed = this.answer<Workout[]>(userId, 'workouts');
    if (listed) {
      const others = listed.filter((w) => w.id !== workout.id);
      const at = listed.findIndex((w) => w.id === workout.id);
      this.put(userId, 'workouts', at < 0 ? [...listed, workout] : [...others.slice(0, at), workout, ...others.slice(at)]);
    }
    this.put(userId, `workout:${workout.id}`, workout);
  }

  private answer<T>(userId: string, key: ReadCacheKey): T | undefined {
    return this.caches()[userId]?.[key]?.value as T | undefined;
  }

  private put(userId: string, key: ReadCacheKey, value: unknown) {
    if (!this.started) return;
    const now = Date.now();
    this.caches.update((all) => {
      // Re-added last, so the order of keys is the order they were last read
      const rest = { ...all[userId] };
      delete rest[key];
      return { ...all, [userId]: bounded({ ...rest, [key]: { value: trimmed(key, value, now), savedAt: now } }) };
    });
    void this.persist(userId);
  }

  /** Drops a user's answers for good, e.g. once their account is deleted; also before `start()` */
  forget(userId: string): Promise<void> {
    this.caches.update((all) => {
      const rest = { ...all };
      delete rest[userId];
      return rest;
    });
    return this.persist(userId);
  }

  private async load() {
    const oldest = Date.now() - MAX_AGE_MS;
    try {
      const { keys } = await this.storage.keys();
      for (const key of keys.filter((k) => k.startsWith(KEY_PREFIX))) {
        const userId = key.slice(KEY_PREFIX.length);
        const { value } = await this.storage.get({ key });
        const stored = parse(value);
        const kept: UserCache = {};
        for (const [name, answer] of Object.entries(stored) as [ReadCacheKey, CachedAnswer][]) {
          if (answer && answer.savedAt >= oldest) kept[name] = answer;
        }
        this.caches.update((all) => ({ ...all, [userId]: kept }));
        if (Object.keys(kept).length !== Object.keys(stored).length) await this.persist(userId);
      }
    } catch {
      // Storage unavailable: reads go to the API only
    }
  }

  /** Writes the user's answers; writes run one after another */
  private persist(userId: string): Promise<void> {
    const write = this.writes.then(async () => {
      const key = KEY_PREFIX + userId;
      const cache = this.caches()[userId];
      try {
        if (cache && Object.keys(cache).length) {
          await this.storage.set({ key, value: JSON.stringify(cache) });
        } else {
          await this.storage.remove({ key });
        }
      } catch {
        // Kept in memory for this run
      }
    });
    this.writes = write;
    return write;
  }
}

/** Only what the screens using the cache need */
function trimmed(key: ReadCacheKey, value: unknown, now: number): unknown {
  if (!Array.isArray(value)) return value;
  if (key === 'exercises') return value.slice(0, MAX_EXERCISES);
  if (key === 'workouts') {
    return (value as Workout[]).filter(
      (w) => w.status !== 'COMPLETED' || new Date(w.date).getTime() >= now - COMPLETED_KEPT_MS,
    );
  }
  return value;
}

/** The most recently opened workouts only; keys are in the order they were read */
function bounded(cache: UserCache): UserCache {
  const opened = (Object.keys(cache) as ReadCacheKey[]).filter((k) => k.startsWith('workout:'));
  for (const key of opened.slice(0, Math.max(0, opened.length - MAX_OPENED))) delete cache[key];
  return cache;
}

function parse(value: string | null): UserCache {
  try {
    const cache: unknown = JSON.parse(value ?? '{}');
    return cache && typeof cache === 'object' && !Array.isArray(cache) ? (cache as UserCache) : {};
  } catch {
    return {};
  }
}
