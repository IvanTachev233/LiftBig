// Sends one test error through the API's own Sentry setup (src/instrument.ts,
// the global filter and the scrubber in src/common/sentry.ts), from a request
// that carries a body, an Authorization header, a cookie, an IP header and a
// query string. In Sentry, the event must show none of them, and the user only
// as the id "sentry-test-user".
//
//   SENTRY_DSN=<dsn> npx ts-node scripts/sentry-test-event.ts
import '../src/instrument';
import { Controller, Module, Post } from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';

@Controller()
class TestEventController {
  @Post('sentry-test')
  fail(): never {
    // What JwtStrategy sets, plus a field the scrubber must drop. Built at
    // runtime: the report carries these source lines as context.
    Sentry.setUser({
      id: 'sentry-test-user',
      email: ['test', 'example.com'].join('@'),
    });
    throw new Error('LiftBig Sentry test event');
  }
}

@Module({
  imports: [SentryModule.forRoot()],
  controllers: [TestEventController],
  providers: [{ provide: APP_FILTER, useClass: SentryGlobalFilter }],
})
class TestEventModule {}

async function main(): Promise<void> {
  if (!Sentry.getClient()) {
    console.error('SENTRY_DSN is not set (environment or .env); nothing sent.');
    process.exitCode = 1;
    return;
  }
  const app = await NestFactory.create(TestEventModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const res = await fetch(`${url}/sentry-test?email=test%40example.com`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-token-must-not-appear',
      Cookie: 'session=test-cookie-must-not-appear',
      'X-Forwarded-For': '203.0.113.7',
    },
    body: JSON.stringify({ notes: 'test body must not appear' }),
  });
  console.log(`POST /sentry-test answered ${res.status}`);

  const sent = await Sentry.flush(10_000);
  await app.close();
  console.log(
    sent
      ? 'Sent. Find "LiftBig Sentry test event" in Sentry → Issues.'
      : 'Not confirmed within 10 s; check the DSN and the network.',
  );
}

void main();
