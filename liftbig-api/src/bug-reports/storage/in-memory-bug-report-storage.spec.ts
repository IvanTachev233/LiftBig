import { InMemoryBugReportStorage } from './in-memory-bug-report-storage';

describe('InMemoryBugReportStorage', () => {
  it('names objects "<reportId>/<n>.<ext>" by detected type, in order', async () => {
    const storage = new InMemoryBugReportStorage();
    const names = await storage.upload('report-1', [
      { buffer: Buffer.from('a'), contentType: 'image/jpeg' },
      { buffer: Buffer.from('b'), contentType: 'image/png' },
    ]);
    expect(names).toEqual(['report-1/1.jpg', 'report-1/2.png']);
    expect(storage.objects.has('report-1/1.jpg')).toBe(true);
    expect(storage.objects.has('report-1/2.png')).toBe(true);
  });

  it('deletes by object name', async () => {
    const storage = new InMemoryBugReportStorage();
    await storage.upload('report-1', [
      { buffer: Buffer.from('a'), contentType: 'image/jpeg' },
    ]);
    await storage.delete(['report-1/1.jpg']);
    expect(storage.objects.has('report-1/1.jpg')).toBe(false);
    expect(storage.deletedNames).toEqual(['report-1/1.jpg']);
  });

  it('clear empties everything', async () => {
    const storage = new InMemoryBugReportStorage();
    await storage.upload('report-1', [
      { buffer: Buffer.from('a'), contentType: 'image/jpeg' },
    ]);
    storage.clear();
    expect(storage.objects.size).toBe(0);
    expect(storage.deletedNames).toEqual([]);
  });
});
