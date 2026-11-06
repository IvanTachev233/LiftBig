import { extensionFor } from '../magic-bytes';
import {
  BugReportStorageService,
  UploadedScreenshot,
} from './bug-report-storage.service';

// Keeps screenshots in memory; for tests, in place of the GCS transport
// (same pattern as InMemoryMailTransport).
export class InMemoryBugReportStorage extends BugReportStorageService {
  readonly configured = true;
  readonly objects = new Map<string, UploadedScreenshot>();
  readonly deletedNames: string[] = [];

  upload(
    reportId: string,
    screenshots: UploadedScreenshot[],
  ): Promise<string[]> {
    const names = screenshots.map((screenshot, i) => {
      const name = `${reportId}/${i + 1}.${extensionFor(screenshot.contentType)}`;
      this.objects.set(name, screenshot);
      return name;
    });
    return Promise.resolve(names);
  }

  delete(objectNames: string[]): Promise<void> {
    for (const name of objectNames) {
      this.objects.delete(name);
      this.deletedNames.push(name);
    }
    return Promise.resolve();
  }

  clear(): void {
    this.objects.clear();
    this.deletedNames.length = 0;
  }
}
