import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';
/** The only key an app build before refresh tokens ever wrote */
const LEGACY_ACCESS_KEY = 'token';

export type SecureStorageLike = Pick<typeof SecureStorage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Access and refresh tokens, kept in the Android Keystore-backed secure
 * storage on native and in `localStorage` on the web build (which has no
 * secure storage of its own). The native path goes through `secureStorage`
 * so specs can replace it with a fake instead of exercising the real plugin.
 * Native writes and clears run one after another, in the order called.
 * Storage that fails or is blocked reads as empty; writes and clears to it
 * are skipped, and the in-memory session still works for this run.
 */
@Injectable({ providedIn: 'root' })
export class TokenStore {
  private secureStorage: SecureStorageLike = SecureStorage;
  private nativeWrites: Promise<unknown> = Promise.resolve();

  getAccessToken(): Promise<string | null> {
    return this.read(ACCESS_KEY);
  }

  getRefreshToken(): Promise<string | null> {
    return this.read(REFRESH_KEY);
  }

  setAccessToken(token: string): Promise<void> {
    return this.write(ACCESS_KEY, token);
  }

  setRefreshToken(token: string): Promise<void> {
    return this.write(REFRESH_KEY, token);
  }

  /** The access token an app build before refresh tokens left in `localStorage` */
  getLegacyAccessToken(): string | null {
    return webRead(LEGACY_ACCESS_KEY);
  }

  clearLegacyAccessToken(): void {
    webRemove(LEGACY_ACCESS_KEY);
  }

  /** Clears both tokens and the legacy key, best effort */
  clear(): Promise<void> {
    this.clearLegacyAccessToken();
    if (this.isNative()) {
      return this.queue(async () => {
        const settle = (p: Promise<unknown>) => p.catch(() => undefined);
        await Promise.all([settle(this.secureStorage.removeItem(ACCESS_KEY)), settle(this.secureStorage.removeItem(REFRESH_KEY))]);
      });
    }
    webRemove(ACCESS_KEY);
    webRemove(REFRESH_KEY);
    return Promise.resolve();
  }

  private isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  private async read(key: string): Promise<string | null> {
    if (this.isNative()) {
      try {
        return (await this.secureStorage.getItem(key)) ?? null;
      } catch {
        return null;
      }
    }
    return webRead(key);
  }

  private write(key: string, value: string): Promise<void> {
    if (this.isNative()) {
      return this.queue(() => this.secureStorage.setItem(key, value));
    }
    try {
      localStorage.setItem(key, value);
    } catch {
      // Best effort, as on native
    }
    return Promise.resolve();
  }

  /** Runs the native operation after the ones before it; never rejects */
  private queue(operation: () => Promise<unknown>): Promise<void> {
    const next = this.nativeWrites.then(operation).then(
      () => undefined,
      () => undefined,
    );
    this.nativeWrites = next;
    return next;
  }
}

function webRead(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function webRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Best effort; nothing could have been stored there either
  }
}
