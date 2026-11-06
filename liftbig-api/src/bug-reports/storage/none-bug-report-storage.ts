import {
  BugReportStorageService,
  UploadedScreenshot,
} from './bug-report-storage.service';

// No bucket configured (local runs, CI, tests without an override): nothing
// is kept, and the issue says so (see buildIssueBody).
export class NoneBugReportStorage extends BugReportStorageService {
  readonly configured = false;

  /* eslint-disable @typescript-eslint/no-unused-vars */
  upload(
    reportId: string,
    screenshots: UploadedScreenshot[],
  ): Promise<string[]> {
    return Promise.resolve([]);
  }

  delete(objectNames: string[]): Promise<void> {
    return Promise.resolve();
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */
}
