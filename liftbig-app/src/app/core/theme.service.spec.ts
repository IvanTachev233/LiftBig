import { TestBed } from '@angular/core/testing';
import { THEME_KEY, ThemeService } from './theme.service';

describe('ThemeService', () => {
  const root = document.documentElement;
  let prefersDark: boolean;
  let listeners: ((event: { matches: boolean }) => void)[];

  const service = () => TestBed.inject(ThemeService);
  const isDark = () => root.classList.contains('ion-palette-dark');
  const osChangesTo = (dark: boolean) => {
    prefersDark = dark;
    listeners.forEach((fn) => fn({ matches: dark }));
  };

  beforeEach(() => {
    localStorage.removeItem(THEME_KEY);
    prefersDark = true;
    listeners = [];
    spyOn(window, 'matchMedia').and.callFake(
      (query: string) =>
        ({
          get matches() {
            return prefersDark;
          },
          media: query,
          addEventListener: (_type: string, fn: (event: { matches: boolean }) => void) =>
            listeners.push(fn),
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
  });

  afterEach(() => {
    localStorage.removeItem(THEME_KEY);
    root.removeAttribute('data-theme');
    root.classList.remove('ion-palette-dark');
  });

  it('defaults to dark with no stored value', () => {
    service().init();
    expect(service().setting()).toBe('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(isDark()).toBeTrue();
  });

  it('applies a stored light theme without the dark palette', () => {
    localStorage.setItem(THEME_KEY, 'light');
    service().init();
    expect(service().setting()).toBe('light');
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(isDark()).toBeFalse();
  });

  it('falls back to dark for a stored value it does not know', () => {
    localStorage.setItem(THEME_KEY, 'sepia');
    service().init();
    expect(service().setting()).toBe('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(isDark()).toBeTrue();
  });

  it('falls back to dark when storage cannot be read', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('blocked');
    service().init();
    expect(service().setting()).toBe('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
  });

  it('follows the OS setting live in system mode', () => {
    localStorage.setItem(THEME_KEY, 'system');
    prefersDark = false;
    service().init();
    expect(service().setting()).toBe('system');
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(isDark()).toBeFalse();

    osChangesTo(true);
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(isDark()).toBeTrue();

    osChangesTo(false);
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(isDark()).toBeFalse();
  });

  it('ignores OS changes outside system mode', () => {
    service().init();
    osChangesTo(false);
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(isDark()).toBeTrue();
  });

  it('applies and stores a new setting', () => {
    service().init();
    service().set('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(isDark()).toBeFalse();

    prefersDark = true;
    service().set('system');
    expect(localStorage.getItem(THEME_KEY)).toBe('system');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(isDark()).toBeTrue();
  });

  it('ignores a setting it does not know', () => {
    service().init();
    service().set('sepia' as never);
    expect(service().setting()).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });
});
