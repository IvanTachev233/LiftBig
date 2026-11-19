import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { FeatureFlag } from '../src/feature-flags/feature-flag.entity';
import { createE2eApp, E2eUser, registerAndLogin } from './e2e-app';

// L3a: the vision flag in GET /users/me. See notes/spec.md § Tier 3 Vision
// pilot › Who can use it.
describe('Feature flags (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const getMe = (user: E2eUser) =>
    request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${user.token}`);

  beforeAll(async () => {
    app = await createE2eApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('shows vision=false for a new account with no row', async () => {
    const user = await registerAndLogin(app);
    const body = (await getMe(user).expect(200)).body as {
      flags: { vision: boolean };
    };
    expect(body.flags).toEqual({ vision: false });
  });

  it('shows vision=true only for the user whose row is enabled', async () => {
    const userA = await registerAndLogin(app);
    const userB = await registerAndLogin(app);
    await dataSource.getRepository(FeatureFlag).save({
      userId: userA.id,
      flag: 'vision',
      enabled: true,
      createdAt: new Date(),
    });

    const bodyA = (await getMe(userA).expect(200)).body as {
      flags: { vision: boolean };
    };
    const bodyB = (await getMe(userB).expect(200)).body as {
      flags: { vision: boolean };
    };
    expect(bodyA.flags).toEqual({ vision: true });
    expect(bodyB.flags).toEqual({ vision: false });
  });

  it('shows vision=false for a disabled row', async () => {
    const user = await registerAndLogin(app);
    await dataSource.getRepository(FeatureFlag).save({
      userId: user.id,
      flag: 'vision',
      enabled: false,
      createdAt: new Date(),
    });

    const body = (await getMe(user).expect(200)).body as {
      flags: { vision: boolean };
    };
    expect(body.flags).toEqual({ vision: false });
  });
});
