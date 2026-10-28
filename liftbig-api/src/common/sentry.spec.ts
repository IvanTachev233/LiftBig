import type { Breadcrumb, ErrorEvent } from '@sentry/nestjs';
import {
  initSentry,
  scrubBreadcrumb,
  scrubEvent,
  sentryOptions,
} from './sentry';

const DSN = 'https://public@o1.ingest.de.sentry.io/2';

// A server event as the SDK builds it for a failed request
function requestEvent(): ErrorEvent {
  return {
    type: undefined,
    request: {
      method: 'POST',
      url: 'https://api.liftbig.co/workouts/1/sets?email=a%40b.co',
      query_string: 'email=a%40b.co',
      data: { notes: 'left knee hurt', email: 'a@b.co' },
      cookies: { session: 'abc' },
      env: { REMOTE_ADDR: '203.0.113.7' },
      headers: {
        authorization: 'Bearer eyJ.secret.token',
        cookie: 'session=abc',
        'x-forwarded-for': '203.0.113.7',
        forwarded: 'for=203.0.113.7',
        'x-real-ip': '203.0.113.7',
        'user-agent': 'LiftBig/3 Android',
        'content-type': 'application/json',
      },
    },
    user: {
      id: 'b6f7c1de-0000-4000-8000-000000000001',
      email: 'a@b.co',
      username: 'Lifter',
      ip_address: '203.0.113.7',
    },
    contexts: {
      response: { status_code: 500, headers: { 'set-cookie': 'session=abc' } },
    },
    exception: {
      values: [
        {
          type: 'Error',
          value: 'boom',
          stacktrace: {
            frames: [
              { function: 'save', vars: { email: 'a@b.co', notes: 'knee' } },
            ],
          },
        },
      ],
    },
  };
}

describe('sentryOptions', () => {
  it.each([
    ['unset', {}],
    ['empty', { SENTRY_DSN: '' }],
    ['blank', { SENTRY_DSN: '   ' }],
  ])('is null when SENTRY_DSN is %s', (_label, env) => {
    expect(sentryOptions(env)).toBeNull();
  });

  it('sends errors only, with the release and no personal data collection', () => {
    const options = sentryOptions({
      SENTRY_DSN: ` ${DSN} `,
      SENTRY_RELEASE: 'abc1234',
      NODE_ENV: 'production',
    });

    expect(options).toMatchObject({
      dsn: DSN,
      release: 'abc1234',
      environment: 'production',
      beforeSend: scrubEvent,
      beforeBreadcrumb: scrubBreadcrumb,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpBodies: [],
        urlQueryParams: false,
        databaseQueryData: false,
        stackFrameVariables: false,
        httpHeaders: { response: false },
      },
    });
    // No tracing, profiling or logs
    expect(options).not.toHaveProperty('tracesSampleRate');
    expect(options).not.toHaveProperty('tracesSampler');
    expect(options).not.toHaveProperty('profilesSampleRate');
    expect(options).not.toHaveProperty('enableLogs');
  });

  it('leaves the release unset without SENTRY_RELEASE and names other environments development', () => {
    const options = sentryOptions({ SENTRY_DSN: DSN });
    expect(options?.release).toBeUndefined();
    expect(options?.environment).toBe('development');
  });
});

describe('initSentry', () => {
  it('does not initialise the SDK without a DSN', () => {
    const init = jest.fn();
    expect(initSentry({}, init)).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });

  it('initialises the SDK with the options when a DSN is set', () => {
    const init = jest.fn();
    const env = { SENTRY_DSN: DSN, SENTRY_RELEASE: 'abc1234' };
    expect(initSentry(env, init)).toBe(true);
    expect(init).toHaveBeenCalledWith(sentryOptions(env));
  });
});

describe('scrubEvent', () => {
  it('drops the request body, cookies and query string', () => {
    const { request } = scrubEvent(requestEvent());
    expect(request).not.toHaveProperty('data');
    expect(request).not.toHaveProperty('cookies');
    expect(request).not.toHaveProperty('query_string');
    expect(request).not.toHaveProperty('env');
    expect(request?.url).toBe('https://api.liftbig.co/workouts/1/sets');
    expect(request?.method).toBe('POST');
  });

  it('keeps only harmless headers: no Authorization, cookies or IP addresses', () => {
    const { request } = scrubEvent(requestEvent());
    expect(request?.headers).toEqual({
      'user-agent': 'LiftBig/3 Android',
      'content-type': 'application/json',
    });
  });

  it('matches header names in any case', () => {
    const event = requestEvent();
    event.request!.headers = {
      Authorization: 'Bearer x',
      Cookie: 'a=b',
      'User-Agent': 'LiftBig/3',
    };
    expect(scrubEvent(event).request?.headers).toEqual({
      'User-Agent': 'LiftBig/3',
    });
  });

  it('keeps only the user id', () => {
    expect(scrubEvent(requestEvent()).user).toEqual({
      id: 'b6f7c1de-0000-4000-8000-000000000001',
    });
  });

  it('drops a user without an id', () => {
    const event = requestEvent();
    event.user = { ip_address: '203.0.113.7' };
    expect(scrubEvent(event).user).toBeUndefined();
  });

  it('drops response headers and local variables in stack frames', () => {
    const event = scrubEvent(requestEvent());
    expect(event.contexts?.response).toEqual({ status_code: 500 });
    const [frame] = event.exception!.values![0].stacktrace!.frames!;
    expect(frame).not.toHaveProperty('vars');
    expect(frame.function).toBe('save');
  });

  it('passes an event without request or user through', () => {
    const event: ErrorEvent = { type: undefined, message: 'boom' };
    expect(scrubEvent(event)).toEqual({ type: undefined, message: 'boom' });
  });
});

describe('scrubBreadcrumb', () => {
  it('drops console breadcrumbs', () => {
    expect(
      scrubBreadcrumb({ category: 'console', message: 'user a@b.co' }),
    ).toBeNull();
  });

  it('keeps an HTTP breadcrumb without its query string', () => {
    const crumb: Breadcrumb = {
      category: 'http',
      data: {
        method: 'POST',
        url: 'https://api.resend.com/emails?to=a%40b.co',
        status_code: 200,
      },
    };
    expect(scrubBreadcrumb(crumb)).toEqual({
      category: 'http',
      data: {
        method: 'POST',
        url: 'https://api.resend.com/emails',
        status_code: 200,
      },
    });
  });
});
