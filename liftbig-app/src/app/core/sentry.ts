import { ErrorHandler, Provider } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import * as Sentry from '@sentry/capacitor';
import * as SentryAngular from '@sentry/angular';
import type { Breadcrumb, ErrorEvent } from '@sentry/angular';
import { environment } from '../../environments/environment';

// Error and crash reports (T1 A3e). What may be sent is fixed by
// docs/privacy/records-of-processing.md P10 and § Sentry settings: change
// them, the privacy policy and data-safety.md together with this file.
// The native Android SDK's own breadcrumbs are off in AndroidManifest.xml.

/** The address without query string or fragment (routes carry ?email=) */
export const withoutQuery = (url: string): string => url.replace(/[?#].*$/s, '');

const EMAIL = /[^\s@"'<>()[\]{},;:]+@[^\s@"'<>()[\]{},;:]+\.[a-z]{2,}/gi;
const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;

/** Masks emails and tokens that end up in an error message */
const scrub = (text: string): string => text.replace(JWT, '[token]').replace(EMAIL, '[email]');

const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/** Route changes and API calls only, as their address and status */
export function cleanBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  const { type, category, level, timestamp } = breadcrumb;
  const data = breadcrumb.data ?? {};
  const base: Breadcrumb = {
    ...(type !== undefined && { type }),
    category,
    ...(level !== undefined && { level }),
    ...(timestamp !== undefined && { timestamp }),
  };
  if (category === 'navigation') {
    const from = str(data['from']);
    const to = str(data['to']);
    return {
      ...base,
      data: { ...(from !== undefined && { from: withoutQuery(from) }), ...(to !== undefined && { to: withoutQuery(to) }) },
    };
  }
  if (category === 'xhr' || category === 'fetch') {
    const url = str(data['url']);
    return {
      ...base,
      data: {
        method: data['method'],
        ...(url !== undefined && { url: withoutQuery(url) }),
        status_code: data['status_code'],
      },
    };
  }
  return null;
}

/** Runs on every JS event, after the native breadcrumbs and user are merged in */
export function cleanEvent(event: ErrorEvent): ErrorEvent | null {
  const userId = event.user?.id;
  const userAgent = event.request?.headers?.['User-Agent'];
  const url = event.request?.url;
  const cleaned: ErrorEvent = {
    ...event,
    user: userId === undefined ? undefined : { id: userId },
    request: event.request && {
      ...(url !== undefined && { url: withoutQuery(url) }),
      ...(userAgent !== undefined && { headers: { 'User-Agent': userAgent } }),
    },
    extra: undefined,
    breadcrumbs: event.breadcrumbs?.map(cleanBreadcrumb).filter((b): b is Breadcrumb => b !== null),
    message: event.message === undefined ? undefined : scrub(event.message),
    exception: event.exception && {
      ...event.exception,
      values: event.exception.values?.map((value) => ({
        ...value,
        ...(value.value !== undefined && { value: scrub(value.value) }),
      })),
    },
  };
  for (const key of ['user', 'request', 'extra', 'message', 'exception', 'breadcrumbs'] as const) {
    if (cleaned[key] === undefined) delete cleaned[key];
  }
  return cleaned;
}

/** The report for a failed API call: address and status, never the response body */
export const httpErrorMessage = (error: HttpErrorResponse): string =>
  `HTTP ${error.status} ${error.statusText} from ${withoutQuery(error.url ?? '')}`.trim();

/** Errors only: no tracing, replay, feedback or logs; release health sessions stay on */
export function sentryOptions(dsn: string): Sentry.CapacitorOptions {
  return {
    dsn,
    sendDefaultPii: false,
    enableLogs: false,
    enableAutoSessionTracking: true,
    // Release and dist come from the native layer: com.liftbig.app@versionName+versionCode, versionCode
    integrations: [SentryAngular.breadcrumbsIntegration({ console: false, dom: false, sentry: false })],
    beforeBreadcrumb: cleanBreadcrumb,
    beforeSend: cleanEvent,
  };
}

type Init = (options: Sentry.CapacitorOptions) => void;

/** Starts Sentry before Angular boots; does nothing without a DSN (dev, tests, Docker) */
export function initSentry(
  dsn: string | undefined = environment.sentryDsn,
  init: Init = (options) => Sentry.init(options, SentryAngular.init),
): boolean {
  if (!dsn) return false;
  init(sentryOptions(dsn));
  return true;
}

/** Reports errors Angular catches; Angular's own ErrorHandler stays without a DSN */
export function sentryProviders(dsn: string | undefined = environment.sentryDsn): Provider[] {
  if (!dsn) return [];
  return [
    {
      provide: ErrorHandler,
      useValue: SentryAngular.createErrorHandler({
        extractor: (error, defaultExtractor) =>
          error instanceof HttpErrorResponse ? httpErrorMessage(error) : defaultExtractor(error),
      }),
    },
  ];
}
