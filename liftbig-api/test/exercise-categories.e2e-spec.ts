import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Exercise } from '../src/workouts/entities/exercise.entity';
import { ProgramSeeder } from '../src/programs/program-seeder';
import { SEED_EXERCISE_LIST } from '../src/programs/seed/seed-exercises';
import { createE2eApp, registerAndLogin } from './e2e-app';

type Tags = Pick<Exercise, 'category' | 'equipment'>;

const tagsOf = async (repo: Repository<Exercise>) =>
  Object.fromEntries(
    (await repo.find({ where: { createdById: IsNull() } })).map((e) => [
      e.name,
      { category: e.category, equipment: e.equipment },
    ]),
  ) as Record<string, Tags>;

describe('Exercise categories (e2e)', () => {
  const seedSetting = process.env.SEED_PROGRAMS;

  afterEach(() => {
    if (seedSetting === undefined) delete process.env.SEED_PROGRAMS;
    else process.env.SEED_PROGRAMS = seedSetting;
  });

  describe('on a fresh database', () => {
    let app: INestApplication<App>;
    let repo: Repository<Exercise>;

    beforeAll(async () => {
      delete process.env.SEED_PROGRAMS;
      app = await createE2eApp();
      repo = app.get(DataSource).getRepository(Exercise);
    });

    afterAll(async () => {
      await app.close();
    });

    it('gives every seeded global a category and equipment', async () => {
      const tags = await tagsOf(repo);
      expect(Object.keys(tags).length).toBeGreaterThan(0);
      expect(tags).toMatchObject({
        'Back Squat': { category: 'Squat', equipment: 'Barbell' },
        'Pause Squat': { category: 'Squat', equipment: 'Barbell' },
        Clean: { category: 'Olympic', equipment: 'Barbell' },
        'Clean Pull': { category: 'Olympic', equipment: 'Barbell' },
        'Push Press': { category: 'Press', equipment: 'Barbell' },
        'Bench Press': { category: 'Press', equipment: 'Barbell' },
        Deadlift: { category: 'Pull', equipment: 'Barbell' },
        'Barbell Row': { category: 'Pull', equipment: 'Barbell' },
      });
      // Category may be null: the "Other" exercises (A6f) have none
      for (const [name, t] of Object.entries(tags)) {
        expect([name, t.equipment]).toEqual([name, expect.any(String)]);
      }
    });

    it('seeds each exercise in exercises.json once, as the file gives it', async () => {
      const globals = await repo.find({
        where: { createdById: IsNull() },
        order: { name: 'ASC' },
      });
      // Takes database rows and file entries alike
      const fields = (
        e: Pick<
          Exercise,
          | 'name'
          | 'bodyPart'
          | 'category'
          | 'equipment'
          | 'videoUrl'
          | 'imageUrl'
        >,
      ) => [
        e.name,
        e.bodyPart,
        e.category,
        e.equipment,
        e.videoUrl,
        e.imageUrl,
      ];
      expect(globals.map(fields)).toEqual(
        [...SEED_EXERCISE_LIST]
          .sort((a, b) => (a.name < b.name ? -1 : 1))
          .map(fields),
      );
    });

    it('lists the category and equipment with each exercise; a coach-made one has none', async () => {
      const coach = await registerAndLogin(app, 'COACH');
      const created = await request(app.getHttpServer())
        .post('/workouts/exercises')
        .set('Authorization', `Bearer ${coach.token}`)
        .send({ name: 'Sled Push', equipment: 'Sled' })
        .expect(201);
      expect(created.body).toMatchObject({ category: null, equipment: null });

      const list = (
        await request(app.getHttpServer())
          .get('/workouts/exercises')
          .set('Authorization', `Bearer ${coach.token}`)
          .expect(200)
      ).body as (Exercise & Tags)[];
      expect(list.find((e) => e.name === 'Front Squat')).toMatchObject({
        category: 'Squat',
        equipment: 'Barbell',
      });
      expect(list.find((e) => e.name === 'Sled Push')).toMatchObject({
        category: null,
        equipment: null,
      });
    });

    it('lets a coach give an own exercise one of the categories', async () => {
      const coach = await registerAndLogin(app, 'COACH');
      const post = (body: object) =>
        request(app.getHttpServer())
          .post('/workouts/exercises')
          .set('Authorization', `Bearer ${coach.token}`)
          .send(body);
      const res = await post({
        name: 'Zercher Squat',
        category: 'Squat',
      }).expect(201);
      expect(res.body).toMatchObject({ category: 'Squat', equipment: null });
      await post({ name: 'Cleanless', category: null }).expect(201);
      for (const category of ['Cardio', 'squat', '', 7]) {
        await post({ name: `Bad ${String(category)}`, category }).expect(400);
      }
      const stored = await repo.findOneByOrFail({
        id: (res.body as Exercise).id,
      });
      expect(stored.category).toBe('Squat');
    });

    it('changes nothing on a second run', async () => {
      const before = await tagsOf(repo);
      const result = await app.get(ProgramSeeder).seed();
      expect(result.tagged).toBe(0);
      expect(await tagsOf(repo)).toEqual(before);
    });
  });

  it('fills a missing video and image from the file and keeps ones already set', async () => {
    process.env.SEED_PROGRAMS = 'false';
    // The shipped file has no media yet, so two entries get some for this test
    const entry = (name: string) => {
      const found = SEED_EXERCISE_LIST.find((e) => e.name === name);
      if (!found) throw new Error(`${name} is not in exercises.json`);
      return found;
    };
    const squat = entry('Back Squat');
    const plank = entry('Plank');
    const fileMedia = {
      videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      imageUrl: 'https://example.com/back-squat.jpg',
    };
    Object.assign(squat, fileMedia);
    Object.assign(plank, fileMedia);
    const app = await createE2eApp();
    try {
      const repo = app.get(DataSource).getRepository(Exercise);
      const existing = await repo.save({
        name: 'PLANK',
        createdById: null,
        videoUrl: 'https://vimeo.com/123',
      });
      const coach = await registerAndLogin(app, 'COACH');
      const own = await repo.save({
        name: 'Back Squat',
        createdById: coach.id,
      });

      await app.get(ProgramSeeder).seed();

      expect(
        await repo.findOneByOrFail({
          name: 'Back Squat',
          createdById: IsNull(),
        }),
      ).toMatchObject(fileMedia);
      expect(await repo.findOneByOrFail({ id: existing.id })).toMatchObject({
        videoUrl: 'https://vimeo.com/123',
        imageUrl: fileMedia.imageUrl,
      });
      expect(await repo.findOneByOrFail({ id: own.id })).toMatchObject({
        videoUrl: null,
        imageUrl: null,
      });
      expect((await app.get(ProgramSeeder).seed()).tagged).toBe(0);
    } finally {
      Object.assign(squat, { videoUrl: null, imageUrl: null });
      Object.assign(plank, { videoUrl: null, imageUrl: null });
      await app.close();
    }
  });

  it('keeps a global the file adds when it already exists in another case', async () => {
    process.env.SEED_PROGRAMS = 'false';
    const app = await createE2eApp();
    try {
      const repo = app.get(DataSource).getRepository(Exercise);
      const rdl = await repo.save({
        name: 'romanian DEADLIFT',
        createdById: null,
      });
      const plank = await repo.save({ name: 'PLANK', createdById: null });

      await app.get(ProgramSeeder).seed();

      const sameName = (name: string) =>
        repo
          .createQueryBuilder('e')
          .where('LOWER(e.name) = LOWER(:name)', { name })
          .andWhere('e.createdById IS NULL')
          .getCount();
      expect(await sameName('Romanian Deadlift')).toBe(1);
      expect(await sameName('Plank')).toBe(1);
      expect(await repo.findOneByOrFail({ id: rdl.id })).toMatchObject({
        name: 'romanian DEADLIFT',
        category: 'Pull',
        equipment: 'Barbell',
      });
      expect(await repo.findOneByOrFail({ id: plank.id })).toMatchObject({
        category: null,
        equipment: 'Bodyweight',
      });
      expect((await app.get(ProgramSeeder).seed()).tagged).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('fills globals that exist without them, whatever their case, and keeps set values', async () => {
    process.env.SEED_PROGRAMS = 'false';
    const app = await createE2eApp();
    try {
      const dataSource = app.get(DataSource);
      const repo = dataSource.getRepository(Exercise);
      const older = await repo.save({
        name: 'POWER CLEAN AND JERK',
        createdById: null,
      });
      const bench = await repo.save({ name: 'bench press', createdById: null });
      const kept = await repo.save({
        name: 'Deadlift',
        createdById: null,
        category: 'Squat',
      });
      const coach = await registerAndLogin(app, 'COACH');
      const own = await repo.save({
        name: 'Back Squat',
        createdById: coach.id,
      });

      const first = await app.get(ProgramSeeder).seed();
      expect(first.tagged).toBeGreaterThan(0);

      const byId = (id: string) => repo.findOneByOrFail({ id });
      expect(await byId(older.id)).toMatchObject({
        category: 'Olympic',
        equipment: 'Barbell',
      });
      expect(await byId(bench.id)).toMatchObject({
        category: 'Press',
        equipment: 'Barbell',
      });
      expect(await byId(kept.id)).toMatchObject({
        category: 'Squat',
        equipment: 'Barbell',
      });
      expect(await byId(own.id)).toMatchObject({
        category: null,
        equipment: null,
      });

      const before = await tagsOf(repo);
      expect((await app.get(ProgramSeeder).seed()).tagged).toBe(0);
      expect(await tagsOf(repo)).toEqual(before);
    } finally {
      await app.close();
    }
  });
});
