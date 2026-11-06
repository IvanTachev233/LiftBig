const save = jest.fn().mockResolvedValue(undefined);
const del = jest.fn().mockResolvedValue(undefined);
const file = jest.fn(() => ({ save, delete: del }));
const bucket = jest.fn(() => ({ file }));

jest.mock('@google-cloud/storage', () => ({
  Storage: jest.fn().mockImplementation(() => ({ bucket })),
}));

import { GcsBugReportStorage } from './gcs-bug-report-storage';

describe('GcsBugReportStorage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is configured', () => {
    expect(new GcsBugReportStorage('my-bucket').configured).toBe(true);
  });

  it('uploads each screenshot to the bucket with the detected content type', async () => {
    const storage = new GcsBugReportStorage('my-bucket');
    const names = await storage.upload('report-1', [
      { buffer: Buffer.from('a'), contentType: 'image/jpeg' },
      { buffer: Buffer.from('b'), contentType: 'image/png' },
    ]);

    expect(names).toEqual(['report-1/1.jpg', 'report-1/2.png']);
    expect(bucket).toHaveBeenCalledWith('my-bucket');
    expect(file).toHaveBeenNthCalledWith(1, 'report-1/1.jpg');
    expect(file).toHaveBeenNthCalledWith(2, 'report-1/2.png');
    expect(save).toHaveBeenNthCalledWith(1, Buffer.from('a'), {
      contentType: 'image/jpeg',
      resumable: false,
    });
    expect(save).toHaveBeenNthCalledWith(2, Buffer.from('b'), {
      contentType: 'image/png',
      resumable: false,
    });
  });

  it('deletes by object name with ignoreNotFound', async () => {
    const storage = new GcsBugReportStorage('my-bucket');
    await storage.delete(['report-1/1.jpg', 'report-1/2.png']);

    expect(file).toHaveBeenCalledWith('report-1/1.jpg');
    expect(file).toHaveBeenCalledWith('report-1/2.png');
    expect(del).toHaveBeenCalledWith({ ignoreNotFound: true });
    expect(del).toHaveBeenCalledTimes(2);
  });

  it('does not throw when a delete rejects (best-effort)', async () => {
    del.mockRejectedValueOnce(new Error('network error'));
    const storage = new GcsBugReportStorage('my-bucket');
    await expect(storage.delete(['report-1/1.jpg'])).resolves.toBeUndefined();
  });
});
