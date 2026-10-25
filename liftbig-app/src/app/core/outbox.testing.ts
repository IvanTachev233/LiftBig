import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import type { PluginListenerHandle } from '@capacitor/core';
import { Subject, Subscription } from 'rxjs';
import { environment } from '../../environments/environment';
import { newClientId } from './client-id';
import { OutboxEntry, OutboxPlatform, OutboxResult, OutboxState, OutboxWrite } from './outbox.service';

/** In-memory Preferences, network status and resume events */
export class FakeOutboxPlatform implements OutboxPlatform {
  data = new Map<string, string>();
  connected = true;
  networkListener?: (connected: boolean) => void;
  resumeListener?: () => void;
  private handle: PluginListenerHandle = { remove: () => Promise.resolve() };

  storage: OutboxPlatform['storage'] = {
    get: async ({ key }) => ({ value: this.data.get(key) ?? null }),
    set: async ({ key, value }) => {
      this.data.set(key, value);
    },
    remove: async ({ key }) => {
      this.data.delete(key);
    },
    keys: async () => ({ keys: [...this.data.keys()] }),
  };

  isConnected = async () => this.connected;
  onNetworkChange = async (listener: (connected: boolean) => void) => {
    this.networkListener = listener;
    return this.handle;
  };
  onResume = async (listener: () => void) => {
    this.resumeListener = listener;
    return this.handle;
  };

  setConnected(connected: boolean) {
    this.connected = connected;
    this.networkListener?.(connected);
  }
}

const isDropped = (error: unknown): error is HttpErrorResponse =>
  error instanceof HttpErrorResponse &&
  error.status >= 400 &&
  error.status < 500 &&
  ![401, 408, 429].includes(error.status);

/**
 * OutboxService for page specs: no storage and no signed-in user (all
 * entries count as one user's), and a write goes out at once when nothing
 * is ahead of it. Like the real one it sends one entry at a time in order,
 * keeps an entry that failed until `replay()`, and drops one answered with
 * a 4xx other than 401, 408 and 429.
 */
@Injectable()
export class InstantOutbox {
  private http = inject(HttpClient);
  private entries = signal<OutboxEntry[]>([]);
  private inFlight = signal<Subscription | null>(null);
  private stalled = signal(false);
  private results = new Subject<OutboxResult>();

  readonly pending = this.entries.asReadonly();
  readonly pendingCount = computed(() => this.entries().length);
  readonly online = signal(true);
  readonly state = computed<OutboxState>(() => {
    if (this.pendingCount() === 0) return 'idle';
    if (this.inFlight()) return 'saving';
    return this.online() && !this.stalled() ? 'saving' : 'offline';
  });
  readonly completed$ = this.results.asObservable();

  start(): Promise<void> {
    return Promise.resolve();
  }

  enqueue(write: OutboxWrite): Promise<OutboxEntry> {
    const entry: OutboxEntry = { ...write, id: newClientId(), userId: 'u1', createdAt: Date.now() };
    this.entries.update((list) => [...list, entry]);
    if (!this.stalled()) this.sendNext();
    return Promise.resolve(entry);
  }

  countFor(): number {
    return this.pendingCount();
  }

  pendingFor(): OutboxEntry[] {
    return this.entries();
  }

  replay(): Promise<void> {
    this.stalled.set(false);
    this.sendNext();
    return Promise.resolve();
  }

  // Unlike the real outbox, holds entries while `online` is false, so specs
  // can keep changes waiting without answering a request
  private sendNext() {
    const entry = this.entries()[0];
    if (!entry || this.inFlight() || !this.online()) return;
    const done = (result: OutboxResult) => {
      this.inFlight.set(null);
      this.entries.update((list) => list.filter((e) => e !== entry));
      this.results.next(result);
      this.sendNext();
    };
    let finished = false;
    const subscription = this.http
      .request(entry.method, `${environment.apiUrl}${entry.path}`, { body: entry.body })
      .subscribe({
        next: (response) => {
          finished = true;
          done({ entry, outcome: 'saved', response });
        },
        error: (error: unknown) => {
          finished = true;
          if (isDropped(error)) {
            done({ entry, outcome: 'dropped', status: error.status });
          } else {
            this.inFlight.set(null);
            this.stalled.set(true);
          }
        },
      });
    if (!finished) this.inFlight.set(subscription);
  }
}
