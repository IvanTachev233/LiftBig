import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

export type ThemeSetting = 'dark' | 'light' | 'system';

export const THEME_KEY = 'liftbig-theme';

const SETTINGS: readonly ThemeSetting[] = ['dark', 'light', 'system'];

const isSetting = (value: unknown): value is ThemeSetting =>
  SETTINGS.includes(value as ThemeSetting);

// The device's theme choice. Stored per device; applied as data-theme on <html>
// (the design tokens) plus Ionic's dark palette class.
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private document = inject(DOCUMENT);
  private systemDark: MediaQueryList | null = null;

  readonly setting = signal<ThemeSetting>('dark');

  /** Reads the stored setting, applies it and starts following the OS setting */
  init() {
    const stored = this.read();
    this.setting.set(isSetting(stored) ? stored : 'dark');
    this.systemDark = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)') ?? null;
    this.systemDark?.addEventListener('change', () => {
      if (this.setting() === 'system') this.apply();
    });
    this.apply();
  }

  set(setting: ThemeSetting) {
    if (!isSetting(setting)) return;
    this.setting.set(setting);
    this.write(setting);
    this.apply();
  }

  private apply() {
    const setting = this.setting();
    const dark = setting === 'system' ? (this.systemDark?.matches ?? true) : setting === 'dark';
    const root = this.document.documentElement;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.classList.toggle('ion-palette-dark', dark);
    if (Capacitor.isNativePlatform()) {
      // Style.Dark = light text for a dark background
      StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined);
    }
  }

  // Storage can throw (private mode, blocked site data); the theme then isn't kept
  private read(): string | null {
    try {
      return this.document.defaultView?.localStorage.getItem(THEME_KEY) ?? null;
    } catch {
      return null;
    }
  }

  private write(setting: ThemeSetting) {
    try {
      this.document.defaultView?.localStorage.setItem(THEME_KEY, setting);
    } catch {
      // keep the theme for this session only
    }
  }
}
