import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { OUTBOX_PLATFORM, OutboxService } from './outbox.service';
import { ReadCacheService } from './read-cache.service';
import { Workout } from './workout.service';

interface StoredCopy {
  workout: Workout;
  /** Milliseconds since the epoch */
  savedAt: number;
}

/** A user's copies by workout id */
type Copies = Record<string, StoredCopy>;

const KEY_PREFIX = 'workout-copy.';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The logger's own copy of each workout it changed, per user, on the
 * device. While a workout has changes waiting in the outbox its copy is
 * newer than the API's, so the logger opens it and Today and the resume bar
 * show it. A copy is deleted once its workout's last waiting change is
 * answered.
 */
@Injectable({ providedIn: 'root' })
export class WorkoutCopyService {
  private auth = inject(AuthService);
  private outbox = inject(OutboxService);
  private storage = inject(OUTBOX_PLATFORM).storage;
  private cache = inject(ReadCacheService);

  private copies = signal<Record<string, Copies>>({});
  private ready: Promise<void> | null = null;
  private writes: Promise<unknown> = Promise.resolve();

  /** The signed-in user's copies of workouts with changes waiting */
  readonly queued = computed<Workout[]>(() => {
    const userId = this.auth.currentUser()?.id;
    if (!userId) return [];
    const mine = this.copies()[userId] ?? {};
    const waiting = new Set(this.outbox.pendingFor(userId).map((e) => e.workoutId));
    return Object.values(mine)
      .map((copy) => copy.workout)
      .filter((w) => waiting.has(w.id));
  });

  constructor() {
    this.outbox.completed$.subscribe(({ entry, outcome }) => {
      const workoutId = entry.workoutId;
      // The entry's own user, who may no longer be the one signed in
      if (!workoutId || this.outbox.pendingFor(entry.userId).some((e) => e.workoutId === workoutId)) return;
      const copy = this.copies()[entry.userId]?.[workoutId];
      if (!copy) return;
      // All of it is saved now, so reads without a connection show it
      if (outcome === 'saved') this.cache.adopt(entry.userId, copy.workout);
      this.update(entry.userId, (copies) => {
        const rest = { ...copies };
        delete rest[workoutId];
        return rest;
      });
      void this.persist(entry.userId);
    });
  }

  /** Loads stored copies; safe to call more than once */
  start(): Promise<void> {
    this.ready ??= this.load();
    return this.ready;
  }

  /** Keeps the workout as the signed-in user's latest copy */
  save(workout: Workout) {
    const userId = this.auth.currentUser()?.id;
    if (!userId) return;
    this.update(userId, (copies) => ({ ...copies, [workout.id]: { workout, savedAt: Date.now() } }));
    void this.persist(userId);
  }

  /** The copy of a workout with changes waiting, else null */
  get(workoutId: string): Workout | null {
    return this.queued().find((w) => w.id === workoutId) ?? null;
  }

  /** The API's list with each queued copy in place of its row, or added */
  overlay(workouts: Workout[]): Workout[] {
    const queued = this.queued();
    const listed = new Set(workouts.map((w) => w.id));
    return [
      ...workouts.map((w) => queued.find((q) => q.id === w.id) ?? w),
      ...queued.filter((q) => !listed.has(q.id)),
    ];
  }

  /** Drops a user's copies for good, e.g. once their account is deleted */
  forget(userId: string): Promise<void> {
    this.update(userId, () => ({}));
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
        const kept: Copies = {};
        for (const [id, copy] of Object.entries(stored)) {
          if (copy.savedAt >= oldest) kept[id] = copy;
        }
        // Copies saved since the app started are newer than stored ones
        this.update(userId, (current) => ({ ...kept, ...current }));
        if (Object.keys(kept).length !== Object.keys(stored).length) await this.persist(userId);
      }
    } catch {
      // Storage unavailable: the logger opens from the API
    }
  }

  private update(userId: string, change: (copies: Copies) => Copies) {
    this.copies.update((all) => {
      const next = { ...all, [userId]: change(all[userId] ?? {}) };
      if (!Object.keys(next[userId]).length) delete next[userId];
      return next;
    });
  }

  /** Writes the user's current copies; writes run one after another */
  private persist(userId: string): Promise<void> {
    const write = this.writes.then(async () => {
      const key = KEY_PREFIX + userId;
      const copies = this.copies()[userId];
      try {
        if (copies) {
          await this.storage.set({ key, value: JSON.stringify(copies) });
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

function parse(value: string | null): Copies {
  try {
    const copies: unknown = JSON.parse(value ?? '{}');
    return copies && typeof copies === 'object' && !Array.isArray(copies) ? (copies as Copies) : {};
  } catch {
    return {};
  }
}
