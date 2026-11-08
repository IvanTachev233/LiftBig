import { ErrorHandler } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import type { Breadcrumb, ErrorEvent } from '@sentry/angular';
import { environment } from '../../environments/environment';
import { environment as dockerEnvironment } from '../../environments/environment.docker';
import { environment as stagingEnvironment } from '../../environments/environment.staging';
import {
  cleanBreadcrumb,
  cleanEvent,
  httpErrorMessage,
  initSentry,
  sentryOptions,
  sentryProviders,
} from './sentry';

const DSN = 'https://public@o1.ingest.de.sentry.io/2';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';

describe('Sentry', () => {
  describe('off without a DSN', () => {
    it('has no DSN in dev, tests and the Docker build', () => {
      expect(environment.sentryDsn).toBe('');
      expect(dockerEnvironment.sentryDsn).toBe('');
    });

    it('has no DSN in the staging build, which calls the staging API (ADR 0023)', () => {
      expect(stagingEnvironment.sentryDsn).toBe('');
      expect(stagingEnvironment.apiUrl).toBe('https://staging-api.liftbig.co');
    });

    it('does not init without a DSN', () => {
      const init = jasmine.createSpy('init');
      expect(initSentry('', init)).toBeFalse();
      expect(initSentry(undefined, init)).toBeFalse();
      expect(init).not.toHaveBeenCalled();
    });

    it('keeps Angular’s own ErrorHandler without a DSN', () => {
      expect(sentryProviders('')).toEqual([]);
    });

    it('inits with the DSN and the Sentry ErrorHandler when one is set', () => {
      const init = jasmine.createSpy('init');
      expect(initSentry(DSN, init)).toBeTrue();
      expect(init).toHaveBeenCalledOnceWith(jasmine.objectContaining({ dsn: DSN }));
      const providers = sentryProviders(DSN) as { provide: unknown }[];
      expect(providers.map((p) => p.provide)).toEqual([ErrorHandler]);
    });
  });

  describe('options', () => {
    const options = sentryOptions(DSN);

    it('sends errors only: no PII, tracing, replay, feedback or logs', () => {
      expect(options.sendDefaultPii).toBeFalse();
      expect(options.tracesSampleRate).toBeUndefined();
      expect(options.tracesSampler).toBeUndefined();
      expect(options.enableLogs).toBeFalse();
      expect(options.release).toBeUndefined(); // the native layer's versionName+versionCode
      const names = (options.integrations as { name: string }[]).map((i) => i.name);
      expect(names).toEqual(['Breadcrumbs']);
    });

    it('keeps release health sessions on', () => {
      expect(options.enableAutoSessionTracking).toBeTrue();
    });

    it('uses the scrubbers', () => {
      expect(options.beforeBreadcrumb).toBe(cleanBreadcrumb);
      expect(options.beforeSend).toBe(cleanEvent);
    });
  });

  describe('cleanBreadcrumb', () => {
    it('drops console, tap and native breadcrumbs', () => {
      for (const category of ['console', 'ui.click', 'ui.input', 'ui.lifecycle', 'app.lifecycle', 'device.event', 'network.event', 'sentry.event']) {
        expect(cleanBreadcrumb({ category, message: 'x' })).withContext(category).toBeNull();
      }
      expect(cleanBreadcrumb({ message: 'no category' })).toBeNull();
    });

    it('keeps route changes without query or fragment', () => {
      expect(
        cleanBreadcrumb({
          category: 'navigation',
          timestamp: 1,
          data: { from: '/login?email=a%40b.co', to: '/verify-email?email=a@b.co#x', extra: 'y' },
        }),
      ).toEqual({
        category: 'navigation',
        timestamp: 1,
        data: { from: '/login', to: '/verify-email' },
      });
    });

    it('keeps API calls as method, address and status only', () => {
      for (const category of ['xhr', 'fetch']) {
        expect(
          cleanBreadcrumb({
            type: 'http',
            category,
            level: 'error',
            timestamp: 2,
            data: {
              method: 'GET',
              url: 'https://api.example/lifts/best?exerciseIds=1,2',
              status_code: 500,
              request_body_size: 42,
              response_body_size: 7,
            },
          }),
        ).toEqual({
          type: 'http',
          category,
          level: 'error',
          timestamp: 2,
          data: { method: 'GET', url: 'https://api.example/lifts/best', status_code: 500 },
        });
      }
    });
  });

  describe('cleanEvent', () => {
    const event = (): ErrorEvent => ({
      type: undefined,
      message: `login failed for a.b@example.com with Bearer ${JWT}`,
      exception: { values: [{ type: 'Error', value: `token ${JWT} for x@y.io` }] },
      user: { id: 'installation-id', email: 'a@b.co', username: 'ab', ip_address: '1.2.3.4' },
      request: {
        url: 'capacitor://localhost/verify-email?email=a@b.co',
        headers: { 'User-Agent': 'UA', Referer: 'capacitor://localhost/login?email=a@b.co', Cookie: 'c' },
        data: { password: 'p' },
        cookies: { c: '1' },
        query_string: 'email=a@b.co',
      },
      extra: { body: 'b' },
      breadcrumbs: [
        { category: 'console', message: 'a@b.co' },
        { category: 'device.event', data: { level: 80 } },
        { category: 'navigation', data: { from: '/login?email=a@b.co', to: '/tabs' } },
      ] as Breadcrumb[],
    });

    it('keeps only the installation id as the user', () => {
      expect(cleanEvent(event())!.user).toEqual({ id: 'installation-id' });
      expect(cleanEvent({ ...event(), user: { email: 'a@b.co' } })!.user).toBeUndefined();
    });

    it('drops the request body, cookies, query and headers other than the user agent', () => {
      expect(cleanEvent(event())!.request).toEqual({
        url: 'capacitor://localhost/verify-email',
        headers: { 'User-Agent': 'UA' },
      });
      expect(cleanEvent(event())!.extra).toBeUndefined();
    });

    it('filters breadcrumbs merged from the native layer', () => {
      expect(cleanEvent(event())!.breadcrumbs).toEqual([
        { category: 'navigation', data: { from: '/login', to: '/tabs' } },
      ]);
    });

    it('handles an event with nothing to clean', () => {
      expect(cleanEvent({ type: undefined })).toEqual({ type: undefined });
    });

    it('masks emails and tokens in messages', () => {
      const cleaned = cleanEvent(event())!;
      expect(cleaned.message).toBe('login failed for [email] with Bearer [token]');
      expect(cleaned.exception!.values![0].value).toBe('token [token] for [email]');
    });
  });

  describe('httpErrorMessage', () => {
    it('names the address without query and the status, never the body', () => {
      const error = new HttpErrorResponse({
        url: 'https://api.example/auth/login?email=a@b.co',
        status: 401,
        statusText: 'Unauthorized',
        error: 'wrong password for a@b.co',
      });
      expect(httpErrorMessage(error)).toBe('HTTP 401 Unauthorized from https://api.example/auth/login');
    });
  });
});
