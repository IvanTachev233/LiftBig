import { BugReportStorageService } from './bug-report-storage.service';
import { GcsBugReportStorage } from './gcs-bug-report-storage';
import { NoneBugReportStorage } from './none-bug-report-storage';

// GCS when BUG_REPORT_BUCKET is set, else none (local runs, CI; tests
// override the provider with InMemoryBugReportStorage instead).
export function createBugReportStorage(
  env: (name: string) => string | undefined,
): BugReportStorageService {
  const bucket = env('BUG_REPORT_BUCKET');
  if (!bucket) return new NoneBugReportStorage();
  return new GcsBugReportStorage(bucket);
}
