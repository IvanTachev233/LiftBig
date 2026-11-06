import { createBugReportStorage } from './bug-report-storage.factory';
import { GcsBugReportStorage } from './gcs-bug-report-storage';
import { NoneBugReportStorage } from './none-bug-report-storage';

const env =
  (values: Record<string, string>) =>
  (name: string): string | undefined =>
    values[name];

describe('createBugReportStorage', () => {
  it('uses GCS when BUG_REPORT_BUCKET is set', () => {
    const storage = createBugReportStorage(
      env({ BUG_REPORT_BUCKET: 'my-bucket' }),
    );
    expect(storage).toBeInstanceOf(GcsBugReportStorage);
    expect(storage.configured).toBe(true);
  });

  it('uses none without a bucket', () => {
    expect(createBugReportStorage(env({}))).toBeInstanceOf(
      NoneBugReportStorage,
    );
  });
});

describe('NoneBugReportStorage', () => {
  it('is not configured, uploads nothing and ignores delete', async () => {
    const storage = new NoneBugReportStorage();
    expect(storage.configured).toBe(false);
    await expect(
      storage.upload('report-1', [
        { buffer: Buffer.from('x'), contentType: 'image/jpeg' },
      ]),
    ).resolves.toEqual([]);
    await expect(storage.delete(['report-1/1.jpg'])).resolves.toBeUndefined();
  });
});
