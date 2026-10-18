import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { TokenStore, SecureStorageLike } from './token-store';

describe('TokenStore', () => {
  let store: TokenStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(TokenStore);
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('token');
  });

  afterEach(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('token');
  });

  describe('on web', () => {
    beforeEach(() => spyOn(Capacitor, 'isNativePlatform').and.returnValue(false));

    it('stores and reads the access and refresh tokens in localStorage', async () => {
      await store.setAccessToken('a1');
      await store.setRefreshToken('r1');
      expect(localStorage.getItem('access_token')).toBe('a1');
      expect(localStorage.getItem('refresh_token')).toBe('r1');
      expect(await store.getAccessToken()).toBe('a1');
      expect(await store.getRefreshToken()).toBe('r1');
    });

    it('reads the legacy access token left by an older build', () => {
      localStorage.setItem('token', 'old-token');
      expect(store.getLegacyAccessToken()).toBe('old-token');
    });

    it('clears the current and legacy keys', async () => {
      localStorage.setItem('token', 'old-token');
      await store.setAccessToken('a1');
      await store.setRefreshToken('r1');
      await store.clear();
      expect(localStorage.getItem('access_token')).toBeNull();
      expect(localStorage.getItem('refresh_token')).toBeNull();
      expect(localStorage.getItem('token')).toBeNull();
    });

    it('clears only the legacy key on clearLegacyAccessToken', async () => {
      localStorage.setItem('token', 'old-token');
      await store.setAccessToken('a1');
      store.clearLegacyAccessToken();
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('access_token')).toBe('a1');
    });

    describe('with localStorage blocked', () => {
      beforeEach(() => {
        const blocked = () => {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        };
        spyOn(Storage.prototype, 'getItem').and.callFake(blocked);
        spyOn(Storage.prototype, 'setItem').and.callFake(blocked);
        spyOn(Storage.prototype, 'removeItem').and.callFake(blocked);
      });

      // Unblocked again before the cleanup above runs
      afterEach(() => {
        for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
          (Storage.prototype[method] as jasmine.Spy).and.callThrough();
        }
      });

      it('reads no tokens instead of rejecting the caller', async () => {
        expect(await store.getAccessToken()).toBeNull();
        expect(await store.getRefreshToken()).toBeNull();
        expect(store.getLegacyAccessToken()).toBeNull();
      });

      it('writes and clears without rejecting the caller', async () => {
        await expectAsync(store.setAccessToken('a1')).toBeResolved();
        await expectAsync(store.setRefreshToken('r1')).toBeResolved();
        await expectAsync(store.clear()).toBeResolved();
        expect(() => store.clearLegacyAccessToken()).not.toThrow();
      });
    });
  });

  describe('on native', () => {
    let fake: jasmine.SpyObj<SecureStorageLike>;

    beforeEach(() => {
      spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
      fake = jasmine.createSpyObj('secureStorage', ['getItem', 'setItem', 'removeItem']);
      fake.getItem.and.resolveTo(null);
      fake.setItem.and.resolveTo(undefined);
      fake.removeItem.and.resolveTo(undefined);
      (store as unknown as { secureStorage: SecureStorageLike }).secureStorage = fake;
    });

    it('writes through the secure storage plugin, never localStorage', async () => {
      await store.setAccessToken('a1');
      expect(fake.setItem).toHaveBeenCalledWith('access_token', 'a1');
      expect(localStorage.getItem('access_token')).toBeNull();
    });

    it('reads through the secure storage plugin', async () => {
      fake.getItem.and.resolveTo('a1');
      expect(await store.getAccessToken()).toBe('a1');
      expect(fake.getItem).toHaveBeenCalledWith('access_token');
    });

    it('returns null when the plugin throws instead of rejecting the caller', async () => {
      fake.getItem.and.rejectWith(new Error('nope'));
      expect(await store.getAccessToken()).toBeNull();
    });

    it('sends each write or clear to the plugin only after the one before it has finished', fakeAsync(() => {
      const finish: (() => void)[] = [];
      fake.setItem.and.callFake(() => new Promise<void>((resolve) => finish.push(resolve)));
      fake.removeItem.and.callFake(() => new Promise<void>((resolve) => finish.push(resolve)));
      void store.setRefreshToken('r1');
      void store.setAccessToken('a1');
      void store.clear();
      flushMicrotasks();
      expect(fake.setItem.calls.allArgs()).toEqual([['refresh_token', 'r1']]);
      finish.shift()!();
      flushMicrotasks();
      expect(fake.setItem.calls.allArgs()).toEqual([['refresh_token', 'r1'], ['access_token', 'a1']]);
      expect(fake.removeItem).not.toHaveBeenCalled();
      finish.shift()!();
      flushMicrotasks();
      expect(fake.removeItem).toHaveBeenCalledWith('access_token');
      expect(fake.removeItem).toHaveBeenCalledWith('refresh_token');
    }));

    it('carries on with the next write after the plugin rejects one', async () => {
      fake.setItem.and.returnValues(Promise.reject(new Error('nope')), Promise.resolve());
      await store.setRefreshToken('r1');
      await store.setAccessToken('a1');
      expect(fake.setItem).toHaveBeenCalledWith('access_token', 'a1');
    });

    it('still clears the legacy localStorage key on clear()', async () => {
      localStorage.setItem('token', 'old-token');
      await store.clear();
      expect(localStorage.getItem('token')).toBeNull();
      expect(fake.removeItem).toHaveBeenCalledWith('access_token');
      expect(fake.removeItem).toHaveBeenCalledWith('refresh_token');
    });
  });
});
