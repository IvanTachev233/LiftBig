import { Storage } from '@google-cloud/storage';
import { Logger } from '@nestjs/common';
import { extensionFor } from '../magic-bytes';
import {
  BugReportStorageService,
  UploadedScreenshot,
} from './bug-report-storage.service';

// Uploads to a private GCS bucket as "<reportId>/<n>.<ext>" (europe-west2,
// 90-day lifecycle rule set up by B1's gcp-setup.sh). Uses Application
// Default Credentials: no key file, works on Cloud Run with the service
// account's IAM role on this bucket only.
export class GcsBugReportStorage extends BugReportStorageService {
  readonly configured = true;
  private readonly logger = new Logger('BugReports');
  private readonly storage = new Storage();

  constructor(private readonly bucketName: string) {
    super();
  }

  async upload(
    reportId: string,
    screenshots: UploadedScreenshot[],
  ): Promise<string[]> {
    const names: string[] = [];
    for (const [i, screenshot] of screenshots.entries()) {
      const name = `${reportId}/${i + 1}.${extensionFor(screenshot.contentType)}`;
      await this.storage
        .bucket(this.bucketName)
        .file(name)
        .save(screenshot.buffer, {
          contentType: screenshot.contentType,
          resumable: false,
        });
      names.push(name);
    }
    return names;
  }

  async delete(objectNames: string[]): Promise<void> {
    await Promise.all(
      objectNames.map(async (name) => {
        try {
          await this.storage
            .bucket(this.bucketName)
            .file(name)
            .delete({ ignoreNotFound: true });
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          this.logger.error(`Could not delete screenshot ${name}: ${reason}`);
        }
      }),
    );
  }
}
