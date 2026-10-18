import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { environment } from '../../environments/environment';
import { AuthService, PENDING_CHANGES, sessionEndedMessage } from './auth.service';
import { Capacitor } from '@capacitor/core';
import { SecureStorageLike, TokenStore } from './token-store';
import { fakeToken } from './auth.testing';

describe('AuthService', () => {
  let auth: AuthService;
  let tokenStore: TokenStore;
  let http: HttpTestingController;
  let navigate: jasmine.Spy;
  const api = `${environment.apiUrl}/auth`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    auth = TestBed.inject(AuthService);
    tokenStore = TestBed.inject(TokenStore);
    http = TestBed.inject(HttpTestingController);
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('token');
  });

  describe('restore', () => {
    it('signs in from a refresh token alone, even with no access token', async () => {
      spyOn(tokenStore, 'getAccessToken').and.resolveTo(null);
      spyOn(tokenStore, 'getRefreshToken').and.resolveTo('r1');
      await auth.restore();
      expect(auth.hasSession()).toBeTrue();
    });

    it('signs in with the last access token even if expired, while a refresh token exists', async () => {
      const expired = fakeToken('CLIENT', { exp: Math.floor(Date.now() / 1000) - 60 });
      spyOn(tokenStore, 'getAccessToken').and.resolveTo(expired);
      spyOn(tokenStore, 'getRefreshToken').and.resolveTo('r1');
      await auth.restore();
      expect(auth.hasSession()).toBeTrue();
      expect(auth.currentUser()?.role).toBe('CLIENT');
    });

    it('goes to Login when there are no tokens anywhere', async () => {
      spyOn(tokenStore, 'getAccessToken').and.resolveTo(null);
      spyOn(tokenStore, 'getRefreshToken').and.resolveTo(null);
      spyOn(tokenStore, 'getLegacyAccessToken').and.returnValue(null);
      await auth.restore();
      expect(auth.hasSession()).toBeFalse();
    });

    it('keeps a legacy access-token-only session until it expires', async () => {
      const unexpired = fakeToken('CLIENT', { exp: Math.floor(Date.now() / 1000) + 600 });
      spyOn(tokenStore, 'getAccessToken').and.resolveTo(null);
      spyOn(tokenStore, 'getRefreshToken').and.resolveTo(null);
      spyOn(tokenStore, 'getLegacyAccessToken').and.returnValue(unexpired);
      await auth.restore();
      expect(auth.hasSession()).toBeTrue();
      expect(auth.getToken()).toBe(unexpired);
    });

    it('signs an expired legacy access token out, with no refresh token to fall back on', async () => {
      const expired = fakeToken('CLIENT', { exp: Math.floor(Date.now() / 1000) - 60 });
      spyOn(tokenStore, 'getAccessToken').and.resolveTo(null);
      spyOn(tokenStore, 'getRefreshToken').and.resolveTo(null);
      spyOn(tokenStore, 'getLegacyAccessToken').and.returnValue(expired);
      await auth.restore();
      expect(auth.hasSession()).toBeFalse();
    });

    it('resolves signed out when the token storage throws', async () => {
      spyOn(Capacitor, 'isNativePlatform').and.returnValue(false);
      spyOn(Storage.prototype, 'getItem').and.throwError(new DOMException('blocked', 'SecurityError'));
      await expectAsync(auth.restore()).toBeResolved();
      expect(auth.hasSession()).toBeFalse();
    });

    it('keeps a session signed in while restoring was still reading storage', fakeAsync(() => {
      let stored!: (token: string) => void;
      spyOn(tokenStore, 'getAccessToken').and.returnValue(new Promise((resolve) => (stored = resolve)));
      spyOn(tokenStore, 'getRefreshToken').and.resolveTo('r-old');
      void auth.restore();
      auth.setSession('a-new', 'r-new');
      stored('a-old');
      flushMicrotasks();
      expect(auth.getToken()).toBe('a-new');
    }));
  });

  describe('sign-in paths store both tokens', () => {
    it('login', () => {
      auth.login({ email: 'a@b.io', password: 'x' }).subscribe();
      http.expectOne(`${api}/login`).flush({ access_token: 'a1', refresh_token: 'r1' });
      expect(auth.getToken()).toBe('a1');
      expect(localStorage.getItem('refresh_token')).toBe('r1');
    });

    it('verifyEmail', () => {
      auth.verifyEmail('a@b.io', '123456').subscribe();
      http.expectOne(`${api}/verify-email`).flush({ access_token: 'a2', refresh_token: 'r2' });
      expect(auth.getToken()).toBe('a2');
      expect(localStorage.getItem('refresh_token')).toBe('r2');
    });
  });

  describe('logout', () => {
    it('calls the endpoint with the refresh token and clears both stores', () => {
      auth.setSession('a1', 'r1');
      auth.logout();
      http.expectOne(`${api}/logout`).flush(null, { status: 204, statusText: 'No Content' });
      expect(auth.isAuthenticated()).toBeFalse();
      expect(localStorage.getItem('access_token')).toBeNull();
      expect(localStorage.getItem('refresh_token')).toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/login']);
    });

    it('clears locally even when the endpoint call fails (offline logout)', () => {
      auth.setSession('a1', 'r1');
      auth.logout();
      http.expectOne(`${api}/logout`).error(new ProgressEvent('offline'));
      expect(auth.isAuthenticated()).toBeFalse();
      expect(auth.hasSession()).toBeFalse();
      expect(localStorage.getItem('refresh_token')).toBeNull();
    });

    it('skips the endpoint call when there is no refresh token, but still clears', () => {
      auth.setSession('a1');
      auth.logout();
      http.expectNone(`${api}/logout`);
      expect(auth.isAuthenticated()).toBeFalse();
    });
  });

  describe('setSession', () => {
    it('stores the refresh token, then the access token once that write has finished', fakeAsync(() => {
      spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
      const finish: (() => void)[] = [];
      const secure = jasmine.createSpyObj<SecureStorageLike>('secureStorage', ['getItem', 'setItem', 'removeItem']);
      secure.setItem.and.callFake(() => new Promise<void>((resolve) => finish.push(resolve)));
      (tokenStore as unknown as { secureStorage: SecureStorageLike }).secureStorage = secure;

      auth.setSession('a1', 'r1');

      expect(auth.getToken()).toBe('a1');
      expect(auth.hasRefreshToken()).toBeTrue();
      flushMicrotasks();
      expect(secure.setItem.calls.allArgs()).toEqual([['refresh_token', 'r1']]);
      finish.shift()!();
      flushMicrotasks();
      expect(secure.setItem.calls.allArgs()).toEqual([['refresh_token', 'r1'], ['access_token', 'a1']]);
    }));


    it('keeps the current refresh token when only an access token is given (acceptInvite)', () => {
      auth.setSession('a1', 'r1');
      auth.setSession('a2');
      expect(auth.getToken()).toBe('a2');
      expect(localStorage.getItem('refresh_token')).toBe('r1');
    });

    it('announces a new token pair from a sign-in or a refresh, not an access token alone', () => {
      let updates = 0;
      auth.sessionUpdated$.subscribe(() => updates++);
      auth.setSession('a1', 'r1');
      auth.setSession('a2');
      expect(updates).toBe(1);
      auth.refresh().subscribe();
      http.expectOne(`${api}/refresh`).flush({ access_token: 'a3', refresh_token: 'r3' });
      expect(updates).toBe(2);
    });
  });

  describe('refresh', () => {
    it('ignores an answer that arrives after logging out', () => {
      auth.setSession('a1', 'r1');
      auth.refresh().subscribe({ error: () => undefined });
      const req = http.expectOne(`${api}/refresh`);
      auth.logout();
      http.expectOne(`${api}/logout`).flush(null, { status: 204, statusText: 'No Content' });
      req.flush({ access_token: 'a2', refresh_token: 'r2' });
      expect(auth.hasSession()).toBeFalse();
      expect(localStorage.getItem('refresh_token')).toBeNull();
    });

    it('never hands the old session\'s token to a refresh started after the session changed', () => {
      const seenA: string[] = [];
      const seenB: string[] = [];
      auth.setSession('a1', 'r1');
      auth.refresh().subscribe({ next: (t) => seenA.push(t), error: () => undefined });
      const reqA = http.expectOne((r) => r.url === `${api}/refresh` && r.body.refresh_token === 'r1');
      auth.logout();
      http.expectOne(`${api}/logout`).flush(null, { status: 204, statusText: 'No Content' });
      auth.setSession('a9', 'r9');
      auth.refresh().subscribe({ next: (t) => seenB.push(t), error: () => undefined });
      const reqB = http.expectOne((r) => r.url === `${api}/refresh` && r.body.refresh_token === 'r9');
      reqA.flush({ access_token: 'aA2', refresh_token: 'rA2' });
      expect(seenA).toEqual([]);
      expect(seenB).toEqual([]);
      expect(auth.getToken()).toBe('a9');
      reqB.flush({ access_token: 'b2', refresh_token: 'r10' });
      expect(seenB).toEqual(['b2']);
      expect(auth.getToken()).toBe('b2');
      expect(localStorage.getItem('refresh_token')).toBe('r10');
    });

    it('starts a new refresh call after setSession replaces the pair mid-refresh', () => {
      auth.setSession('a1', 'r1');
      auth.refresh().subscribe({ error: () => undefined });
      const first = http.expectOne(`${api}/refresh`);
      auth.setSession('a9', 'r9');
      auth.refresh().subscribe();
      const second = http.expectOne(`${api}/refresh`);
      expect(second.request.body).toEqual({ refresh_token: 'r9' });
      first.flush({ access_token: 'aA2', refresh_token: 'rA2' });
      second.flush({ access_token: 'b2', refresh_token: 'r10' });
      expect(auth.getToken()).toBe('b2');
    });

    it('keeps sharing the refresh in flight when only the access token changes (acceptInvite)', () => {
      auth.setSession('a1', 'r1');
      auth.refresh().subscribe();
      auth.setSession('a2');
      auth.refresh().subscribe();
      http.expectOne(`${api}/refresh`).flush({ access_token: 'a3', refresh_token: 'r2' });
      expect(auth.getToken()).toBe('a3');
    });

    it("doesn't end a newer session when an older refresh answers 401", () => {
      auth.setSession('a1', 'r1');
      auth.refresh().subscribe({ error: () => undefined });
      const req = http.expectOne(`${api}/refresh`);
      auth.setSession('a9', 'r9');
      req.flush({}, { status: 401, statusText: 'Unauthorized' });
      expect(auth.getToken()).toBe('a9');
      expect(localStorage.getItem('refresh_token')).toBe('r9');
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('currentUser', () => {
    it("takes the id from the token's subject, as the API signs it", () => {
      const payload = btoa(JSON.stringify({ sub: 'u9', email: 'u9@x.io', role: 'CLIENT' }));
      auth.setSession(`header.${payload}.signature`, 'r1');
      expect(auth.currentUser()?.id).toBe('u9');
    });
  });

  describe('session ended', () => {
    it("counts the user's changes still waiting on this phone in the alert", fakeAsync(() => {
      const alertCreate = spyOn(TestBed.inject(AlertController), 'create').and.resolveTo({
        present: () => Promise.resolve(),
        onDidDismiss: () => Promise.resolve({}),
      } as unknown as HTMLIonAlertElement);
      TestBed.inject(PENDING_CHANGES).countFor = (userId) => (userId === 'u7' ? 3 : 0);
      auth.setSession(fakeToken('CLIENT', { id: 'u7' }), 'r1');

      auth.refresh().subscribe({ error: () => undefined });
      http.expectOne(`${api}/refresh`).flush({}, { status: 401, statusText: 'Unauthorized' });
      flushMicrotasks();

      expect(alertCreate).toHaveBeenCalledWith(
        jasmine.objectContaining({
          header: 'Your session ended',
          message: '3 changes from this phone will be saved after you log in.',
        }),
      );
    }));
  });

  describe('sessionEndedMessage', () => {
    it('says nothing more with no changes waiting', () => {
      expect(sessionEndedMessage(0)).toBeUndefined();
    });

    it('counts the changes waiting on the phone', () => {
      expect(sessionEndedMessage(1)).toBe('1 change from this phone will be saved after you log in.');
      expect(sessionEndedMessage(3)).toBe('3 changes from this phone will be saved after you log in.');
    });
  });
});
