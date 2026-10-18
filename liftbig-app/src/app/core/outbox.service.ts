import { Injectable, InjectionToken, OnDestroy, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ToastController } from '@ionic/angular';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { Preferences, PreferencesPlugin } from '@capacitor/preferences';
import { Observable, Subject, Subscription, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService, PENDING_CHANGES } from './auth.service';
import { newClientId } from './client-id';

/** A write to the API, kept on the device until the API answers 2xx */
export interface OutboxEntry {
  id: string;
  /** Sent only while this user is signed in */
  userId: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Relative to the API base URL, e.g. `/workouts/<id>` */
  path: string;
  body?: unknown;
  workoutId?: string;
  /** Names the change in "Couldn't save a change to <label>." */
  label: string;
  /** Milliseconds since the epoch */
  createdAt: number;
}

export type OutboxWrite = Pick<OutboxEntry, 'method' | 'path' | 'body' | 'workoutId' | 'label'>;

export type OutboxResult =
  | { entry: OutboxEntry; outcome: 'saved'; response: unknown }
  | { entry: OutboxEntry; outcome: 'dropped'; status: number };

/** `offline`: changes are waiting after a failed send or without a connection */
export type OutboxState = 'idle' | 'saving' | 'offline';

/** Device storage and events the outbox needs; specs replace it with a fake */
export interface OutboxPlatform {
  storage: Pick<PreferencesPlugin, 'get' | 'set' | 'remove' | 'keys'>;
  isConnected(): Promise<boolean>;
  onNetworkChange(listener: (connected: boolean) => void): Promise<PluginListenerHandle>;
  onResume(listener: () => void): Promise<PluginListenerHandle>;
}

export const OUTBOX_PLATFORM = new InjectionToken<OutboxPlatform>('OUTBOX_PLATFORM', {
  providedIn: 'root',
  factory: () => ({
    storage: Preferences,
    isConnected: async () => (await Network.getStatus()).connected,
    onNetworkChange: (listener) => Network.addListener('networkStatusChange', (s) => listener(s.connected)),
    onResume: (listener) => App.addListener('resume', listener),
  }),
});

const KEY_PREFIX = 'outbox.';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const RETRY_MS = 30_000;
const MAX_RETRY_MS = 5 * 60_000;

/** A 4xx that sending again won't fix; 401, 408 and 429 are worth another try */
const isDropped = (error: unknown): error is HttpErrorResponse =>
  error instanceof HttpErrorResponse &&
  error.status >= 400 &&
  error.status < 500 &&
  ![401, 408, 429].includes(error.status);

/**
 * Per-user queue of API writes, stored on the device before they are sent.
 * Entries go out one at a time in order, for the signed-in user only; the
 * first one that fails stops the queue until the next try (network back,
 * app resume, a new token pair, or a timer backing off from 30 s to 5 min).
 * A 4xx other than 401, 408 and 429 drops that entry with a toast.
 */
@Injectable({ providedIn: 'root' })
export class OutboxService implements OnDestroy {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private toastController = inject(ToastController);
  private platform = inject(OUTBOX_PLATFORM);

  private entries = signal<Record<string, OutboxEntry[]>>({});
  private sending = signal(false);
  private stalled = signal(false);
  private results = new Subject<OutboxResult>();
  private ready: Promise<void> | null = null;
  private draining: Promise<void> | null = null;
  // A trigger that came in while a replay was running: 'after-success' only
  // reruns if that replay emptied the queue, 'always' also after a failure
  private again: 'no' | 'after-success' | 'always' = 'no';
  private failures = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private writes: Promise<unknown> = Promise.resolve();
  private handles: Promise<PluginListenerHandle>[] = [];
  private subscription?: Subscription;
  private destroyed = false;

  /** The signed-in user's waiting entries, oldest first */
  readonly pending = computed(() => {
    const userId = this.auth.currentUser()?.id;
    return (userId && this.entries()[userId]) || [];
  });
  readonly pendingCount = computed(() => this.pending().length);
  readonly online = signal(true);
  readonly state = computed<OutboxState>(() => {
    if (this.pendingCount() === 0) return 'idle';
    if (this.sending()) return 'saving';
    return this.online() && !this.stalled() ? 'saving' : 'offline';
  });
  /** Every entry the API answered: saved with its response, or dropped */
  readonly completed$: Observable<OutboxResult> = this.results.asObservable();

  constructor() {
    inject(PENDING_CHANGES).countFor = (userId) => this.countFor(userId);
  }

  /** Loads stored entries and starts replaying; safe to call more than once */
  start(): Promise<void> {
    this.ready ??= this.load().then(() => {
      this.listen();
      void this.replay();
    });
    return this.ready;
  }

  /** Stores a write for the signed-in user, then sends it in turn */
  async enqueue(write: OutboxWrite): Promise<OutboxEntry> {
    const userId = this.auth.currentUser()?.id;
    if (!userId) throw new Error('Nobody is signed in');
    await this.start();
    const entry: OutboxEntry = { ...write, id: newClientId(), userId, createdAt: Date.now() };
    this.update(userId, (list) => [...list, entry]);
    await this.persist(userId);
    void this.replay(false);
    return entry;
  }

  /** Waiting entries of any user, e.g. the one whose session just ended */
  countFor(userId: string): number {
    return this.pendingFor(userId).length;
  }

  /** The given user's waiting entries, oldest first; the same whoever is signed in */
  pendingFor(userId: string): OutboxEntry[] {
    return this.entries()[userId] ?? [];
  }

