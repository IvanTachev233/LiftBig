// `npm run bug-reports:resync`: retries creating a GitHub issue for every
// `pending`/`failed` bug_report row (e.g. after a GitHub outage). Skips
// entirely without GITHUB_FEEDBACK_TOKEN.
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { BugReportsService } from './bug-reports.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const service = app.get(BugReportsService);
    const { checked, updated } = await service.resyncPendingAndFailed();
    Logger.log(
      `Resynced ${updated} of ${checked} pending/failed report(s)`,
      'BugReportsResync',
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  Logger.error(
    error instanceof Error ? error.message : String(error),
    'BugReportsResync',
  );
  process.exitCode = 1;
});
