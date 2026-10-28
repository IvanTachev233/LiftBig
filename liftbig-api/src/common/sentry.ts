import * as Sentry from '@sentry/nestjs';
import type { Breadcrumb, ErrorEvent, NodeOptions } from '@sentry/nestjs';

// Request headers a report may keep; every other header is dropped, so no
// Authorization, cookies or IP-carrying headers (X-Forwarded-For and the like)
const KEPT_HEADERS = new Set([
  'user-agent',
  'content-type',
  'content-length',
  'accept',
]);

/**
 * Sentry options from SENTRY_DSN, SENTRY_RELEASE and NODE_ENV, or null when no
 * DSN is set (local runs, CI, tests): then nothing is reported. Errors only,
 * and only what docs/privacy/records-of-processing.md § Sentry settings lists:
 * SDK v11 collects user, body, cookie, query and local-variable data unless
 * dataCollection turns it off.
 */
export function sentryOptions(env: NodeJS.ProcessEnv): NodeOptions | null {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return null;
  return {
    dsn,
    release: env.SENTRY_RELEASE?.trim() || undefined,
    environment: env.NODE_ENV === 'production' ? 'production' : 'development',
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: [...KEPT_HEADERS] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}

/** Starts Sentry when a DSN is set; returns whether it did. */
export function initSentry(
  env: NodeJS.ProcessEnv,
  init: (options: NodeOptions) => unknown = Sentry.init,
): boolean {
  const options = sentryOptions(env);
  if (!options) return false;
  init(options);
  return true;
}

const withoutQuery = (url: string) => url.split(/[?#]/)[0];

/**
 * Last step before a report leaves the API, behind dataCollection: drops the
 * request body, cookies, query string and all but KEPT_HEADERS, every user
 * field except the account id, response headers and stack-frame variables.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const { request } = event;
  if (request) {
    delete request.data;
    delete request.cookies;
    delete request.query_string;
    delete request.env;
    if (request.url) request.url = withoutQuery(request.url);
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).filter(([name]) =>
          KEPT_HEADERS.has(name.toLowerCase()),
        ),
      );
    }
  }

  if (event.user) {
    const { id } = event.user;
    event.user = id === undefined ? undefined : { id };
  }

  const response = event.contexts?.response;
  if (response) delete response.headers;

  for (const exception of event.exception?.values ?? []) {
    for (const frame of exception.stacktrace?.frames ?? []) {
      delete frame.vars;
    }
  }
  return event;
}

/** Drops console breadcrumbs and query strings from HTTP ones. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === 'console') return null;
  const url: unknown = breadcrumb.data?.url;
  if (typeof url === 'string') {
    breadcrumb.data = { ...breadcrumb.data, url: withoutQuery(url) };
  }
  return breadcrumb;
}
