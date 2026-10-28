import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createE2eApp } from './e2e-app';

// The health check behind the Cloud Run startup probe, the uptime check and
// the pipeline smoke check: no auth, no data, only whether the database answers.
describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('is 200 {status: "ok"} without a token when the database answers', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('is 503 when the database query fails', async () => {
    jest
      .spyOn(app.get(DataSource), 'query')
      .mockRejectedValueOnce(new Error('connection terminated'));

    const res = await request(app.getHttpServer()).get('/health').expect(503);

    expect(res.body).not.toHaveProperty('status', 'ok');
    expect(JSON.stringify(res.body)).not.toContain('connection terminated');
  });
});
