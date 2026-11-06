import { DetectedImageType } from '../magic-bytes';

export interface UploadedScreenshot {
  buffer: Buffer;
  contentType: DetectedImageType;
}

/**
 * Stores (and deletes) a report's screenshots; also the injection token for
 * the transport in use. `configured` is false when there is nowhere to
 * store screenshots (no bucket), so the issue body can say so.
 */
export abstract class BugReportStorageService {
  abstract readonly configured: boolean;

  /** Object names, same order as `screenshots`; [] when there is nothing to store */
  abstract upload(
    reportId: string,
    screenshots: UploadedScreenshot[],
  ): Promise<string[]>;

  abstract delete(objectNames: string[]): Promise<void>;
}
