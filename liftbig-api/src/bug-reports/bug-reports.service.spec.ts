import { BugReportsService } from './bug-reports.service';

function makeRepo(rows: Array<Record<string, unknown>>) {
  return {
    find: jest.fn().mockResolvedValue(rows),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
  };
}

describe('BugReportsService.resyncPendingAndFailed', () => {
  it('skips entirely without a token (github disabled)', async () => {
    const repo = makeRepo([]);
    const github = { enabled: false, createIssue: jest.fn() };
    const service = new BugReportsService(
      repo as never,
      { configured: false } as never,
      github as never,
      { get: () => undefined } as never,
    );

    const result = await service.resyncPendingAndFailed();

    expect(result).toEqual({ checked: 0, updated: 0 });
    expect(repo.find).not.toHaveBeenCalled();
    expect(github.createIssue).not.toHaveBeenCalled();
  });

  it('retries pending/failed rows and updates the ones that succeed', async () => {
    const rows = [
      {
        id: 'r1',
        description: 'desc',
        steps: null,
        appVersion: '1.0',
        versionCode: 1,
        platform: 'android',
        osVersion: '15',
        deviceModel: 'Pixel',
        role: 'CLIENT',
        screenshotNames: [],
        githubStatus: 'failed',
      },
      {
        id: 'r2',
        description: 'desc 2',
        steps: null,
        appVersion: '1.0',
        versionCode: 1,
        platform: 'ios',
        osVersion: '18',
        deviceModel: 'iPhone',
        role: 'COACH',
        screenshotNames: [],
        githubStatus: 'pending',
      },
    ];
    const repo = makeRepo(rows);
    const github = {
      enabled: true,
      createIssue: jest
        .fn()
        .mockResolvedValueOnce({ number: 10 })
        .mockRejectedValueOnce(new Error('still down')),
    };
    const service = new BugReportsService(
      repo as never,
      { configured: false } as never,
      github as never,
      { get: () => undefined } as never,
    );

    const result = await service.resyncPendingAndFailed();

    expect(repo.find).toHaveBeenCalledWith({
      where: [{ githubStatus: 'pending' }, { githubStatus: 'failed' }],
    });
    expect(github.createIssue).toHaveBeenCalledTimes(2);
    expect(repo.update).toHaveBeenCalledWith('r1', {
      githubIssueNumber: 10,
      githubStatus: 'created',
    });
    expect(repo.update).toHaveBeenCalledWith('r2', { githubStatus: 'failed' });
    expect(result).toEqual({ checked: 2, updated: 1 });
  });
});
