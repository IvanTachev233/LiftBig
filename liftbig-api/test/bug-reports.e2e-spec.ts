import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { BugReport } from '../src/bug-reports/bug-report.entity';
import {
  bugReportStorage,
  createE2eApp,
  E2eUser,
  githubIssueTransport,
  registerAndLogin,
} from './e2e-app';

// Valid signatures for each accepted type (see src/bug-reports/magic-bytes.ts)
const jpegBuffer = (size = 100) =>
  Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.alloc(Math.max(0, size - 4)),
  ]);
const textBuffer = () => Buffer.from('not actually an image, just text');

const validFields = {
  description: 'The app crashed when I tapped Start',
  steps: 'Open a workout, tap Start',
  appVersion: '1.2.3',
  versionCode: '7',
  platform: 'android',
  osVersion: '15',
  deviceModel: 'Pixel 9 Pro',
};

describe('Bug reports (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let client: E2eUser;

  const server = () => app.getHttpServer();
  const post = (user?: E2eUser) => {
    const req = request(server()).post('/bug-reports');
    if (user) req.set('Authorization', `Bearer ${user.token}`);
    return req;
  };
  const send = (
    user: E2eUser,
    fields: Record<string, string> = validFields,
    files: Array<{ field: string; buffer: Buffer; name: string }> = [],
  ) => {
    let req = post(user);
    for (const [key, value] of Object.entries(fields))
      req = req.field(key, value);
    for (const file of files) {
      req = req.attach(file.field, file.buffer, file.name);
    }
    return req;
  };

  beforeAll(async () => {
    app = await createE2eApp();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    client = await registerAndLogin(app);
    githubIssueTransport(app).reset();
    bugReportStorage(app).clear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('401s without a token', async () => {
    await post().field('description', validFields.description).expect(401);
  });

  it('201s with an id, no files', async () => {
    const res = await send(client).expect(201);
    expect(res.body).toHaveProperty('id');
    const row = await dataSource
      .getRepository(BugReport)
      .findOneByOrFail({ id: (res.body as { id: string }).id });
    expect(row.userId).toBe(client.id);
    expect(row.role).toBe('CLIENT');
    expect(row.screenshotNames).toBeNull();
  });

  it('201s with up to 3 screenshots, uploaded to storage in order', async () => {
    const res = await send(client, validFields, [
      { field: 'screenshots', buffer: jpegBuffer(), name: 'a.jpg' },
      { field: 'screenshots', buffer: jpegBuffer(), name: 'b.jpg' },
      { field: 'screenshots', buffer: jpegBuffer(), name: 'c.jpg' },
    ]).expect(201);
    const id = (res.body as { id: string }).id;
    const row = await dataSource
      .getRepository(BugReport)
      .findOneByOrFail({ id });
    expect(row.screenshotNames).toEqual([
      `${id}/1.jpg`,
      `${id}/2.jpg`,
      `${id}/3.jpg`,
    ]);
    expect(bugReportStorage(app).objects.size).toBe(3);
  });

  it('400s on a field out of range (description too short)', async () => {
    await send(client, { ...validFields, description: 'short' }).expect(400);
  });

  it('400s on an invalid platform', async () => {
    await send(client, { ...validFields, platform: 'wristwatch' }).expect(400);
  });

  it('400s on a context field over 100 characters', async () => {
    await send(client, { ...validFields, deviceModel: 'x'.repeat(101) }).expect(
      400,
    );
  });

  it('400s on more than 3 files, storing nothing', async () => {
    const before = await dataSource.getRepository(BugReport).count();
    await send(client, validFields, [
      { field: 'screenshots', buffer: jpegBuffer(), name: 'a.jpg' },
      { field: 'screenshots', buffer: jpegBuffer(), name: 'b.jpg' },
      { field: 'screenshots', buffer: jpegBuffer(), name: 'c.jpg' },
      { field: 'screenshots', buffer: jpegBuffer(), name: 'd.jpg' },
    ]).expect(400);
    expect(await dataSource.getRepository(BugReport).count()).toBe(before);
  });

  it('400s on a file over 5 MB, storing nothing', async () => {
    const before = await dataSource.getRepository(BugReport).count();
    await send(client, validFields, [
      {
        field: 'screenshots',
        buffer: jpegBuffer(6 * 1024 * 1024),
        name: 'big.jpg',
      },
    ]).expect(400);
    expect(await dataSource.getRepository(BugReport).count()).toBe(before);
  });

  it('400s on a .jpg that is really text, storing nothing', async () => {
    const before = await dataSource.getRepository(BugReport).count();
    await send(client, validFields, [
      { field: 'screenshots', buffer: textBuffer(), name: 'fake.jpg' },
    ]).expect(400);
    expect(await dataSource.getRepository(BugReport).count()).toBe(before);
  });

  it('429s on the 6th report in 24h with retryAfterHours, storing nothing new', async () => {
    for (let i = 0; i < 5; i++) {
      await send(client, {
        ...validFields,
        description: `Distinct report number ${i} here`,
      }).expect(201);
    }
    const before = await dataSource.getRepository(BugReport).count();
    const res = await send(client, {
      ...validFields,
      description: 'One report too many right now',
    }).expect(429);
    expect(res.body).toHaveProperty('retryAfterHours');
    expect(
      (res.body as { retryAfterHours: number }).retryAfterHours,
    ).toBeGreaterThan(0);
    expect(await dataSource.getRepository(BugReport).count()).toBe(before);
  });

  it('dedupes a report with the same trimmed description in 24h, adding no row', async () => {
    const first = await send(client, {
      ...validFields,
      description: '  Same bug happens every time  ',
    }).expect(201);
    const before = await dataSource.getRepository(BugReport).count();

    const second = await send(client, {
      ...validFields,
      description: 'Same bug happens every time',
    }).expect(201);

    expect((second.body as { id: string }).id).toBe(
      (first.body as { id: string }).id,
    );
    expect(await dataSource.getRepository(BugReport).count()).toBe(before);
  });

  it('503s and stores nothing when BUG_REPORTS_ENABLED=false', async () => {
    const config = app.get(ConfigService);
    const spy = jest
      .spyOn(config, 'get')
      .mockImplementation((key: string) =>
        key === 'BUG_REPORTS_ENABLED' ? 'false' : process.env[key],
      );
    try {
      const before = await dataSource.getRepository(BugReport).count();
      await send(client).expect(503);
      expect(await dataSource.getRepository(BugReport).count()).toBe(before);
    } finally {
      spy.mockRestore();
    }
  });

  it('still 201s when the GitHub transport throws, with status failed', async () => {
    githubIssueTransport(app).failOnce();
    const res = await send(client).expect(201);
    const row = await dataSource
      .getRepository(BugReport)
      .findOneByOrFail({ id: (res.body as { id: string }).id });
    expect(row.githubStatus).toBe('failed');
  });

  it('creates the GitHub issue and stores its number, ignoring a client-sent role', async () => {
    const res = await send(
      { ...client } as E2eUser,
      { ...validFields, role: 'COACH' } as unknown as Record<string, string>,
    ).expect(201);
    const row = await dataSource
      .getRepository(BugReport)
      .findOneByOrFail({ id: (res.body as { id: string }).id });
    expect(row.githubStatus).toBe('created');
    expect(row.githubIssueNumber).toBe(1);
    expect(row.role).toBe('CLIENT');
    expect(githubIssueTransport(app).created).toHaveLength(1);
  });
});
