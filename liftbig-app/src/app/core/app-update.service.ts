import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/** `required`: below the minimum, blocking; `available`: below the latest, dismissible */
export type AppUpdate = 'none' | 'available' | 'required';

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.liftbig.app';

/** The installed build and resume events; specs replace it with a fake */
export interface AppUpdatePlatform {
  /** The Android versionCode; null where there's no Play build (web, iOS) */
  versionCode(): Promise<number | null>;
  onResume(listener: () => void): Promise<PluginListenerHandle>;
}

export const APP_UPDATE_PLATFORM = new InjectionToken<AppUpdatePlatform>('APP_UPDATE_PLATFORM', {
  providedIn: 'root',
  factory: () => ({
    versionCode: async () =>
      Capacitor.getPlatform() === 'android' ? Number((await App.getInfo()).build) : null,
    onResume: (listener) => App.addListener('resume', listener),
  }),
});

interface Versions {
  installed: number;
  min: number | null;
  latest: number | null;
}

const versionCode = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;

/**
 * Asks the API for the minimum and latest Android versionCode at start and on
 * resume (`GET /app-config`). Fails open: no answer shows nothing at start,
 * and a failed check later leaves the last answer in place. A dismissed offer
 * stays hidden until the app restarts or a newer build is the latest.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private http = inject(HttpClient);
  private platform = inject(APP_UPDATE_PLATFORM);

  private versions = signal<Versions | null>(null);
  private dismissedLatest = signal<number | null>(null);
  private started?: Promise<void>;
  private checks = 0;

  readonly state = computed<AppUpdate>(() => {
    const versions = this.versions();
    if (!versions) return 'none';
    const { installed, min, latest } = versions;
    if (min !== null && installed < min) return 'required';
    if (latest !== null && installed < latest && latest !== this.dismissedLatest()) return 'available';
    return 'none';
  });

  /** Checks now and on every resume; safe to call more than once */
  start(): Promise<void> {
    this.started ??= Promise.all([
      this.platform.onResume(() => void this.check()).catch(() => undefined),
      this.check(),
    ]).then(() => undefined);
    return this.started;
  }

  /** Hides the offer of the current latest build; a required update stays */
  dismiss() {
    if (this.state() === 'available') this.dismissedLatest.set(this.versions()!.latest);
  }

  private async check(): Promise<void> {
    const check = ++this.checks;
    try {
      const installed = versionCode(await this.platform.versionCode());
      if (installed === null) return;
      const config = await firstValueFrom(
        this.http.get<{ minVersionCode?: unknown; latestVersionCode?: unknown }>(`${environment.apiUrl}/app-config`),
      );
      // A newer check started meanwhile; its answer wins
      if (check !== this.checks) return;
      this.versions.set({
        installed,
        min: versionCode(config.minVersionCode),
        latest: versionCode(config.latestVersionCode),
      });
    } catch {
      // Offline, a server error or no app info: keep what's shown
    }
  }
}
