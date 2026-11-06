import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../auth/auth-user.interface';
import {
  MAX_FILE_SIZE_BYTES,
  MAX_REPORTS_PER_WINDOW,
  WINDOW_HOURS,
} from './bug-report-limits';
import { BugReport } from './bug-report.entity';
import { CreateBugReportDto } from './dto/create-bug-report.dto';
import { GithubIssueTransport } from './github/github-issue.transport';
import {
  buildIssueBody,
  buildIssueLabels,
  buildIssueTitle,
} from './github/issue-builder';
import { detectImageType } from './magic-bytes';
import {
  BugReportStorageService,
  UploadedScreenshot,
} from './storage/bug-report-storage.service';

export interface UploadedFile {
  buffer: Buffer;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class BugReportsService {
  private readonly logger = new Logger('BugReports');

  constructor(
    @InjectRepository(BugReport)
    private readonly bugReports: Repository<BugReport>,
    private readonly storage: BugReportStorageService,
    private readonly github: GithubIssueTransport,
    private readonly config: ConfigService,
  ) {}

  /**
   * Saves the row, then uploads screenshots and creates the GitHub issue;
   * a storage or GitHub failure still answers 201 (see fileIssue/upload).
   */
  async create(
    user: AuthUser,
    dto: CreateBugReportDto,
    files: UploadedFile[],
  ): Promise<{ id: string }> {
    if (this.config.get<string>('BUG_REPORTS_ENABLED') === 'false') {
      throw new HttpException(
        'Bug reports are turned off right now',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const screenshots = this.validateScreenshots(files);
    // Already trimmed and length-checked by CreateBugReportDto
    const description = dto.description;
    const windowStart = new Date(Date.now() - WINDOW_HOURS * 3600_000);

    const duplicate = await this.bugReports.findOne({
      where: { userId: user.id, description },
      order: { createdAt: 'DESC' },
    });
    if (duplicate && duplicate.createdAt >= windowStart) {
      return { id: duplicate.id };
    }

    await this.checkRateLimit(user.id, windowStart);

    const row = await this.bugReports.save({
      userId: user.id,
      description,
      steps: dto.steps?.trim() || null,
      appVersion: dto.appVersion ?? null,
      versionCode: dto.versionCode ?? null,
      platform: dto.platform,
      osVersion: dto.osVersion ?? null,
      deviceModel: dto.deviceModel ?? null,
      role: user.role,
      screenshotNames: null,
      githubIssueNumber: null,
      githubStatus: 'pending',
      createdAt: new Date(),
    });

    const screenshotNames = await this.uploadScreenshots(row.id, screenshots);
    if (screenshotNames.length) {
      await this.bugReports.update(row.id, { screenshotNames });
    }

    await this.fileIssue({ ...row, screenshotNames });

    return { id: row.id };
  }

  /** Retries every `pending`/`failed` row; skipped (not called) without a token */
  async resyncPendingAndFailed(): Promise<{
    checked: number;
    updated: number;
  }> {
    if (!this.github.enabled) return { checked: 0, updated: 0 };

    const rows = await this.bugReports.find({
      where: [{ githubStatus: 'pending' }, { githubStatus: 'failed' }],
    });
    let updated = 0;
    for (const row of rows) {
      if (await this.fileIssue(row)) updated++;
    }
    return { checked: rows.length, updated };
  }

  private validateScreenshots(files: UploadedFile[]): UploadedScreenshot[] {
    return (files ?? []).map((file) => {
      if (file.buffer.length > MAX_FILE_SIZE_BYTES) {
        throw new BadRequestException(
          'Each screenshot must be 5 MB or smaller',
        );
      }
      const contentType = detectImageType(file.buffer);
      if (!contentType) {
        throw new BadRequestException(
          'Screenshots must be JPEG, PNG or WebP images',
        );
      }
      return { buffer: file.buffer, contentType };
    });
  }

  private async checkRateLimit(
    userId: string,
    windowStart: Date,
  ): Promise<void> {
    const recent = await this.bugReports.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    const inWindow = recent.filter((report) => report.createdAt >= windowStart);
    if (inWindow.length < MAX_REPORTS_PER_WINDOW) return;

    const oldest = inWindow[0];
    const retryAfterHours = Math.max(
      1,
      Math.ceil(
        (oldest.createdAt.getTime() + WINDOW_HOURS * 3600_000 - Date.now()) /
          3600_000,
      ),
    );
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: "You've sent a lot of reports today. Try again tomorrow.",
        retryAfterHours,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private async uploadScreenshots(
    reportId: string,
    screenshots: UploadedScreenshot[],
  ): Promise<string[]> {
    if (screenshots.length === 0) return [];
    try {
      return await this.storage.upload(reportId, screenshots);
    } catch (error) {
      this.logger.error(
        `Screenshot upload failed for report ${reportId}: ${errorMessage(error)}`,
      );
      return [];
    }
  }

  /** Creates the issue (or sets status `disabled`); returns whether it was created */
  private async fileIssue(row: BugReport): Promise<boolean> {
    if (!this.github.enabled) {
      if (row.githubStatus !== 'disabled') {
        await this.bugReports.update(row.id, { githubStatus: 'disabled' });
      }
      return false;
    }
    try {
      const title = buildIssueTitle(row.description);
      const body = buildIssueBody({
        description: row.description,
        steps: row.steps,
        appVersion: row.appVersion,
        versionCode: row.versionCode,
        platform: row.platform,
        osVersion: row.osVersion,
        deviceModel: row.deviceModel,
        role: row.role,
        reportId: row.id,
        screenshotNames: row.screenshotNames ?? [],
        bucketName: this.config.get<string>('BUG_REPORT_BUCKET') ?? null,
      });
      const labels = buildIssueLabels(row.platform);
      const issue = await this.github.createIssue({ title, body, labels });
      await this.bugReports.update(row.id, {
        githubIssueNumber: issue.number,
        githubStatus: 'created',
      });
      return true;
    } catch (error) {
      this.logger.error(
        `GitHub issue creation failed for report ${row.id}: ${errorMessage(error)}`,
      );
      await this.bugReports.update(row.id, { githubStatus: 'failed' });
      return false;
    }
  }
}
