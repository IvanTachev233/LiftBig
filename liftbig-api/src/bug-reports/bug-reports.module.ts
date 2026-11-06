import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { BugReport } from './bug-report.entity';
import { BugReportsController } from './bug-reports.controller';
import { BugReportsService } from './bug-reports.service';
import { createGithubIssueTransport } from './github/github-transport.factory';
import { GithubIssueTransport } from './github/github-issue.transport';
import { BugReportStorageModule } from './storage/bug-report-storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BugReport]),
    AuthModule,
    BugReportStorageModule,
  ],
  controllers: [BugReportsController],
  providers: [
    BugReportsService,
    {
      provide: GithubIssueTransport,
      useFactory: (config: ConfigService) =>
        createGithubIssueTransport((name) => config.get<string>(name)),
      inject: [ConfigService],
    },
  ],
  exports: [BugReportsService],
})
export class BugReportsModule {}