  /**
   * Sends waiting entries now. A replay already running is joined, and run
   * again once it ends; after a failure only if `retryFailed` (something
   * changed, e.g. the network came back), else the timer retries.
   */
  replay(retryFailed = true): Promise<void> {
    if (!this.ready || this.destroyed) return Promise.resolve();
    if (this.draining) {
      if (this.again !== 'always') this.again = retryFailed ? 'always' : 'after-success';
      return this.draining;
    }
    if (!retryFailed && this.failures > 0) return Promise.resolve();
    this.draining = this.ready
      .then(() => this.drain())
      .then((failed) => {
        this.draining = null;
        const again = this.again;
        this.again = 'no';
        if (again === 'always' || (again === 'after-success' && !failed)) {
          void this.replay(again === 'always');
        } else {
          this.schedule();
        }
      });
    return this.draining;
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    clearTimeout(this.timer);
    this.subscription?.unsubscribe();
    this.handles.forEach((h) => void h.then((handle) => handle.remove()).catch(() => undefined));
  }

  /** Drops a user's entries for good, e.g. once their account is deleted */
  forget(userId: string): Promise<void> {
    this.update(userId, () => []);
    return this.persist(userId);
  }

  private async load(): Promise<void> {
    try {
      const { keys } = await this.platform.storage.keys();
      const loaded: Record<string, OutboxEntry[]> = {};
      for (const key of keys.filter((k) => k.startsWith(KEY_PREFIX))) {
        const { value } = await this.platform.storage.get({ key });
        const list = parse(value);
        if (list.length) loaded[key.slice(KEY_PREFIX.length)] = list;
      }
      this.entries.set(loaded);
    } catch {
      // Storage unavailable: start empty, new entries still go out
    }
    await this.discardExpired();
  }

  private listen() {
    this.subscription = this.auth.sessionUpdated$.subscribe(() => void this.replay());
    this.platform
      .isConnected()
      .then((connected) => this.online.set(connected))
      .catch(() => undefined);
    this.handles.push(
      this.platform.onNetworkChange((connected) => {
        this.online.set(connected);
        if (connected) void this.replay();
      }),
      this.platform.onResume(() => void this.replay()),
    );
    this.handles.forEach((h) => h.catch(() => undefined));
  }

  /** Sends entries until the queue is empty (false) or one fails (true) */
  private async drain(): Promise<boolean> {
    await this.discardExpired();
    const toasted = new Set<string>();
    for (;;) {
      const userId = this.auth.hasSession() ? this.auth.currentUser()?.id : undefined;
      const entry = userId ? this.entries()[userId]?.[0] : undefined;
      if (!entry || this.destroyed) {
        this.failures = 0;
        this.stalled.set(false);
        return false;
      }
      this.sending.set(true);
      try {
        const response = await firstValueFrom(
          this.http.request(entry.method, `${environment.apiUrl}${entry.path}`, { body: entry.body }),
        );
        this.failures = 0;
        this.stalled.set(false);
        await this.remove(entry);
        this.results.next({ entry, outcome: 'saved', response });
      } catch (error) {
        if (!isDropped(error)) {
          // Kept for the next try; a 401 here means the session ended or
          // couldn't be renewed, and the entry waits for the next sign-in
          this.failures++;
          this.stalled.set(true);
          return true;
        }
        await this.remove(entry);
        this.results.next({ entry, outcome: 'dropped', status: error.status });
        if (!toasted.has(entry.label)) {
          toasted.add(entry.label);
          void this.showDropped(entry.label);
        }
      } finally {
        this.sending.set(false);
      }
    }
  }

  private schedule() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.destroyed || this.pendingCount() === 0 || !this.auth.hasSession()) return;
    const delay = Math.min(RETRY_MS * 2 ** Math.max(0, this.failures - 1), MAX_RETRY_MS);
    this.timer = setTimeout(() => void this.replay(), delay);
  }

  private async discardExpired() {
    const oldest = Date.now() - MAX_AGE_MS;
    const changed = Object.entries(this.entries())
      .filter(([, list]) => list.some((e) => e.createdAt < oldest))
      .map(([userId]) => userId);
    for (const userId of changed) {
      this.update(userId, (list) => list.filter((e) => e.createdAt >= oldest));
      await this.persist(userId);
    }
  }

  private async remove(entry: OutboxEntry) {
    this.update(entry.userId, (list) => list.filter((e) => e.id !== entry.id));
    await this.persist(entry.userId);
  }

  private update(userId: string, change: (list: OutboxEntry[]) => OutboxEntry[]) {
    this.entries.update((all) => {
      const next = { ...all, [userId]: change(all[userId] ?? []) };
      if (!next[userId].length) delete next[userId];
      return next;
    });
  }

  /** Writes the user's current list; writes run one after another */
  private persist(userId: string): Promise<void> {
    const write = this.writes.then(async () => {
      const key = KEY_PREFIX + userId;
      const list = this.entries()[userId];
      try {
        if (list) {
          await this.platform.storage.set({ key, value: JSON.stringify(list) });
        } else {
          await this.platform.storage.remove({ key });
        }
      } catch {
        // Kept in memory and still sent this run
      }
    });
    this.writes = write;
    return write;
  }

  private async showDropped(label: string) {
    try {
      const toast = await this.toastController.create({
        message: `Couldn't save a change to ${label}.`,
        duration: 2500,
        color: 'danger',
      });
      await toast.present();
    } catch {
      // Nothing more to do if the toast can't be shown
    }
  }
}

function parse(value: string | null): OutboxEntry[] {
  try {
    const list: unknown = JSON.parse(value ?? '[]');
    return Array.isArray(list) ? (list as OutboxEntry[]) : [];
  } catch {
    return [];
  }
}
