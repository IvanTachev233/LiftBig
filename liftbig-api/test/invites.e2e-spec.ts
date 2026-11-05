import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2eApp, E2eUser, registerAndLogin } from './e2e-app';

describe('Coach invites (e2e)', () => {
  let app: INestApplication<App>;
  let coach: E2eUser;

  const invite = (body: object) =>
    request(app.getHttpServer())
      .post('/auth/invites')
      .set('Authorization', `Bearer ${coach.token}`)
      .send(body);

  beforeAll(async () => {
    app = await createE2eApp();
  });

  beforeEach(async () => {
    coach = await registerAndLogin(app, 'COACH');
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a pending invite for an email', async () => {
    const res = await invite({ email: 'client@example.com' }).expect(201);
    expect(res.body).toMatchObject({
      clientEmail: 'client@example.com',
      status: 'PENDING',
    });
  });

  it('answers 400, not 500, without an email', async () => {
    const res = await invite({}).expect(400);
    expect((res.body as { message: string[] }).message).toEqual([
      'email must be an email',
    ]);
  });

  it('answers 400 for a value that is not an email', async () => {
    await invite({ email: 'not-an-email' }).expect(400);
    await invite({ email: ['client@example.com'] }).expect(400);
  });
});
