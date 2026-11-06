import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createBugReportStorage } from './bug-report-storage.factory';
import { BugReportStorageService } from './bug-report-storage.service';

// Shared by BugReportsModule (uploads) and UsersModule (account deletion),
// so neither module depends on the other.
@Module({
  providers: [
    {
      provide: BugReportStorageService,
      useFactory: (config: ConfigService) =>
        createBugReportStorage((name) => config.get<string>(name)),
      inject: [ConfigService],
    },
  ],
  exports: [BugReportStorageService],
})
export class BugReportStorageModule {}
